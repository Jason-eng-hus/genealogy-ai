export const ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT_VERSION',
  'DUPLICATE',
  'REVIEW_REQUIRED',
  'INVALID_STATE',
  'QUOTE_NOT_FOUND',
  'FIELD_NOT_IN_QUOTE',
  'MASKING_ACK_REQUIRED',
  'AI_PROVIDER_ERROR',
  'AI_TIMEOUT',
  'EXPORT_BLOCKED',
  'IMPORT_DUPLICATE',
  'UNSUPPORTED_ENCODING',
  'UPLOAD_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT_VERSION: 409,
  DUPLICATE: 409,
  REVIEW_REQUIRED: 409,
  INVALID_STATE: 409,
  QUOTE_NOT_FOUND: 422,
  FIELD_NOT_IN_QUOTE: 422,
  MASKING_ACK_REQUIRED: 409,
  AI_PROVIDER_ERROR: 502,
  AI_TIMEOUT: 504,
  EXPORT_BLOCKED: 403,
  IMPORT_DUPLICATE: 409,
  UNSUPPORTED_ENCODING: 415,
  UPLOAD_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export interface AppErrorOptions {
  status?: number;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? ERROR_STATUS[code];
    this.details = options.details;
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === 'string' &&
    (ERROR_CODES as readonly string[]).includes(value)
  );
}

export function statusForErrorCode(code: ErrorCode): number {
  return ERROR_STATUS[code];
}
