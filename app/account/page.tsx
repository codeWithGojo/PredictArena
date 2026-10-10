"use client";
import Link from "next/link";
import { PageHeader } from "@/components/growth/page-header";
import { AuthControls } from "@/components/auth/auth-controls";
import { useAuth } from "@/hooks/use-auth";

export default function AccountPage() {
  const { user, loading } = useAuth();
  return <div className="growth-page"><PageHeader/><main className="growth-main account-main"><div className="growth-title"><div><h1>{user ? `Hi, ${user.displayName}` : 'Your account'}</h1><p>{user ? `${user.email} · ${user.plan === 'premium' ? 'Premium' : 'Free'} account` : 'Sign in to keep saved forecasts and followed teams across devices.'}</p></div></div>
    <section className="account-panel">{loading ? <p role="status">Checking your account…</p> : <AuthControls/>}</section>
    <div className="account-links"><Link href="/tracker"><strong>Saved forecasts <span>↗</span></strong><p>The matches you follow, with their final results.</p></Link><Link href="/slips"><strong>My slip <span>↗</span></strong><p>Build and manage your selections on this device.</p></Link><Link href="/"><strong>Follow competitions <span>↗</span></strong><p>Choose Your leagues in the prediction filters.</p></Link><Link href="/premium"><strong>Membership <span>↗</span></strong><p>See free tools and premium early access.</p></Link></div>
  </main></div>;
}
