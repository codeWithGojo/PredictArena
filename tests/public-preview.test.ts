import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { publicPreviewResponse } from "../lib/public-preview.ts";

function setEnvironment(t: TestContext, value: string) {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = value;
  t.after(() => { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous; });
}

test("public proxy stays disabled outside preview and excludes arbitrary endpoints", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not fetch"); });
  setEnvironment(t, "production");
  assert.equal(await publicPreviewResponse("matches"), null);
  setEnvironment(t, "preview");
  assert.equal(await publicPreviewResponse("saved" as "matches"), null);
});

test("preview forwards only public filters, preserves data and omits credentials", async t => {
  setEnvironment(t, "preview");
  const fetcher = t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.origin, "https://predictarena-favour12.vercel.app");
    assert.equal(url.pathname, "/api/performance");
    assert.equal(url.search, "?league=39&page=2");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers, undefined);
    return Response.json({ forecasts: [{ fixture_id: "existing" }], total: 1 });
  });
  const response = await publicPreviewResponse("performance", new URLSearchParams("league=39&page=2&account=private"));
  assert.deepEqual(await response?.json(), { forecasts: [{ fixture_id: "existing" }], total: 1, previewReadOnly: true });
  assert.equal(fetcher.mock.callCount(), 1);
});

test("public preview does not turn upstream failures into a successful feed", async t => {
  setEnvironment(t, "preview");
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  assert.equal(await publicPreviewResponse("matches"), null);
});
