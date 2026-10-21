"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiRequest, setCsrfToken } from "./api";

export interface UserSessionProfile {
  id: string;
  email: string;
  full_name: string;
  preferences: {
    theme?: string;
    reduced_motion?: boolean;
    high_contrast?: boolean;
  };
  active_tenant: {
    id: string;
    slug: string;
    name: string;
    role: "viewer" | "contributor" | "knowledge_admin" | "system_admin";
  };
  memberships: Array<{
    id: string;
    slug: string;
    name: string;
    role: string;
  }>;
  csrf_token: string;
  features: {
    embedding_provider: string;
    embedding_model: string;
    embedding_dim: number;
    generation_provider: string;
    generation_model: string | null;
    generation_available: boolean;
    dev_auth_enabled: boolean;
  };
}

interface AuthContextValue {
  user: UserSessionProfile | null;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  refreshUser: async () => {},
  logout: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSessionProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      const profile = await apiRequest<UserSessionProfile>("/api/v1/me");
      setCsrfToken(profile.csrf_token);
      setUser(profile);
      setError(null);
    } catch {
      setUser(null);
      setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setCsrfToken(null);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading, error, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
