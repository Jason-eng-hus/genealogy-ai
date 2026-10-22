import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

const QUERY_STALE_TIME_MS = 30_000;
const QUERY_RETRY_LIMIT = 1;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            return false;
          }

          return failureCount < QUERY_RETRY_LIMIT;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
