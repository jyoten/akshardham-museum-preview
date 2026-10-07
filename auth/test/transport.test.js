// Plain HTTP is refused; HTTPS responses carry HSTS; credentials only in POST bodies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { env, call, get, openForm, login } from "./helpers.js";

test("plain HTTP is refused before anything else: no form, no credentials read", async () => {
  const e = await env();
  const res = await call(new Request("http://auth.example.org/auth?provider=github"), e);
  assert.equal(res.status, 403);
  const text = await res.text();
  assert.match(text, /HTTPS required/);
  assert.ok(!/<form/i.test(text), "no sign-in form over HTTP");

  let bodyRead = false;
  const body = new ReadableStream({ pull() { bodyRead = true; throw new Error("body must not be read"); } }, { highWaterMark: 0 });
  const post = await call(new Request("http://auth.example.org/auth/login", { method: "POST", body, duplex: "half", headers: { "content-type": "application/x-www-form-urlencoded" } }), e);
  assert.equal(post.status, 403);
  assert.equal(bodyRead, false, "the request body was not read");
});

test("HTTP is refused on localhost too, unless ALLOW_HTTP_LOCALHOST=true", async () => {
  const off = await call(new Request("http://localhost:8788/auth"), await env());
  assert.equal(off.status, 403);
  const on = await call(new Request("http://localhost:8788/auth"), await env({ ALLOW_HTTP_LOCALHOST: "true" }));
  assert.equal(on.status, 200);
  const spoofed = await call(new Request("http://auth.example.org/auth", { headers: { host: "localhost" } }), await env({ ALLOW_HTTP_LOCALHOST: "true" }));
  assert.equal(spoofed.status, 403, "only the real request host counts");
});

test("X-Forwarded-Proto is trusted only when TRUST_FORWARDED_PROTO=true", async () => {
  const req = () => new Request("http://auth.example.org/auth", { headers: { "x-forwarded-proto": "https" } });
  assert.equal((await call(req(), await env())).status, 403);
  assert.equal((await call(req(), await env({ TRUST_FORWARDED_PROTO: "true" }))).status, 200);
});

test("HTTPS responses send Strict-Transport-Security and other protective headers", async () => {
  const res = await get("/auth", await env());
  assert.equal(res.status, 200);
  assert.match(res.headers.get("strict-transport-security"), /max-age=\d{7,}/);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("cache-control"), "no-store");
  // no-referrer would make browsers send "Origin: null" on the sign-in POST, which the origin check refuses.
  assert.equal(res.headers.get("referrer-policy"), "same-origin");
  assert.match(res.headers.get("content-security-policy"), /default-src 'none'.*frame-ancestors 'none'/);
  for (const path of ["/auth/login", "/nope", "/auth/done"]) {
    const r = await get(path, await env());
    assert.ok(r.headers.get("strict-transport-security"), path);
  }
});

test("the sign-in form posts; GET and query-string credentials are refused", async () => {
  const e = await env();
  const { html, csrf, cookie } = await openForm(e);
  assert.match(html, /<form method="post" action="\/auth\/login"/);
  assert.equal((await get("/auth/login?username=editor&password=x", e)).status, 405);
  const q = await login(e, { csrf, cookie, path: "/auth/login?username=editor&password=x" });
  assert.equal(q.status, 400);
});
