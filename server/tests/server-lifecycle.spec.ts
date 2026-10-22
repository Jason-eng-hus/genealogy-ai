import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createTempDatabase,
  type TempDatabase,
} from './support/temp-database.ts';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const CHILD_SCRIPT = path.join(
  PROJECT_ROOT,
  'server',
  'tests',
  'support',
  'server-child.ts',
);

interface HealthResponseBody {
  code: string;
  data: {
    status: string;
    database: {
      status: string;
    };
  };
}

function waitForReady(
  child: ChildProcessWithoutNullStreams,
  timeoutMs = 15000,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for the server child to start.'));
    }, timeoutMs);

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const match = /READY (\d+)\n/.exec(buffer);

      if (match !== null) {
        cleanup();
        resolve(Number(match[1]));
      }
    };

    const onExit = (code: number | null): void => {
      cleanup();
      reject(
        new Error(`Server child exited before ready with code ${code}.`),
      );
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const cleanup = (): void => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    };

    child.stdout.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs = 15000,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for the server child to exit.'));
    }, timeoutMs);

    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

let database: TempDatabase | undefined;

afterAll(() => {
  database?.cleanup();
});

describe('server lifecycle', () => {
  it('starts, serves health, and shuts down gracefully on SIGINT', async () => {
    database = createTempDatabase('lifecycle');
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', CHILD_SCRIPT],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: '0',
          TRUST_PROXY: 'false',
          LOG_LEVEL: 'info',
          DATABASE_URL: database.url,
          JWT_SECRET: 'test-auth-secret-0123456789abcdef',
          COOKIE_SECURE: 'false',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const outputChunks: string[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      outputChunks.push(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      outputChunks.push(chunk.toString('utf8'));
    });

    try {
      const port = await waitForReady(child);
      const url = `http://127.0.0.1:${port}/api/v1/health`;

      const response = await fetch(url);
      const body = (await response.json()) as HealthResponseBody;

      expect(response.status).toBe(200);
      expect(body.code).toBe('OK');
      expect(body.data.status).toBe('ok');
      expect(body.data.database.status).toBe('ok');
      expect(response.headers.get('x-request-id')).toBeTruthy();

      const exitPromise = waitForExit(child);
      child.stdin.write('SHUTDOWN\n');

      const exitCode = await exitPromise;
      const output = outputChunks.join('');

      expect(exitCode).toBe(0);
      expect(output).toContain('"msg":"server started"');
      expect(output).toContain('"msg":"shutdown started"');
      expect(output).toContain('"reason":"SIGINT"');
      expect(output).toContain('"msg":"shutdown complete"');

      await expect(fetch(url)).rejects.toThrow();
    } finally {
      if (child.exitCode === null) {
        child.kill();
      }
    }
  }, 30000);
});
