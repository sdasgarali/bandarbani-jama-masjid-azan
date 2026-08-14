"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { clearSession, getStoredAdmin, subscribe } from "@/lib/auth";
import { logout as apiLogout, restoreSession } from "@/lib/services";
import type { Admin } from "@/lib/types";

interface AuthContextValue {
  admin: Admin | null;
  loading: boolean;
  setAdmin: (admin: Admin | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      // Optimistically show stored profile while we validate the session.
      const stored = getStoredAdmin();
      if (stored && active) setAdmin(stored);
      const restored = await restoreSession();
      if (active) {
        setAdmin(restored);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // React to session clears triggered from the API layer (e.g. failed refresh).
  useEffect(() => {
    return subscribe(() => {
      setAdmin(getStoredAdmin());
    });
  }, []);

  const logout = async () => {
    await apiLogout();
    clearSession();
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, loading, setAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
