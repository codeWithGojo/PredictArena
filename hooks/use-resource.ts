"use client";
import { useEffect, useState } from "react";
export function useResource<T>(url: string | null) {
 const [revision, setRevision] = useState(0);
 const key = `${url ?? ""}:${revision}`;
 const [result, setResult] = useState<{ key: string; data?: T; error?: string }>({ key: "" });
 useEffect(() => {
  if (!url) return;
  const controller = new AbortController();
  fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
   const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not load this information."); return body as T;
  }).then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
   .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
  return () => controller.abort();
 }, [url, key]);
 return { data: result.key === key ? result.data : undefined, error: result.key === key ? result.error : undefined,
  loading: !!url && result.key !== key, reload: () => setRevision(x => x + 1) };
}
