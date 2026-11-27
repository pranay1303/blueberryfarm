import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Access token lives strictly in memory (never localStorage)
let inMemoryAccessToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setUnauthorizedHandler(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 25000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (inMemoryAccessToken) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/setup-owner')
    ) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/auth/refresh', {}, { withCredentials: true })
            .then((r) => {
              const newTok = r.data?.access_token as string | undefined;
              if (newTok) {
                setAccessToken(newTok);
                return newTok;
              }
              return null;
            })
            .catch(() => null)
            .finally(() => {
              refreshPromise = null;
            });
        }
        const refreshed = await refreshPromise;
        if (refreshed) {
          originalRequest.headers.Authorization = `Bearer ${refreshed}`;
          return api(originalRequest);
        }
      } catch {
        // Fall through
      }
      setAccessToken(null);
      if (onUnauthorizedCallback) onUnauthorizedCallback();
    }
    return Promise.reject(error);
  }
);

export async function fetchBlob(url: string): Promise<Blob> {
  const res = await api.get(url, { responseType: 'blob' });
  return res.data as Blob;
}

