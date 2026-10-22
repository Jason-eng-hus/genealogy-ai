import { randomUUID } from 'node:crypto';
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import type { Logger } from 'pino';
import {
  AppError,
  statusForErrorCode,
  type ErrorCode,
} from './errors.ts';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface SuccessEnvelope<T> {
  code: 'OK';
  message: string;
  data: T;
}

export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  data: unknown;
  requestId: string;
}

export interface SendSuccessOptions {
  status?: number;
  message?: string;
}

export interface SendErrorOptions {
  status?: number;
  details?: unknown;
}

export interface ErrorHandlerOptions {
  logger: Logger;
}

export function getRequestId(res: Response): string {
  const value = res.locals.requestId;

  return typeof value === 'string' ? value : '';
}

export function requestIdMiddleware(): RequestHandler {
  return (req, res, next): void => {
    const incoming = req.get(REQUEST_ID_HEADER)?.trim();
    const requestId =
      incoming !== undefined && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();

    res.locals.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: SendSuccessOptions = {},
): void {
  const body: SuccessEnvelope<T> = {
    code: 'OK',
    message: options.message ?? 'OK',
    data,
  };

  res.status(options.status ?? 200).json(body);
}

export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  options: SendErrorOptions = {},
): void {
  const body: ErrorEnvelope = {
    code,
    message,
    data: options.details ?? null,
    requestId: getRequestId(res),
  };

  res.status(options.status ?? statusForErrorCode(code)).json(body);
}

export function asyncHandler(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler {
  return (req, res, next): void => {
    handler(req, res, next).catch(next);
  };
}

export const notFoundHandler: RequestHandler = (_req, res): void => {
  sendError(res, 'NOT_FOUND', 'Route not found.');
};

interface BodyParserLikeError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

interface MappedError {
  code: ErrorCode;
  status: number;
  message: string;
  details?: unknown;
}

function readBodyParserError(error: unknown): BodyParserLikeError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as BodyParserLikeError;

  return typeof candidate.type === 'string' ? candidate : null;
}

function mapError(error: unknown): MappedError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
      details: error.details,
    };
  }

  const bodyError = readBodyParserError(error);

  if (bodyError !== null) {
    const status = bodyError.status ?? bodyError.statusCode;

    if (bodyError.type === 'entity.too.large' || status === 413) {
      return {
        code: 'UPLOAD_TOO_LARGE',
        status: 413,
        message: 'Request body is too large.',
      };
    }

    if (
      bodyError.type === 'encoding.unsupported' ||
      bodyError.type === 'charset.unsupported' ||
      status === 415
    ) {
      return {
        code: 'UNSUPPORTED_ENCODING',
        status: 415,
        message: 'Request encoding is not supported.',
      };
    }

    if (bodyError.type === 'entity.parse.failed' || status === 400) {
      return {
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Request body is invalid.',
      };
    }
  }

  return {
    code: 'INTERNAL_ERROR',
    status: 500,
    message: 'Internal server error.',
  };
}

export function createErrorHandler(
  options: ErrorHandlerOptions,
): ErrorRequestHandler {
  const { logger } = options;

  return (error, req, res, next): void => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const mapped = mapError(error);
    const requestId = getRequestId(res);

    if (mapped.status >= 500) {
      logger.error(
        {
          requestId,
          method: req.method,
          path: req.path,
          code: mapped.code,
          status: mapped.status,
          err: error,
        },
        'request failed',
      );
    } else {
      logger.warn(
        {
          requestId,
          method: req.method,
          path: req.path,
          code: mapped.code,
          status: mapped.status,
        },
        'request rejected',
      );
    }

    sendError(res, mapped.code, mapped.message, {
      status: mapped.status,
      details: mapped.details,
    });
  };
}
