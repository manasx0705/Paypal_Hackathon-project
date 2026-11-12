import axios from 'axios';

let accessToken = null;
const listeners = new Set();
export const getAccessToken = () => accessToken;
export function setAccessToken(t) {
  accessToken = t || null;
  listeners.forEach((fn) => fn(accessToken));
}
export const onTokenChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise = null;
export function refreshToken() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', null, { _skipAuthRetry: true })
      .then((r) => {
        setAccessToken(r.data.accessToken);
        return r.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

let onAuthFail = () => {};
export const setAuthFailHandler = (fn) => {
  onAuthFail = fn;
};

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config || {};
    const url = cfg.url || '';
    if (error.response?.status === 401 && !cfg._retried && !cfg._skipAuthRetry && !url.startsWith('/auth/')) {
      cfg._retried = true;
      try {
        await refreshToken();
        return api(cfg);
      } catch {
        setAccessToken(null);
        onAuthFail();
      }
    }
    return Promise.reject(error);
  },
);

/** Friendly message from the `{error:{code,message}}` envelope. */
export function errMsg(e, fallback = 'Something went wrong') {
  const err = e?.response?.data?.error;
  if (err?.message) return err.code ? `${err.message} (${err.code})` : err.message;
  if (e?.message === 'Network Error') return 'Cannot reach the server. Is the backend running?';
  return e?.message || fallback;
}
export const errCode = (e) => e?.response?.data?.error?.code;
export const data = (p) => p.then((r) => r.data);
