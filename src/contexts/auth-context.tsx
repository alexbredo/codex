
'use client';

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  username: string;
  role: 'user' | 'administrator';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: Record<string, string>) => Promise<User | null>;
  logout: () => Promise<void>;
  register: (credentials: Record<string, string>) => Promise<User | null>;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchCurrentUser(): Promise<User | null> {
  const response = await fetch('/api/auth/me');
  if (!response.ok) {
    // Don't throw error for 401 or similar, just return null
    if (response.status === 401 || response.status === 403) return null;
    throw new Error('Failed to fetch current user');
  }
  const data = await response.json();
  return data as User | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on error, as it might be an auth issue
  });

  const login = useCallback(async (credentials: Record<string, string>) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }
      const loggedInUser = await response.json();
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] }); // Refetch user
      refetch(); // Manually trigger refetch
      return loggedInUser as User;
    } catch (error) {
      console.error("Login error in context:", error);
      throw error; // Re-throw to be caught by UI
    }
  }, [queryClient, refetch]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error("Logout error in context:", error);
        // Should still proceed to clear client state
    } finally {
        await queryClient.setQueryData(['currentUser'], null); // Optimistically update
        await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        refetch();
        router.push('/login'); // Redirect to login after logout
    }
  }, [queryClient, router, refetch]);

  const register = useCallback(async (credentials: Record<string, string>) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Registration failed');
      }
      const newUser = await response.json();
      // Optionally log in the user after registration
      // await login({ username: credentials.username, password: credentials.password });
      return newUser as User;
    } catch (error) {
      console.error("Registration error in context:", error);
      throw error; // Re-throw
    }
  }, []);

  const refetchUser = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, login, logout, register, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Higher-Order Component for route protection
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  allowedRoles?: Array<User['role']>
) {
  const ComponentWithAuth = (props: P) => {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !user) {
        router.replace('/login');
      } else if (!isLoading && user && allowedRoles && !allowedRoles.includes(user.role)) {
        router.replace('/'); // Or a dedicated unauthorized page
      }
    }, [user, isLoading, router, allowedRoles]);

    if (isLoading || !user || (allowedRoles && !allowedRoles.includes(user.role))) {
      return (
        <div className="flex justify-center items-center h-screen">
          <p>Loading or checking authorization...</p>
        </div>
      );
    }
    return <WrappedComponent {...props} />;
  };
  ComponentWithAuth.displayName = `WithAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return ComponentWithAuth;
}
