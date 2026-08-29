/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getSession, login, logout, type Session } from '../lib/api';

type AuthValue = {
  session?: Session;
  isPending: boolean;
  signIn: (username: string, password: string) => Promise<Session>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession, retry: false });
  const loginMutation = useMutation({ mutationFn: ({ username, password }: { username: string; password: string }) => login(username, password) });
  const logoutMutation = useMutation({ mutationFn: logout });

  useEffect(() => {
    const expire = () => {
      queryClient.setQueryData(['session'], undefined);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    };
    window.addEventListener('edy:session-expired', expire);
    return () => window.removeEventListener('edy:session-expired', expire);
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{
      session: sessionQuery.data,
      isPending: sessionQuery.isPending,
      signIn: async (username, password) => {
        const session = await loginMutation.mutateAsync({ username, password });
        queryClient.setQueryData(['session'], session);
        return session;
      },
      signOut: async () => {
        await logoutMutation.mutateAsync();
        queryClient.removeQueries();
      },
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing.');
  return value;
}

export function ProtectedRoute() {
  const { session, isPending } = useAuth();
  const location = useLocation();
  if (isPending) return <div className="app-loading" role="status"><span className="spinner" />Preparing secure workspace…</div>;
  if (!session) return <Navigate replace to="/login" state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
