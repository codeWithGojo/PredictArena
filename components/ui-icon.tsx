import type { ReactNode } from "react";

export type IconName =
  | "arrow" | "basketball" | "bookmark" | "calendar" | "chart" | "check"
  | "chevron" | "clock" | "close" | "copy" | "filters" | "football"
  | "grid" | "lock" | "menu" | "model" | "plus" | "refresh" | "search"
  | "shield" | "slip" | "spark" | "target" | "tennis" | "user";

const paths: Record<IconName, ReactNode> = {
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  basketball: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c7 1 11.8 5.8 12.8 12.8M18.4 5.6c-7 1-11.8 5.8-12.8 12.8"/></>,
  bookmark: <path d="M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2m-8 3h2"/></>,
  chart: <><path d="M4 4v16h16M8 16v-4m4 4V8m4 8v-6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  filters: <><path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/></>,
  football: <><circle cx="12" cy="12" r="9"/><path d="m12 7 4.8 3.5-1.8 5.6H9l-1.8-5.6ZM12 7V3m4.8 7.5 3.8-1.2M15 16.1l2.4 3.2M9 16.1l-2.4 3.2m.6-8.8L3.4 9.3"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  model: <><path d="m12 3-8 4v10l8 4 8-4V7ZM4 7l8 4 8-4m-8 4v10"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  refresh: <><path d="M20 4v5h-5M4 20v-5h5"/><path d="M4.8 9a7.5 7.5 0 0 1 12.5-2.3L20 9M4 15l2.7 2.3A7.5 7.5 0 0 0 19.2 15"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  shield: <><path d="m12 3-7 3v5c0 4.5 2.8 8.1 7 10 4.2-1.9 7-5.5 7-10V6Z"/><path d="m9 12 2 2 4-4"/></>,
  slip: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6m-6 4h6m-6 4h3"/></>,
  spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  tennis: <><circle cx="12" cy="12" r="9"/><path d="M6.1 5.2a9 9 0 0 1 0 13.6m11.8-13.6a9 9 0 0 0 0 13.6"/></>,
  user: <><circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="pa-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
