"use client";

import { createContext, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { browserAuth } from "@/lib/supabase/client";

export type Plan = "free" | "premium";
export type AuthUser = { id: string; displayName: string; email: string; plan: Plan };
type AuthContextValue = { user: AuthUser | null; plan: Plan; loading: boolean; error: string | null; signIn: () => Promise<void>; signUp: () => Promise<void>; signOut: () => Promise<void>; completeCallback: (params: URLSearchParams) => Promise<void>; clearError: () => void };

export const AuthContext = createContext<AuthContextValue | null>(null);
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<"login" | "signup" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const hydrateUser = useCallback(async () => {
    const response = await fetch("/api/account", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) { setUser(null); return; }
    const result = await response.json() as { data?: AuthUser; error?: string };
    if (!response.ok || !result.data) throw new Error(result.error ?? "Could not check your account.");
    setUser(result.data);
  }, []);

  useEffect(() => {
    if (!configured) return;
    const client = browserAuth();
    const { data: { subscription } } = client.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_OUT") { setUser(null); setLoading(false); }
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        window.setTimeout(() => { void hydrateUser().catch((reason) => { setUser(null); setError(reason instanceof Error ? reason.message : "Could not check your account."); }).finally(() => setLoading(false)); }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, [hydrateUser]);

  const open = useCallback(async (next: "login" | "signup") => {
    setError(null); setNotice(null);
    if (!configured) { setError("Accounts are being set up. Please try again later."); return; }
    setScreen(next);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null); setNotice(null); setLoading(true);
    try {
      const client = browserAuth();
      if (screen === "signup") {
        const { error: authError } = await client.auth.signUp({ email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (authError) throw authError;
        setNotice("Check your email to confirm your account, then sign in.");
        setPassword("");
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        await hydrateUser(); setScreen(null); setPassword("");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign in failed."); }
    finally { setLoading(false); }
  };

  const completeCallback = useCallback(async (params: URLSearchParams) => {
    setLoading(true); setError(null);
    try {
      if (params.get("error")) throw new Error(params.get("error_description") ?? "Email confirmation failed.");
      const code = params.get("code");
      if (!code) throw new Error("The confirmation link is missing its sign-in code.");
      const { error: authError } = await browserAuth().auth.exchangeCodeForSession(code);
      if (authError) throw authError;
      await hydrateUser();
    } catch (reason) { const message = reason instanceof Error ? reason.message : "Could not finish sign in."; setError(message.includes("PKCE code verifier not found") ? "Email confirmed. Sign in with your password to continue." : message); throw reason; }
    finally { setLoading(false); }
  }, [hydrateUser]);

  const signOut = useCallback(async () => {
    if (configured) await browserAuth().auth.signOut();
    setUser(null); setScreen(null); setError(null);
  }, []);
  const value = useMemo<AuthContextValue>(() => ({ user, plan: user?.plan ?? "free", loading, error,
    signIn: () => open("login"), signUp: () => open("signup"), signOut, completeCallback,
    clearError: () => setError(null) }), [user, loading, error, open, signOut, completeCallback]);

  return <AuthContext.Provider value={value}>{children}{screen && <div className="auth-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setScreen(null); }}><section className="auth-dialog" role="dialog" aria-modal="true" aria-label={screen === "login" ? "Sign in" : "Create account"}><button type="button" className="auth-dialog-close" onClick={() => setScreen(null)} aria-label="Close">×</button><span className="eyebrow">PredictArena account</span><h2>{screen === "login" ? "Welcome back" : "Create your account"}</h2><p>{screen === "login" ? "Sign in to see your access and saved tools as they launch." : "Start with a free account. Confirm your email before signing in."}</p><form onSubmit={(event) => void submit(event)}><label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" minLength={6} autoComplete={screen === "login" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <span className="auth-dialog-error" role="alert">{error}</span>}{notice && <span className="auth-dialog-notice" role="status">{notice}</span>}<button type="submit" disabled={loading}>{loading ? "Please wait..." : screen === "login" ? "Sign in" : "Create account"}</button></form><button className="auth-dialog-switch" type="button" onClick={() => { setScreen(screen === "login" ? "signup" : "login"); setError(null); setNotice(null); }}>{screen === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button></section></div>}</AuthContext.Provider>;
}
