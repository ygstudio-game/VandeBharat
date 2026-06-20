import React, { createContext, useContext, useState, useCallback } from 'react';

const TOKEN_KEY = 'vi_auth_token';
const USER_KEY  = 'vi_auth_user';

function loadStored() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user  = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const stored = loadStored();
  const [token, setToken] = useState(stored.token);
  const [user,  setUser]  = useState(stored.user);

  const saveSession = useCallback((newToken, newUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password, totp_code) => {
    const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
    const body = { email, password };
    if (totp_code) body.totp_code = totp_code;

    const resp = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) return { ok: false, ...data };

    saveSession(data.token, data.user);
    return { ok: true, user: data.user };
  }, [saveSession]);

  const logout = useCallback(() => clearSession(), [clearSession]);

  return (
    <AuthContext.Provider value={{
      token,
      user,
      isAuthenticated: !!token,
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}
