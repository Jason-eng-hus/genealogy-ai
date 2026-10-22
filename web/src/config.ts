export const DEFAULT_APP_TITLE = 'AI 家谱编辑系统';
export const DEFAULT_API_BASE_URL = '/api/v1';
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export function resolveApiBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_API_BASE_URL;
  }

  const trimmed = value.trim().replace(/\/+$/, '');

  return trimmed === '' ? DEFAULT_API_BASE_URL : trimmed;
}

export const APP_TITLE =
  typeof import.meta.env.VITE_APP_TITLE === 'string' &&
  import.meta.env.VITE_APP_TITLE.trim() !== ''
    ? import.meta.env.VITE_APP_TITLE.trim()
    : DEFAULT_APP_TITLE;

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
);
