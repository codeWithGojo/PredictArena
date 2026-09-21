"use client";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

export function PremiumGate({ children, title = "Premium analysis" }: { children: ReactNode; title?: string }) {
  const { user, plan, loading, signIn } = useAuth();
  if (loading) return <div className="premium-gate"><p>Checking access...</p></div>;
  if (!user) return <div className="premium-gate"><p>{title}</p><h3>Sign in to unlock your analysis.</h3><span>Saved slips, tracker tools and detailed match reads are tied to your account.</span><button type="button" onClick={() => void signIn()}>Sign in</button></div>;
  if (plan !== "premium") return <div className="premium-gate"><p>{title}</p><h3>This read is for Premium members.</h3><span>Upgrade will be available here when payments are connected.</span><button type="button" disabled>Upgrade coming soon</button></div>;
  return <>{children}</>;
}
