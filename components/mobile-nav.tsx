"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSlip } from "@/hooks/use-slip";

export function MobileNav() {
  const path = usePathname();
  const { picks } = useSlip();
  if (path.startsWith('/auth/')) return null;
  const items = [
    { href: '/', label: 'Matches', icon: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h4m-4 6h4m4-7v8"/></> },
    { href: '/slips', label: 'My slip', icon: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/></> },
    { href: '/performance', label: 'Results', icon: <><path d="M4 20V10m6 10V4m6 16v-7M3 20h18"/></> },
    { href: '/account', label: 'Account', icon: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></> },
  ];
  return <nav className="app-mobile-nav" aria-label="Mobile navigation">{items.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href || (item.href === '/account' && path === '/tracker') ? 'page' : undefined}><span className="mobile-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>{item.href === '/slips' && !!picks.length && <b aria-label={`${picks.length} selections`}>{picks.length}</b>}</span><span>{item.label}</span></Link>)}</nav>;
}
