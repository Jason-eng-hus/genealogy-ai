import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import type { Logger } from 'pino';
import { createApp } from './app.ts';
import { loadAppConfig, type AppConfig } from './config/env.ts';
import { createLogger } from './lib/logger.ts';
import {
  closeDatabase,
  initializeDatabase,
  type DatabaseHealth,
} from './lib/prisma.ts';

export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface StartedServer {
  server: Server;
  config: AppConfig;
  logger: Logger;
  databaseHealth: DatabaseHealth;
  port: number;
  shutdown: (reason: string) => Promise<void>;
}

export interface StartServerOptions {
  config?: AppConfig;
  logger?: Logger;
}

function listen(app: Express, port: number, host: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);

    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = (): void => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
    server.closeIdleConnections();
  });
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<StartedServer> {
  const config = options.config ?? loadAppConfig();
  const logger =
    options.logger ??
    createLogger({
      level: config.server.logLevel,
      appEnv: config.server.appEnv,
    });
  const databaseHealth = await initializeDatabase({
    config: config.database,
  });
  const app = createApp({ config, logger });

  let server: Server;

  try {
    server = await listen(app, config.server.port, config.server.host);
  } catch (error) {
    await closeDatabase().catch(() => undefined);
    throw error;
  }

  const address = server.address();
  const port =
    typeof address === 'object' && address !== null
      ? address.port
      : config.server.port;

  logger.info(
    {
      host: config.server.host,
      port,
      database: {
        migrationCount: databaseHealth.migrationCount,
        busyTimeoutMs: databaseHealth.busyTimeoutMs,
      },
    },
    'server started',
  );

  let shutdownPromise: Promise<void> | null = null;
  let signalReceived = false;

  const removeSignalHandlers = (): void => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };

  const performShutdown = async (reason: string): Promise<void> => {
    logger.info({ reason }, 'shutdown started');

    const forceTimer = setTimeout(() => {
      logger.error(
        { reason, timeoutMs: SHUTDOWN_TIMEOUT_MS },
        'shutdown timed out; closing remaining connections',
      );
      server.closeAllConnections();
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    try {
      try {
        await closeServer(server);
      } finally {
        await closeDatabase();
      }

      logger.info({ reason }, 'shutdown complete');
    } finally {
      clearTimeout(forceTimer);
      removeSignalHandlers();
    }
  };

  const shutdown = (reason: string): Promise<void> => {
    if (shutdownPromise === null) {
      shutdownPromise = performShutdown(reason);
    }

    return shutdownPromise;
  };

  const onSignal = (signal: NodeJS.Signals): void => {
    if (signalReceived) {
      logger.error(
        { signal },
        'received a second shutdown signal; exiting immediately',
      );
      process.exit(1);
    }

    signalReceived = true;

    void shutdown(signal).then(
      () => {
        process.exitCode = 0;
      },
      (error: unknown) => {
        logger.error({ signal, err: error }, 'shutdown failed');
        process.exitCode = 1;
      },
    );
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return {
    server,
    config,
    logger,
    databaseHealth,
    port,
    shutdown,
  };
}

export async function main(): Promise<void> {
  let logger: Logger | undefined;

  try {
    const config = loadAppConfig();
    logger = createLogger({
      level: config.server.logLevel,
      appEnv: config.server.appEnv,
    });
    await startServer({ config, logger });
  } catch (error) {
    const activeLogger =
      logger ??
      createLogger({ level: 'info', appEnv: 'development' });
    activeLogger.fatal({ err: error }, 'server failed to start');
    await closeDatabase().catch(() => undefined);
    process.exitCode = 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  const entryPath = path.resolve(entry);
  const modulePath = fileURLToPath(import.meta.url);

  return process.platform === 'win32'
    ? entryPath.toLowerCase() === modulePath.toLowerCase()
    : entryPath === modulePath;
}

if (isDirectRun()) {
  void main();
}
