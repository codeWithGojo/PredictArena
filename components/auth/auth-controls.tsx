"use client";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

export function AuthControls() { const { user, loading, error, clearError, signIn, signUp, signOut } = useAuth(); return <div className="auth-controls">{error && <div className="auth-error" role="status">{error}<button onClick={clearError} aria-label="Dismiss sign in error">×</button></div>}{loading ? <span className="auth-loading">Checking account</span> : user ? <><Link href="/slips" className="account-link">Slips</Link><Link href="/tracker" className="account-link">Tracker</Link><button className="avatar signed-in" onClick={() => void signOut()} aria-label="Sign out">{user.displayName.slice(0, 2).toUpperCase()}</button></> : <><button className="auth-link" onClick={() => void signIn()}>Sign in</button><button className="auth-signup" onClick={() => void signUp()}>Create account</button></>}</div>; }
