
'use client';

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { UserRoleInfo } from '@/lib/types';

// DEBUG MODE FLAG
const DEBUG_MODE = true; // <<< SET TO true TO BYPASS LOGIN FOR DEVELOPMENT

interface User {
  id: string;
  username: string;
  roles: UserRoleInfo[];
  permissionIds: string[];
}

const MOCK_ADMIN_USER: User = {
  id: 'debug-admin-user',
  username: 'DebugAdmin',
  roles: [{id: '00000000-role-0000-0000-administrator', name: 'Administrator' }],
  permissionIds: ['*'], // Mock admin has all permissions
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: Record<string, string>) => Promise<User | null>;
  logout: () => Promise<void>;
  register: (credentials: Record<string, string>) => Promise<User | null>;
  refetchUser: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// This function will only be called when not in DEBUG_MODE due to useQuery's enabled flag
async function fetchCurrentUserActual(): Promise<User | null> {
  const response = await fetch('/api/auth/me');
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return null;
    throw new Error('Failed to fetch current user');
  }
  const data = await response.json();
  return data as User | null;
}

const formatApiError = async (response: Response, defaultMessage: string): Promise<string> => {
  const status = response.status;
  const statusText = response.statusText;
  let responseBodyText = '';

  try {
    responseBodyText = await response.text();
  } catch (e) {
    return `${defaultMessage}. Status: ${status} - ${statusText || 'Could not read response body.'}`;
  }

  let errorData;
  try {
    errorData = JSON.parse(responseBodyText);
  } catch (e) {
    // Response was not valid JSON
    return `${defaultMessage}. Status: ${status} - ${statusText || 'Server returned a non-JSON response.'} Body: ${responseBodyText.substring(0, 200)}...`;
  }

  if (errorData && errorData.error) {
    let errorMessage = String(errorData.error);
    if (errorData.details) {
      errorMessage += ` (Details: ${ (typeof errorData.details === 'string') ? errorData.details : JSON.stringify(errorData.details) })`;
    }
    if (errorData.field && typeof errorData.field === 'string') {
      throw { message: errorMessage, field: errorData.field };
    }
    return errorMessage;
  }
  
  return `${defaultMessage}. Status: ${status} - ${statusText || 'Server did not provide a detailed error message.'}`;
};


export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: realUser, isLoading: realIsLoading, refetch: realRefetch } = useQuery<User | null>({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUserActual,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    enabled: !DEBUG_MODE,
  });

  const login = useCallback(async (credentials: Record<string, string>) => {
    if (DEBUG_MODE) {
      console.warn("DEBUG_MODE: Login skipped.");
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
      return loggedInUser as User;
    } catch (error) {
      console.error("Login error in context:", error);
      throw error;
    }
  }, [queryClient]);

  const logout = useCallback(async () => {
    if (DEBUG_MODE) {
      console.warn("DEBUG_MODE: Logout skipped, user remains mock admin.");
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error: any) {
        console.error("Logout error in context:", error);
    } finally {
        await queryClient.setQueryData(['currentUser'], null);
        await realRefetch();
        router.push('/login');
    }
  }, [queryClient, router, realRefetch]);

  const register = useCallback(async (credentials: Record<string, string>) => {
     if (DEBUG_MODE) {
      console.warn("DEBUG_MODE: Registration skipped.");
      return MOCK_ADMIN_USER;
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
      return;
    }
    realRefetch();
  }, [realRefetch]);

  const hasPermission = useCallback((permission: string) => {
    const user = DEBUG_MODE ? MOCK_ADMIN_USER : realUser;
    if (!user) return false;
    if (user.permissionIds.includes('*')) return true;
    return user.permissionIds.includes(permission);
  }, [realUser]);


  let contextValue: AuthContextType;

  if (DEBUG_MODE) {
    contextValue = {
      user: MOCK_ADMIN_USER,
      isLoading: false,
      login,
      logout,
      register,
      refetchUser,
      hasPermission,
    };
  } else {
    contextValue = {
      user: realUser || null,
      isLoading: realIsLoading,
      login,
      logout,
      register,
      refetchUser,
      hasPermission,
    };
  }

  return (
    <AuthContext.Provider value={contextValue}>
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
  permission?: string | string[]
) {
  const ComponentWithAuth = (props: P) => {
    const { user, hasPermission, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (DEBUG_MODE) {
        return;
      }
      if (isLoading) {
        return;
      }
      if (!user) {
        router.replace('/login');
        return;
      }
      if (permission) {
        const hasRequiredPermission = Array.isArray(permission)
          ? permission.some(p => hasPermission(p))
          : hasPermission(permission);
          
        if (!hasRequiredPermission) {
          router.replace('/');
        }
      }
    }, [user, isLoading, router, permission, hasPermission]);

    if (DEBUG_MODE) {
        return <WrappedComponent {...props} />;
    }
    
    const hasRequiredPermission = permission
        ? Array.isArray(permission)
            ? permission.some(p => hasPermission(p))
            : hasPermission(permission)
        : true;

    if (isLoading || !user || !hasRequiredPermission) {
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
