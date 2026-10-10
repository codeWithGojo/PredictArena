"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSlip } from "@/hooks/use-slip";
import { Icon, type IconName } from "@/components/ui-icon";

const items: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/', label: 'Matches', icon: 'football' },
  { href: '/slips', label: 'My slip', icon: 'slip' },
  { href: '/performance', label: 'Results', icon: 'chart' },
  { href: '/account', label: 'Account', icon: 'user' },
];

export function MobileNav() {
  const path = usePathname();
  const { picks } = useSlip();
  if (path.startsWith('/auth/')) return null;
  return <nav className="app-mobile-nav" aria-label="Mobile navigation">{items.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href || (item.href === '/account' && path === '/tracker') ? 'page' : undefined}><span className="mobile-nav-icon"><Icon name={item.icon} size={22}/>{item.href === '/slips' && !!picks.length && <b aria-label={`${picks.length} selections`}>{picks.length}</b>}</span><span>{item.label}</span></Link>)}</nav>;
}
