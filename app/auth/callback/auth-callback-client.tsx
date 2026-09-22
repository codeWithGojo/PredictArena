"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function AuthCallbackClient() { const params = useSearchParams(); const router = useRouter(); const { completeCallback, error, signIn } = useAuth(); useEffect(() => { void completeCallback(params).then(() => router.replace("/")).catch(() => undefined); }, [completeCallback, params, router]); return <main className="auth-callback"><p>AUTHENTICATION</p><h1>{error ? "Sign in stopped" : "Finishing sign in"}</h1><span>{error ?? "Securing your PredictArena session."}</span>{error && <button onClick={() => void signIn()}>Try again</button>}</main>; }
