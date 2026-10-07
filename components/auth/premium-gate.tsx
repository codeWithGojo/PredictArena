"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

export function PremiumGate({ children, title = "Premium analysis" }: { children: ReactNode; title?: string }) {
  const { user, plan, loading, signIn } = useAuth();
  if (loading) return <div className="premium-gate"><p>Checking access...</p></div>;
  if (!user) return <div className="premium-gate"><p>{title}</p><h3>Sign in to unlock your analysis.</h3><span>Sign in to check your access. Saved forecasts and the public results record are free.</span><button type="button" onClick={() => void signIn()}>Sign in</button></div>;
  if (plan !== "premium") return <div className="premium-gate"><p>{title}</p><h3>This read is for Premium members.</h3><span>Premium early access is open. Joining records interest without charging you.</span><Link className="growth-link" href="/premium">See Premium early access</Link></div>;
  return <>{children}</>;
}
