import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios';
import {
  API_BASE_URL,
  DEFAULT_REQUEST_TIMEOUT_MS,
  resolveApiBaseUrl,
} from '../config';
import {
  isApiEnvelope,
  isRecord,
  type ApiErrorEnvelope,
} from './types';

export const CLIENT_ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  HTTP_ERROR: 'HTTP_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export interface ApiErrorOptions {
  status?: number;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;
  readonly details: unknown;

  constructor(code: string, message: string, options: ApiErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status ?? 0;
    this.requestId = options.requestId ?? '';
    this.details = options.details;
  }
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipUnauthorizedHandler?: boolean;
  }
}

export interface ApiClientConfig {
  baseURL: string;
  timeoutMs: number;
  unauthorizedHandler: (error: ApiError) => void;
}

export interface ConfigureApiClientOptions {
  baseURL?: string;
  timeoutMs?: number;
  unauthorizedHandler?: (error: ApiError) => void;
}

const defaultUnauthorizedHandler = (): void => {};

let clientConfig: ApiClientConfig = {
  baseURL: API_BASE_URL,
  timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  unauthorizedHandler: defaultUnauthorizedHandler,
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: clientConfig.baseURL,
  timeout: clientConfig.timeoutMs,
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error);
    const requestConfig = axios.isAxiosError(error) ? error.config : undefined;

    if (
      apiError.status === 401 &&
      requestConfig?.skipUnauthorizedHandler !== true
    ) {
      try {
        clientConfig.unauthorizedHandler(apiError);
      } catch (handlerError) {
        console.error('Unauthorized handler failed.', handlerError);
      }
    }

    return Promise.reject(apiError);
  },
);

export function configureApiClient(
  options: ConfigureApiClientOptions,
): void {
  if (options.baseURL !== undefined) {
    clientConfig = {
      ...clientConfig,
      baseURL: resolveApiBaseUrl(options.baseURL),
    };
    apiClient.defaults.baseURL = clientConfig.baseURL;
  }

  if (options.timeoutMs !== undefined) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new Error('timeoutMs must be a positive finite number.');
    }

    clientConfig = {
      ...clientConfig,
      timeoutMs: Math.round(options.timeoutMs),
    };
    apiClient.defaults.timeout = clientConfig.timeoutMs;
  }

  if (options.unauthorizedHandler !== undefined) {
    clientConfig = {
      ...clientConfig,
      unauthorizedHandler: options.unauthorizedHandler,
    };
  }
}

export function resetApiClient(): void {
  clientConfig = {
    baseURL: API_BASE_URL,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    unauthorizedHandler: defaultUnauthorizedHandler,
  };
  apiClient.defaults.baseURL = clientConfig.baseURL;
  apiClient.defaults.timeout = clientConfig.timeoutMs;
}

export async function request<T>(
  config: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.request<unknown>(config);

  if (!isApiEnvelope<T>(response.data) || response.data.code !== 'OK') {
    throw new ApiError(
      CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      '服务端返回了无法识别的响应。',
      {
        status: response.status,
        requestId: readRequestIdHeader(response.headers),
        details: response.data,
      },
    );
  }

  return response.data.data;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    return new ApiError(
      CLIENT_ERROR_CODES.UNKNOWN_ERROR,
      '请求失败，请稍后重试。',
      { cause: error },
    );
  }

  if (error.response === undefined) {
    const message =
      error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? '请求超时，请稍后重试。'
        : '网络连接失败，请检查服务是否可用。';

    return new ApiError(CLIENT_ERROR_CODES.NETWORK_ERROR, message, {
      cause: error,
    });
  }

  const { response } = error;
  const body: unknown = response.data;
  const envelope: ApiErrorEnvelope = isRecord(body) ? body : {};
  const code =
    typeof envelope.code === 'string' && envelope.code !== ''
      ? envelope.code
      : CLIENT_ERROR_CODES.HTTP_ERROR;
  const message =
    typeof envelope.message === 'string' && envelope.message !== ''
      ? envelope.message
      : `请求失败（HTTP ${response.status}）。`;
  const requestId =
    typeof envelope.requestId === 'string'
      ? envelope.requestId
      : readRequestIdHeader(response.headers);

  return new ApiError(code, message, {
    status: response.status,
    requestId,
    details: envelope.data,
    cause: error,
  });
}

function readRequestIdHeader(headers: unknown): string {
  if (!isRecord(headers)) {
    return '';
  }

  const value = headers['x-request-id'];

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const match = value.find(
      (item): item is string => typeof item === 'string',
    );

    return match ?? '';
  }

  return '';
}
