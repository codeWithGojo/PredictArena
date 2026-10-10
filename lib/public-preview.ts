// Design previews can read the existing public feed without database credentials.
// Only these public GET endpoints are allowed; sessions and cookies are never forwarded.
export async function publicPreviewResponse(endpoint: "matches" | "performance", params?: URLSearchParams): Promise<Response | null> {
  if (process.env.VERCEL_ENV !== "preview" || !["matches", "performance"].includes(endpoint)) return null;
  const url = new URL(`/api/${endpoint}`, "https://predictarena-favour12.vercel.app");
  if (endpoint === "performance") {
    for (const key of ["league", "page"]) {
      const value = params?.get(key);
      if (value) url.searchParams.set(key, value);
    }
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store", credentials: "omit" });
    if (!response.ok) return null;
    return Response.json({ ...await response.json(), previewReadOnly: true }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch { return null; }
}
