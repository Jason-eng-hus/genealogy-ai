import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createErrorHandler,
  requestIdMiddleware,
} from '../src/lib/http.ts';
import { createLogger } from '../src/lib/logger.ts';
import {
  validateBody,
  validateParams,
} from '../src/middleware/validate.ts';

const bodySchema = z.strictObject({
  name: z.string().trim().min(2),
  age: z.coerce.number().int().positive(),
  active: z.boolean().default(true),
});

const paramsSchema = z.strictObject({
  id: z.string().regex(/^\d+$/),
});

function createValidationApp(): express.Express {
  const app = express();

  app.use(requestIdMiddleware());
  app.use(express.json());
  app.post('/body', validateBody(bodySchema), (req, res) => {
    res.status(200).json({ data: req.body as unknown });
  });
  app.get('/params/:id', validateParams(paramsSchema), (req, res) => {
    res.status(200).json({ data: req.params });
  });
  app.use(
    createErrorHandler({
      logger: createLogger({ level: 'silent', appEnv: 'test' }),
    }),
  );

  return app;
}

const app = createValidationApp();

describe('zod 校验中间件', () => {
  it('解析请求体并用 schema 输出替换原始值', async () => {
    const response = await request(app)
      .post('/body')
      .send({ name: '  张三  ', age: '30' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      name: '张三',
      age: 30,
      active: true,
    });
  });

  it('拒绝未知字段', async () => {
    const response = await request(app)
      .post('/body')
      .send({ name: '张三', age: 30, extra: true });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unrecognized_keys' }),
      ]),
    );
  });

  it('返回字段级错误且带 requestId', async () => {
    const response = await request(app)
      .post('/body')
      .set('X-Request-Id', 'validation-test-1')
      .send({ name: 'a', age: -1 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('Request input is invalid.');
    expect(response.body.requestId).toBe('validation-test-1');
    expect(response.headers['x-request-id']).toBe('validation-test-1');
    expect(response.body.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name' }),
        expect.objectContaining({ path: 'age' }),
      ]),
    );
  });

  it('缺少请求体时返回 400', async () => {
    const response = await request(app).post('/body');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('校验路径参数并传递解析后的值', async () => {
    const response = await request(app).get('/params/42');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id: '42' });
  });

  it('非法路径参数返回 400', async () => {
    const response = await request(app).get('/params/not-a-number');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.data.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
    );
  });
});
