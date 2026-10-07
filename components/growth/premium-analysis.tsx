"use client";
import { useEffect, useState } from "react";
import type { ModelFactor } from "@/lib/sports";
export function PremiumAnalysis({ fixtureId }: { fixtureId: string }) {
 const [data, setData] = useState<{ factors: ModelFactor[]; caveat: string } | null>(null), [error, setError] = useState("");
 useEffect(() => { const c = new AbortController(); fetch(`/api/analysis?fixtureId=${encodeURIComponent(fixtureId)}`, { cache: "no-store", signal: c.signal }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; }).then(setData).catch(e => { if (e.name !== "AbortError") setError(e.message); }); return () => c.abort(); }, [fixtureId]);
 if (error) return <p role="alert">{error}</p>; if (!data) return <p role="status">Loading analysis…</p>;
 return <div className="premium-read"><div className="factor-grid">{data.factors.map(f => <div key={f.label}><span>{f.label}</span><strong>{f.value}</strong><i><b className={f.tone} style={{ width: `${f.strength}%` }}/></i><p>{f.detail}</p></div>)}</div><div className="model-limit"><p><strong>Known limitation:</strong> {data.caveat}</p></div></div>;
}
