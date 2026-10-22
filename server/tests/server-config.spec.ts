import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DatabaseConfigError,
  loadAppConfig,
  resolveAppConfig,
  resolveServerConfig,
  ServerConfigError,
} from '../src/config/env.ts';
import { TEST_TMP_DIR } from './support/temp-database.ts';

mkdirSync(TEST_TMP_DIR, { recursive: true });
const tempDirectory = mkdtempSync(path.join(TEST_TMP_DIR, 'server-config-'));

afterAll(() => {
  rmSync(tempDirectory, { recursive: true, force: true });
});

function expectServerConfigError(
  env: NodeJS.ProcessEnv,
  code: ServerConfigError['code'],
): void {
  try {
    resolveServerConfig(env);
    throw new Error('Expected resolveServerConfig to throw.');
  } catch (error) {
    expect(error).toBeInstanceOf(ServerConfigError);
    expect((error as ServerConfigError).code).toBe(code);
  }
}

describe('server config', () => {
  it('uses safe defaults', () => {
    expect(resolveServerConfig({})).toEqual({
      appEnv: 'development',
      host: '127.0.0.1',
      port: 4000,
      trustProxy: false,
      logLevel: 'info',
    });
  });

  it('accepts valid overrides', () => {
    expect(
      resolveServerConfig({
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: '4100',
        TRUST_PROXY: '2',
        LOG_LEVEL: 'debug',
      }),
    ).toEqual({
      appEnv: 'test',
      host: '0.0.0.0',
      port: 4100,
      trustProxy: 2,
      logLevel: 'debug',
    });
  });

  it('accepts IPv6, localhost and boolean trust proxy values', () => {
    expect(resolveServerConfig({ HOST: '::1' }).host).toBe('::1');
    expect(resolveServerConfig({ HOST: 'localhost' }).host).toBe('localhost');
    expect(resolveServerConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(
      true,
    );
    expect(resolveServerConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(
      false,
    );
  });

  it.each(['abc', '-1', '1.5', '65536', '1000000'])(
    'rejects invalid PORT %s',
    (port) => {
      expectServerConfigError({ PORT: port }, 'PORT_INVALID');
    },
  );

  it.each([
    'http://localhost',
    '127.0.0.1/path',
    'bad host',
    'example.com',
  ])('rejects invalid HOST %s', (host) => {
    expectServerConfigError({ HOST: host }, 'HOST_INVALID');
  });

  it.each(['maybe', '-1', 'trueish'])(
    'rejects invalid TRUST_PROXY %s',
    (trustProxy) => {
      expectServerConfigError(
        { TRUST_PROXY: trustProxy },
        'TRUST_PROXY_INVALID',
      );
    },
  );

  it('rejects invalid LOG_LEVEL', () => {
    expectServerConfigError({ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL_INVALID');
  });

  it('combines server and database config', () => {
    const config = resolveAppConfig({
      NODE_ENV: 'test',
      PORT: '4100',
      DATABASE_URL: 'file:./.tmp/server-config.db',
    });

    expect(config.server.port).toBe(4100);
    expect(config.database.appEnv).toBe('test');
    expect(config.database.databaseUrl).toBe('file:./.tmp/server-config.db');
  });

  it('keeps database validation errors intact', () => {
    try {
      resolveAppConfig({ NODE_ENV: 'test' });
      throw new Error('Expected resolveAppConfig to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseConfigError);
      expect((error as DatabaseConfigError).code).toBe(
        'DATABASE_URL_MISSING',
      );
    }
  });

  it('loads .env values without overriding existing environment', () => {
    const envPath = path.join(tempDirectory, '.env');
    writeFileSync(
      envPath,
      [
        'NODE_ENV=test',
        'HOST=0.0.0.0',
        'PORT=4200',
        'TRUST_PROXY=1',
        'LOG_LEVEL=warn',
        'DATABASE_URL="file:./from-file.db"',
        '',
      ].join('\n'),
      'utf8',
    );

    const config = loadAppConfig({
      dotEnvPath: envPath,
      env: {
        DATABASE_URL: 'file:./from-environment.db',
      },
    });

    expect(config.server).toEqual({
      appEnv: 'test',
      host: '0.0.0.0',
      port: 4200,
      trustProxy: 1,
      logLevel: 'warn',
    });
    expect(config.database.databaseUrl).toBe('file:./from-environment.db');
  });

  it('treats a missing .env file as optional', () => {
    const config = loadAppConfig({
      dotEnvPath: path.join(tempDirectory, 'missing.env'),
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'file:./missing-env.db',
      },
    });

    expect(config.server.port).toBe(4000);
    expect(config.database.databaseUrl).toBe('file:./missing-env.db');
  });
});
