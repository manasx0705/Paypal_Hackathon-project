import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshToken, setAccessToken, setAuthFailHandler, onTokenChange, getAccessToken } from '../api/client';
import * as authApi from '../api/auth';

const AuthCtx = createContext(null);
// Non-secret hint so anonymous visitors don't fire a doomed /auth/refresh (401 console noise).
const HINT = 'palprocure.session';
const hint = {
  get: () => { try { return localStorage.getItem(HINT) === '1'; } catch { return true; } },
  set: (on) => { try { on ? localStorage.setItem(HINT, '1') : localStorage.removeItem(HINT); } catch { /* ignore */ } },
};

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [vendor, setVendor] = useState(null);
  const [token, setToken] = useState(getAccessToken());
  const [booting, setBooting] = useState(true);

  useEffect(() => onTokenChange(setToken), []);
  useEffect(() => {
    setAuthFailHandler(() => { hint.set(false); setVendor(null); });
    let alive = true;
    if (!hint.get()) { setBooting(false); return undefined; }
    refreshToken()
      .then((d) => alive && setVendor(d.vendor))
      .catch(() => hint.set(false))
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, []);

  const accept = useCallback((d) => {
    setAccessToken(d.accessToken);
    setVendor(d.vendor);
    hint.set(true);
    return d;
  }, []);
  const login = useCallback((b) => authApi.login(b).then(accept), [accept]);
  const register = useCallback((b) => authApi.register(b).then(accept), [accept]);
  const demo = useCallback((shop) => authApi.demo(shop).then(accept), [accept]);
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    hint.set(false);
    setAccessToken(null);
    setVendor(null);
    qc.clear();
  }, [qc]);

  const value = useMemo(
    () => ({ vendor, setVendor, token, isAuthed: !!token && !!vendor, booting, login, register, demo, logout }),
    [vendor, token, booting, login, register, demo, logout],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
