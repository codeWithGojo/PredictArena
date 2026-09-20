"use client";
import { PremiumGate } from "./premium-gate";

export function PrivatePlaceholder({ title, body }: { title: string; body: string }) { return <main className="private-page"><p>YOUR ARENA</p><h1>{title}</h1><PremiumGate title={title}><section><h2>{title} are ready for your account.</h2><p>{body}</p></section></PremiumGate></main>; }
