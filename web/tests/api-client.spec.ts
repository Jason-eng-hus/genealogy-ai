import type { AxiosRequestConfig } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ApiError,
  apiClient,
  configureApiClient,
  request,
  resetApiClient,
} from '@/api/client';
import { fetchHealth } from '@/api/health';
import { resolveApiBaseUrl } from '@/config';

let mock: MockAdapter;

function okEnvelope<T>(data: T) {
  return {
    code: 'OK',
    message: 'OK',
    data,
  };
}

function readHeader(
  config: AxiosRequestConfig | undefined,
  name: string,
): unknown {
  const headers = config?.headers;

  if (headers === undefined) {
    return undefined;
  }

  const getter = (headers as { get?: unknown }).get;

  if (typeof getter === 'function') {
    return (headers as { get: (headerName: string) => unknown }).get(
      name,
    );
  }

  return (headers as Record<string, unknown>)[name];
}

beforeEach(() => {
  resetApiClient();
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
  resetApiClient();
  vi.restoreAllMocks();
});

describe('resolveApiBaseUrl', () => {
  it('使用默认基址并去除尾部斜杠', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api/v1');
    expect(resolveApiBaseUrl('')).toBe('/api/v1');
    expect(resolveApiBaseUrl('   ')).toBe('/api/v1');
    expect(resolveApiBaseUrl('  /custom/api///  ')).toBe(
      '/custom/api',
    );
  });
});

describe('API 客户端', () => {
  it('解包成功响应并携带同源请求头', async () => {
    mock.onGet('/health').reply(200, okEnvelope({ status: 'ok' }));

    const data = await request<{ status: string }>({
      url: '/health',
      method: 'GET',
    });

    expect(data).toEqual({ status: 'ok' });

    const history = mock.history.get[0];
    expect(history?.baseURL).toBe('/api/v1');
    expect(readHeader(history, 'X-Requested-With')).toBe(
      'XMLHttpRequest',
    );
  });

  it('允许运行期覆盖 API 基址', async () => {
    configureApiClient({ baseURL: '/custom/api/' });
    mock.onGet('/ping').reply(200, okEnvelope('pong'));

    await expect(
      request({ url: '/ping', method: 'GET' }),
    ).resolves.toBe('pong');
    expect(mock.history.get[0]?.baseURL).toBe('/custom/api');
  });

  it('将服务端错误映射为带错误码与 requestId 的 ApiError', async () => {
    mock.onPost('/persons').reply(409, {
      code: 'CONFLICT_VERSION',
      message: '数据已被他人修改。',
      data: { expectedVersion: 2, actualVersion: 3 },
      requestId: 'req-409',
    });

    const error = await request({
      url: '/persons',
      method: 'POST',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);

    const apiError = error as ApiError;
    expect(apiError.code).toBe('CONFLICT_VERSION');
    expect(apiError.status).toBe(409);
    expect(apiError.requestId).toBe('req-409');
    expect(apiError.details).toEqual({
      expectedVersion: 2,
      actualVersion: 3,
    });
  });

  it('401 时调用可配置的未授权钩子', async () => {
    const unauthorizedHandler = vi.fn();
    configureApiClient({ unauthorizedHandler });
    mock.onGet('/me').reply(401, {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required.',
      data: null,
      requestId: 'req-401',
    });

    await request({ url: '/me', method: 'GET' }).catch(
      () => undefined,
    );

    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    expect(unauthorizedHandler.mock.calls[0]?.[0]).toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  });

  it('skipUnauthorizedHandler 可跳过 401 钩子', async () => {
    const unauthorizedHandler = vi.fn();
    configureApiClient({ unauthorizedHandler });
    mock.onPost('/auth/login').reply(401, {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required.',
      data: null,
      requestId: 'req-login',
    });

    await request({
      url: '/auth/login',
      method: 'POST',
      skipUnauthorizedHandler: true,
    }).catch(() => undefined);

    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('网络错误归一化为 NETWORK_ERROR', async () => {
    mock.onGet('/offline').networkError();

    const error = await request({
      url: '/offline',
      method: 'GET',
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('成功状态但响应结构异常时报 MALFORMED_RESPONSE', async () => {
    mock.onGet('/bad').reply(200, {
      code: 'OK',
      message: 'OK',
    });

    const error = await request({
      url: '/bad',
      method: 'GET',
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'MALFORMED_RESPONSE',
      status: 200,
    });
  });

  it('拒绝非法超时配置', () => {
    expect(() => configureApiClient({ timeoutMs: 0 })).toThrow(
      'timeoutMs',
    );
  });
});

describe('健康检查 API', () => {
  it('读取成功响应', async () => {
    mock.onGet('/health').reply(
      200,
      okEnvelope({
        status: 'ok',
        version: '0.1.0',
        uptimeSeconds: 1,
        timestamp: '2026-10-22T00:00:00.000Z',
        database: {
          status: 'ok',
          latencyMs: 2,
        },
      }),
    );

    await expect(fetchHealth()).resolves.toMatchObject({
      status: 'ok',
      version: '0.1.0',
    });
  });

  it('503 时返回降级载荷而不是抛错', async () => {
    const payload = {
      status: 'degraded',
      version: '0.1.0',
      uptimeSeconds: 1,
      timestamp: '2026-10-22T00:00:00.000Z',
      database: {
        status: 'error',
      },
    };

    mock.onGet('/health').reply(503, {
      code: 'INTERNAL_ERROR',
      message: 'Service unavailable.',
      data: payload,
      requestId: 'req-health',
    });

    await expect(fetchHealth()).resolves.toEqual(payload);
  });
});
