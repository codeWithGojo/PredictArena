"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthControls } from "@/components/auth/auth-controls";
import { useSlip } from "@/hooks/use-slip";

export function SiteHeader() {
  const path = usePathname();
  const { picks } = useSlip();
  return <header className="arena-header">
    <Link href="/" className="pa-brand" aria-label="PredictArena home"><span className="pa-brand-mark"><i/><i/><i/></span><span>Predict<span>Arena</span></span></Link>
    <nav aria-label="Main navigation">{[["/", "Match centre"], ["/slips", "My slip"], ["/performance", "Results"], ["/tracker", "Saved"], ["/premium", "Premium"]].map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}{href === "/slips" && <span className="nav-count">{picks.length}</span>}</Link>)}</nav>
    <div className="arena-account"><AuthControls/></div>
  </header>;
}
