import { test } from "node:test";
import assert from "node:assert/strict";
import { env, get, openForm, login, cookiesOf, cookieLine, PASSWORD, ADMIN, BASE, call } from "./helpers.js";

test("signs in with the right password and hands the token to the editor window", async () => {
  const e = await env();
  const f = await openForm(e);
  assert.ok(cookieLine(f.res, "__Host-csrf"), "CSRF cookie set");
  const res = await login(e, f);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/auth/done");
  const sc = cookieLine(res, "__Host-session");
  assert.ok(sc, "session cookie set");
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Max-Age=300/); assert.match(sc, /Path=\//);

  const done = await get("/auth/done", e, { cookie: cookiesOf(res) });
  assert.equal(done.status, 200);
  const html = await done.text();
  assert.match(html, /authorization:github:success:/);
  assert.match(html, /github_pat_TEST_ONLY/);
  assert.ok(html.includes(JSON.stringify([ADMIN])), "only allowed origins receive the token");
  assert.match(html, /e\.origin/);
  const nonce = /script-src 'nonce-([^']+)'/.exec(done.headers.get("content-security-policy"))[1];
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.match(cookieLine(done, "__Host-session"), /Max-Age=0/, "the session is used once");
});

test("wrong password, unknown user, and a generic message either way", async () => {
  const e = await env();
  const f = await openForm(e);
  const a = await login(e, { ...f, password: "wrong-password-123" });
  const b = await login(e, { ...f, username: "nobody" });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  const ta = await a.text(), tb = await b.text();
  const msg = /<p class="err" role="alert">([^<]+)<\/p>/;
  assert.match(msg.exec(ta)[1], /don&#39;t match/);
  assert.equal(msg.exec(ta)[1], msg.exec(tb)[1], "the same message whether or not the user exists");
  assert.equal(cookieLine(a, "__Host-session"), undefined);
});

test("locks the account after 5 failed attempts, even for the right password", async () => {
  const e = await env();
  const f = await openForm(e);
  for (let i = 0; i < 5; i++) assert.equal((await login(e, { ...f, password: "nope-" + i })).status, 401);
  const locked = await login(e, f);
  assert.equal(locked.status, 429);
  assert.equal(cookieLine(locked, "__Host-session"), undefined);
});

test("CSRF: missing, mismatched or forged tokens and foreign origins are refused", async () => {
  const e = await env();
  const f = await openForm(e);
  assert.equal((await login(e, { ...f, cookie: "" })).status, 403, "no cookie");
  const other = await openForm(e);
  assert.equal((await login(e, { ...f, cookie: other.cookie })).status, 403, "token from another form");
  const forged = f.csrf.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  assert.equal((await login(e, { ...f, csrf: forged, cookie: `__Host-csrf=${forged}` })).status, 403, "bad signature");
  assert.equal((await login(e, { ...f, origin: "https://evil.example" })).status, 403, "cross-site post");
  assert.equal((await login(e, { ...f, origin: "null" })).status, 403, "opaque origin");
});

test("the hand-off page needs a valid, unexpired, untampered session", async () => {
  const e = await env();
  assert.equal((await get("/auth/done", e)).status, 401);
  const res = await login(e, await openForm(e));
  const cookie = cookiesOf(res);
  const tampered = cookie.replace(/session=([^.]+)/, (m, b) => "session=" + b.slice(0, -2) + "xx");
  assert.equal((await get("/auth/done", e, { cookie: tampered })).status, 401);
  assert.equal((await get("/auth/done", { ...e, SESSION_SECRET: "another-secret-0123456789-abcdefghij" }, { cookie })).status, 401);
});

test("usernames are case-insensitive; empty user list signs nobody in", async () => {
  const e = await env();
  assert.equal((await login(e, { ...(await openForm(e)), username: "EDITOR" })).status, 303);
  const none = await env({ SIMPLE_USERS: "" });
  assert.equal((await login(none, { ...(await openForm(none)), password: PASSWORD })).status, 401);
});

test("credentials, bodies and tokens never reach the logs", async () => {
  const lines = [];
  const orig = {};
  for (const k of ["log", "info", "warn", "error", "debug"]) { orig[k] = console[k]; console[k] = (...a) => lines.push(a.map(String).join(" ")); }
  try {
    const e = await env();
    const f = await openForm(e);
    await login(e, { ...f, password: "wrong-secret-pass-1" });
    const ok = await login(e, f);
    await get("/auth/done", e, { cookie: cookiesOf(ok) });
    await call(new Request(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE }, body: "password=" + PASSWORD + "&junk=1" }), e);
  } finally {
    Object.assign(console, orig);
  }
  const all = lines.join("\n");
  assert.ok(lines.length > 0, "sign-ins are logged");
  for (const secret of [PASSWORD, "wrong-secret-pass-1", "github_pat_TEST_ONLY", "csrf=", "password="]) assert.ok(!all.includes(secret), `logs must not contain ${secret}`);
  for (const l of lines) assert.deepEqual(Object.keys(JSON.parse(l)).filter((k) => !["event", "provider", "outcome", "user", "path", "status"].includes(k)), []);
});

test("misconfiguration fails closed", async () => {
  assert.equal((await get("/auth", { ...(await env()), SESSION_SECRET: "short" })).status, 500);
  const e = await env({ GITHUB_TOKEN: "" });
  const res = await login(e, await openForm(e));
  assert.equal((await get("/auth/done", e, { cookie: cookiesOf(res) })).status, 500);
});
