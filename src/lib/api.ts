const SESSION_TOKEN_KEY = 'campusgpt_session_token';
let inMemorySessionToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function getSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;
  if (typeof window === 'undefined') return null;
  try {
    const fromSession = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (fromSession) {
      inMemorySessionToken = fromSession;
      return fromSession;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  try {
    const fromLocal = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (fromLocal) {
      inMemorySessionToken = fromLocal;
      return fromLocal;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return null;
}

export function setSessionToken(token: string | null) {
  inMemorySessionToken = token;
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  try {
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const isPublicAuthEndpoint =
      url.startsWith('/api/auth/login') ||
      url.startsWith('/api/auth/register') ||
      url.startsWith('/api/auth/otp/');
    if (res.status === 401 && !isPublicAuthEndpoint) {
      setSessionToken(null);
      unauthorizedHandler?.();
    }
    const err: any = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}
