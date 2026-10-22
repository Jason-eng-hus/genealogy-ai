import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  fetchCurrentUser,
  isUnauthorizedError,
  login,
  logout,
  type SessionUser,
} from './session';

export interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  signIn: (username: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
}

const AUTH_QUERY_KEY = ['auth', 'me'] as const;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const {
    data,
    error: queryError,
    isPending,
    refetch,
  } = useQuery<SessionUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 60_000,
  });

  const clearOtherCaches = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== 'auth',
    });
  }, [queryClient]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const user = await login(username, password);

      clearOtherCaches();
      queryClient.setQueryData(AUTH_QUERY_KEY, user);

      return user;
    },
    [clearOtherCaches, queryClient],
  );

  const signOut = useCallback(async () => {
    clearOtherCaches();
    queryClient.setQueryData(AUTH_QUERY_KEY, null);

    try {
      await logout();
    } catch {
      // 服务端登出失败时仍保持本地退出状态，避免界面停留在已登录状态。
    }
  }, [clearOtherCaches, queryClient]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const error =
    queryError !== null && !isUnauthorizedError(queryError)
      ? queryError
      : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading: isPending,
      error,
      refresh,
      signIn,
      signOut,
    }),
    [data, isPending, error, refresh, signIn, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}
