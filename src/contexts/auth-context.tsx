
'use client';

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

// DEBUG MODE FLAG
const DEBUG_MODE = false; // <<< SET TO true TO BYPASS LOGIN FOR DEVELOPMENT
const MOCK_ADMIN_USER: User = {
  id: 'debug-admin-user',
  username: 'DebugAdmin',
  role: 'administrator',
};

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
  if (DEBUG_MODE) {
    return Promise.resolve(MOCK_ADMIN_USER);
  }
  const response = await fetch('/api/auth/me');
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return null;
    throw new Error('Failed to fetch current user');
  }
  const data = await response.json();
  return data as User | null;
}

const formatApiError = async (response: Response, defaultMessage: string): Promise<string> => {
    let errorMessage = defaultMessage;
    try {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
        if (errorData.details && typeof errorData.details === 'string') {
          errorMessage += ` Details: ${errorData.details}`;
        } else if (errorData.details && typeof errorData.details === 'object') {
           errorMessage += ` Details: ${JSON.stringify(errorData.details)}`;
        }
      } else if(response.statusText && response.statusText.trim() !== '') {
        errorMessage = `${defaultMessage}. Status: ${response.status} - Server: ${response.statusText}`;
      } else {
         errorMessage = `${defaultMessage}. Status: ${response.status} - Server did not provide detailed error.`;
      }
    } catch (e) {
      errorMessage = `${defaultMessage}. Status: ${response.status} - ${response.statusText || 'Server did not provide detailed error or a non-JSON response.'}`;
    }
    return errorMessage;
  };


export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    staleTime: DEBUG_MODE ? Infinity : 5 * 60 * 1000,
    retry: DEBUG_MODE ? false : 3, // Allow retries if not in debug mode
    enabled: true, // Always try to fetch, debug mode handles the return value
    initialData: DEBUG_MODE ? MOCK_ADMIN_USER : undefined,
  });
  
  const finalUser = DEBUG_MODE ? MOCK_ADMIN_USER : user;
  const finalIsLoading = DEBUG_MODE ? false : isLoading;


  const login = useCallback(async (credentials: Record<string, string>) => {
    if (DEBUG_MODE) {
      console.warn("DEBUG_MODE: Login skipped.");
      queryClient.setQueryData(['currentUser'], MOCK_ADMIN_USER);
      await refetch();
      return MOCK_ADMIN_USER;
    }
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Login failed');
        throw new Error(errorMessage);
      }
      const loggedInUser = await response.json();
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      await refetch();
      return loggedInUser as User;
    } catch (error) {
      console.error("Login error in context:", error);
      throw error;
    }
  }, [queryClient, refetch]);

  const logout = useCallback(async () => {
    if (DEBUG_MODE) {
      console.warn("DEBUG_MODE: Logout skipped, user remains mock admin.");
      queryClient.setQueryData(['currentUser'], MOCK_ADMIN_USER); // Keep mock admin
      await refetch(); // Refetch will re-apply mock admin if enabled
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error: any) {
        console.error("Logout error in context:", error);
    } finally {
        await queryClient.setQueryData(['currentUser'], null);
        // await queryClient.invalidateQueries({ queryKey: ['currentUser'] }); // Not strictly needed if setting to null
        await refetch(); // This will try to fetch /me again, resulting in null if logout was successful
        router.push('/login');
    }
  }, [queryClient, router, refetch]);

  const register = useCallback(async (credentials: Record<string, string>) => {
     if (DEBUG_MODE) {
      console.warn("DEBUG_MODE: Registration skipped.");
      return MOCK_ADMIN_USER; // Or null, depending on desired debug behavior
    }
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Registration failed');
        throw new Error(errorMessage);
      }
      const newUser = await response.json();
      return newUser as User;
    } catch (error) {
      console.error("Registration error in context:", error);
      throw error;
    }
  }, []);

  const refetchUser = useCallback(() => {
    if (DEBUG_MODE) {
      console.warn("DEBUG_MODE: refetchUser called, providing mock admin.");
      queryClient.setQueryData(['currentUser'], MOCK_ADMIN_USER);
      return;
    }
    refetch();
  }, [refetch, queryClient]);

  return (
    <AuthContext.Provider value={{ user: finalUser || null, isLoading: finalIsLoading, login, logout, register, refetchUser }}>
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

export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  allowedRoles?: Array<User['role']>
) {
  const ComponentWithAuth = (props: P) => {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (DEBUG_MODE) {
        return; // Bypass all auth checks in debug mode
      }
      if (!isLoading && !user) {
        router.replace('/login');
      } else if (!isLoading && user && allowedRoles && !allowedRoles.includes(user.role)) {
        router.replace('/'); // Redirect to home if role not allowed
      }
    }, [user, isLoading, router, allowedRoles]);

    if (DEBUG_MODE) {
      return <WrappedComponent {...props} />;
    }

    // If loading, or if no user and page requires auth, or user role not allowed
    if (isLoading || (!user && allowedRoles && allowedRoles.length > 0) || (user && allowedRoles && !allowedRoles.includes(user.role))) {
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
