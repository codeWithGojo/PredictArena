"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, configureApiAuth } from "@/lib/client/api";

export type Plan = "free" | "premium";
export type AuthUser = { id: string; displayName: string; email: string; plan: Plan };
type Tokens = { accessToken: string; idToken?: string; refreshToken: string; expiresAt: number };
type AuthContextValue = { user: AuthUser | null; plan: Plan; loading: boolean; error: string | null; signIn: () => Promise<void>; signUp: () => Promise<void>; signOut: () => Promise<void>; completeCallback: (params: URLSearchParams) => Promise<void>; clearError: () => void };

export const AuthContext = createContext<AuthContextValue | null>(null);

const config = {
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
  redirectUri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI,
  logoutUri: process.env.NEXT_PUBLIC_COGNITO_LOGOUT_URI,
};
const storageKey = "predictarena.pkce";
const devMode = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_DEV_AUTH_MODE : undefined;

function hostedUrl(path: string) {
  const domain = config.domain?.replace(/\/$/, "");
  if (!domain) throw new Error("Cognito is not configured. Add the public Cognito environment variables before signing in.");
  return `${domain.startsWith("http") ? domain : `https://${domain}`}${path}`;
}
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function challenge(verifier: string) { return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))); }
function randomValue() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return base64Url(bytes); }
function decodeJwt(token?: string) { if (!token) return {}; try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, string>; } catch { return {}; } }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const tokens = useRef<Tokens | null>(devMode === "free" || devMode === "premium" ? { accessToken: "dev-access-token", refreshToken: "dev-refresh-token", expiresAt: Number.MAX_SAFE_INTEGER } : null);
  const refreshTimer = useRef<number | null>(null);
  const [user, setUser] = useState<AuthUser | null>(() => devMode === "free" || devMode === "premium" ? { id: "dev-user", displayName: "Favour", email: "favour@example.test", plan: devMode } : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => { tokens.current = null; setUser(null); if (refreshTimer.current) window.clearTimeout(refreshTimer.current); refreshTimer.current = null; }, []);
  const hydrateUser = useCallback(async (accessToken: string, idToken?: string) => {
    try {
      const response = await apiFetch<{ data: { id: string; displayName: string; email: string; plan: Plan } }>("/me");
      setUser(response.data);
    } catch (reason) {
      const claims = decodeJwt(idToken);
      if ((reason as { status?: number }).status === 401) throw reason;
      setUser({ id: claims.sub ?? "pending-profile", displayName: claims.name ?? claims.email ?? "PredictArena member", email: claims.email ?? "", plan: "free" });
    }
  }, []);
  const refresh = useCallback(async () => {
    const active = tokens.current;
    if (!active || !config.clientId) return null;
    try {
      const body = new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, refresh_token: active.refreshToken });
      const response = await fetch(hostedUrl("/oauth2/token"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!response.ok) throw new Error("Session refresh was rejected.");
      const next = await response.json() as { access_token: string; id_token?: string; expires_in: number };
      tokens.current = { ...active, accessToken: next.access_token, idToken: next.id_token ?? active.idToken, expiresAt: Date.now() + next.expires_in * 1000 };
      await hydrateUser(next.access_token, tokens.current.idToken);
      return next.access_token;
    } catch { clear(); setError("Your session ended. Please sign in again."); return null; }
  }, [clear, hydrateUser]);
  const scheduleRefresh = useCallback((expiresAt: number) => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); const delay = Math.max(10_000, expiresAt - Date.now() - 60_000); refreshTimer.current = window.setTimeout(() => { void refresh(); }, delay); }, [refresh]);

  useEffect(() => {
    configureApiAuth({ getAccessToken: () => tokens.current?.accessToken ?? null, refreshAccessToken: refresh });
    return () => configureApiAuth(null);
  }, [refresh]);

  const start = useCallback(async (screen: "login" | "signup") => {
    try {
      setError(null); setLoading(true);
      if (!config.clientId || !config.redirectUri) throw new Error("Cognito is not configured. Add the public Cognito environment variables before signing in.");
      const verifier = randomValue(); const state = randomValue(); const nonce = randomValue(); const codeChallenge = await challenge(verifier);
      sessionStorage.setItem(storageKey, JSON.stringify({ verifier, state, nonce }));
      const query = new URLSearchParams({ client_id: config.clientId, response_type: "code", scope: "openid email profile predictarena/api", redirect_uri: config.redirectUri, code_challenge_method: "S256", code_challenge: codeChallenge, state, nonce });
      window.location.assign(hostedUrl(screen === "signup" ? `/signup?${query}` : `/oauth2/authorize?${query}`));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to start sign in."); setLoading(false); }
  }, []);
  const completeCallback = useCallback(async (params: URLSearchParams) => {
    setLoading(true); setError(null);
    try {
      const providerError = params.get("error");
      if (providerError) throw new Error(params.get("error_description") ?? `Sign in failed: ${providerError}.`);
      const code = params.get("code"); const state = params.get("state"); const raw = sessionStorage.getItem(storageKey);
      if (!code || !state || !raw || !config.clientId || !config.redirectUri) throw new Error("The sign-in response could not be validated. Please start again.");
      const pending = JSON.parse(raw) as { verifier: string; state: string };
      if (pending.state !== state) throw new Error("The sign-in response did not match this browser session. Please start again.");
      const body = new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, code, redirect_uri: config.redirectUri, code_verifier: pending.verifier });
      const response = await fetch(hostedUrl("/oauth2/token"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!response.ok) throw new Error("Cognito could not complete sign in. Check the callback URL and client configuration.");
      const result = await response.json() as { access_token: string; id_token?: string; refresh_token: string; expires_in: number };
      tokens.current = { accessToken: result.access_token, idToken: result.id_token, refreshToken: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000 };
      sessionStorage.removeItem(storageKey); await hydrateUser(result.access_token, result.id_token); scheduleRefresh(tokens.current.expiresAt);
    } catch (reason) { clear(); setError(reason instanceof Error ? reason.message : "Sign in could not be completed."); throw reason; } finally { setLoading(false); }
  }, [clear, hydrateUser, scheduleRefresh]);
  const signOut = useCallback(async () => { clear(); setError(null); if (!devMode && config.clientId && config.logoutUri && config.domain) window.location.assign(`${hostedUrl("/logout")}?${new URLSearchParams({ client_id: config.clientId, logout_uri: config.logoutUri })}`); }, [clear]);
  const value = useMemo<AuthContextValue>(() => ({ user, plan: user?.plan ?? "free", loading, error, signIn: () => start("login"), signUp: () => start("signup"), signOut, completeCallback, clearError: () => setError(null) }), [completeCallback, error, loading, signOut, start, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
