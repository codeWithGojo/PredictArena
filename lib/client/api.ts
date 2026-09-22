type ApiError = Error & { status?: number; code?: string; requestId?: string };

type AuthBridge = {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
};

let authBridge: AuthBridge | null = null;
export function configureApiAuth(bridge: AuthBridge | null) { authBridge = bridge; }

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
export const isMockApi = !baseUrl;

function apiUrl(path: string) {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function parseError(status: number, payload: unknown, requestId?: string): ApiError {
  const record = payload && typeof payload === "object" ? payload as { error?: { code?: string; message?: string }; message?: string } : {};
  const error = new Error(record.error?.message ?? record.message ?? (status === 401 ? "Your session has expired. Please sign in again." : "The request could not be completed.")) as ApiError;
  error.status = status;
  error.code = record.error?.code ?? (status === 401 ? "UNAUTHENTICATED" : undefined);
  error.requestId = requestId;
  return error;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  if (isMockApi && path === "/me") {
    const previewPlan = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_AUTH_MODE === "premium" ? "premium" : "free";
    return { data: { id: "mock-user", displayName: "Favour", email: "favour@example.test", plan: previewPlan }, requestId: "mock-request" } as T;
  }
  const accessToken = authBridge?.getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (response.status === 401 && retry && authBridge) {
    const refreshed = await authBridge.refreshAccessToken();
    if (refreshed) return apiFetch<T>(path, init, false);
  }
  if (!response.ok) {
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* Gateway errors can be non-JSON. */ }
    throw parseError(response.status, payload, response.headers.get("x-request-id") ?? response.headers.get("apigw-requestid") ?? undefined);
  }
  return response.json() as Promise<T>;
}
