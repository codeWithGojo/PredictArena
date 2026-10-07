import Link from "next/link";
import { AuthControls } from "@/components/auth/auth-controls";
export function PageHeader() { return <header className="growth-header"><Link href="/" className="pa-brand"><span className="pa-brand-mark"><i/><i/><i/></span><span>Predict<span>Arena</span></span></Link><nav aria-label="Main navigation"><Link href="/">Predictions</Link><Link href="/performance">Results</Link><Link href="/tracker">Saved</Link><Link href="/premium">Premium</Link></nav><AuthControls/></header>; }
