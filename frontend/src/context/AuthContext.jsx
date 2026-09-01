import { useCallback, useEffect, useMemo, useState } from "react";

import client from "../api/client";
import AuthContext from "./auth-context";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await client.get("/auth/me");
      setUser(response.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Authentication now lives only in an HttpOnly cookie that application JavaScript cannot read.
    localStorage.removeItem("pathwiseToken");
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const clearUnauthorizedSession = () => setUser(null);
    window.addEventListener("pathwise:unauthorized", clearUnauthorizedSession);
    return () =>
      window.removeEventListener(
        "pathwise:unauthorized",
        clearUnauthorizedSession,
      );
  }, []);

  const completeAuth = useCallback((nextUser) => {
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await client.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, completeAuth, logout }),
    [user, loading, completeAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
