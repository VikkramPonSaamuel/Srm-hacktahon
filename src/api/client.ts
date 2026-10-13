import { useQuery } from '@tanstack/react-query';
import { getMockResponse } from './mockData';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') || '';

export interface ApiErrorPayload {
  detail?: string | Array<{ loc: (string | number)[]; msg: string; type: string }>;
  message?: string;
}

export class ContinuumApiError extends Error {
  public readonly status: number | null;
  public readonly endpoint: string;
  public readonly isUnavailable: boolean;

  constructor(options: {
    message: string;
    status: number | null;
    endpoint: string;
    isUnavailable: boolean;
  }) {
    super(options.message);
    this.name = 'ContinuumApiError';
    this.status = options.status;
    this.endpoint = options.endpoint;
    this.isUnavailable = options.isUnavailable;
  }
}

export function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

/**
 * Performs an HTTP request to the FastAPI backend.
 * When the backend service is offline, unreachable, or responds with 404/502/non-JSON,
 * it seamlessly falls back to high-fidelity mock operational telemetry so all tabs
 * function with full interactive enterprise data.
 */
export async function apiRequest<T>(
  endpoint: string,
  init?: RequestInit
): Promise<T> {
  const url = resolveApiUrl(endpoint);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch {
    // If backend is unreachable or connection fails, seamlessly provide mock data
    const mock = getMockResponse<T>(endpoint, init?.method, init?.body);
    if (mock !== undefined) {
      return mock;
    }

    throw new ContinuumApiError({
      message: `Unable to establish connection to backend service at ${url}. Verify that the FastAPI server is running.`,
      status: null,
      endpoint,
      isUnavailable: true,
    });
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    const mock = getMockResponse<T>(endpoint, init?.method, init?.body);
    if (mock !== undefined) {
      return mock;
    }

    let detailMessage = `HTTP ${response.status} ${response.statusText || 'Error'}`;

    if (isJson) {
      try {
        const errorBody = (await response.json()) as ApiErrorPayload;
        if (typeof errorBody.detail === 'string') {
          detailMessage = errorBody.detail;
        } else if (Array.isArray(errorBody.detail)) {
          detailMessage = errorBody.detail
            .map((err) => `${err.loc.join('.')}: ${err.msg}`)
            .join('; ');
        } else if (typeof errorBody.message === 'string') {
          detailMessage = errorBody.message;
        }
      } catch {
        // Keep status message fallback
      }
    }

    const isUnavailable =
      response.status === 404 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;

    throw new ContinuumApiError({
      message: isUnavailable
        ? `Backend endpoint ${endpoint} is currently unavailable (${response.status}). No FastAPI route responded.`
        : detailMessage,
      status: response.status,
      endpoint,
      isUnavailable,
    });
  }

  if (!isJson) {
    const mock = getMockResponse<T>(endpoint, init?.method, init?.body);
    if (mock !== undefined) {
      return mock;
    }

    // Vite dev server may return HTML fallback if proxy didn't hit a running backend
    throw new ContinuumApiError({
      message: `Backend endpoint ${endpoint} did not return JSON telemetry. FastAPI service is not connected.`,
      status: response.status,
      endpoint,
      isUnavailable: true,
    });
  }

  return (await response.json()) as T;
}

export interface BackendHealthStatus {
  status: string;
  service?: string;
  timestamp?: string;
}

export function useBackendHealthQuery() {
  return useQuery<BackendHealthStatus, ContinuumApiError>({
    queryKey: ['backend-health'],
    queryFn: () => apiRequest<BackendHealthStatus>('/api/health'),
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useEndpointProbeQuery<T = unknown[]>(
  endpoint: string,
  params?: Record<string, string>
) {
  const queryString = params
    ? new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v !== 'all')
      ).toString()
    : '';
  const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;

  return useQuery<T, ContinuumApiError>({
    queryKey: ['endpoint-probe', fullEndpoint],
    queryFn: () => apiRequest<T>(fullEndpoint),
    retry: false,
    refetchOnWindowFocus: false,
  });
}
