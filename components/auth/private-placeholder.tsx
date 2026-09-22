"use client";
import Link from "next/link";
import { PremiumGate } from "./premium-gate";

export function PrivatePlaceholder({ title, body }: { title: string; body: string }) {
  return <main className="private-page"><section className="private-card">
    <Link href="/" className="pa-brand"><span className="pa-brand-mark"><i/><i/><i/></span><span>Predict<span>Arena</span></span></Link>
    <span aria-hidden="true">PA</span>
    <p className="eyebrow">PRIVATE WORKSPACE</p>
    <h1>{title}</h1>
    <p>{body}</p>
    <PremiumGate title={title}><section className="workspace-ready"><h2>Your workspace is ready.</h2><p>There is nothing saved yet. Open a prediction from the model board to begin.</p><Link href="/">Return to prediction board</Link></section></PremiumGate>
  </section></main>;
}
