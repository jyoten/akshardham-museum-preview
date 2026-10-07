import { test } from "node:test";
import assert from "node:assert/strict";
import { env, call, get, openForm, cookiesOf, BASE } from "./helpers.js";
import { verifyCallback, isAllowed } from "../src/providers/baps-sso.js";

const SSO = { AUTH_PROVIDERS: "simple,baps-sso", SSO_BASE_URL: "https://sso.example.org", SSO_CLIENT_ID: "client-test", SSO_CLIENT_KEY: "key-test", SSO_ALLOWED_EDITORS: "Priya@example.org, nand" };
const post = (path, e, f, extra = {}) => call(new Request(BASE + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, cookie: f.cookie }, body: new URLSearchParams({ csrf: f.csrf, ...extra }).toString() }), e);

test("BAPS SSO is off by default", async () => {
  const e = await env();
  const f = await openForm(e);
  assert.ok(!/BAPS SSO/.test(f.html));
  assert.equal((await post("/auth/sso/start", e, f)).status, 404);
  assert.equal((await get("/auth/sso/callback?state=x", e)).status, 404);
});

test("when switched on, it hands over to the SSO host with client_id, client_key and redirect_uri", async () => {
  const e = await env(SSO);
  const f = await openForm(e);
  assert.match(f.html, /Sign in with BAPS SSO/);
  const res = await post("/auth/sso/start", e, f);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<form id="go" method="post" action="https:\/\/sso\.example\.org\/">/);
  assert.match(html, /name="client_id" value="client-test"/);
  assert.match(html, /name="client_key" value="key-test"/);
  assert.match(html, /name="redirect_uri" value="https:\/\/auth\.example\.org\/auth\/sso\/callback\?state=[A-Za-z0-9_-]+"/);
  assert.match(res.headers.get("content-security-policy"), /form-action https:\/\/sso\.example\.org/);
  assert.equal((await post("/auth/sso/start", e, { ...f, cookie: "" })).status, 403, "needs the CSRF cookie");
});

test("SSO with incomplete settings stays off", async () => {
  const e = await env({ ...SSO, SSO_CLIENT_KEY: "" });
  assert.ok(!/BAPS SSO/.test((await openForm(e)).html));
  const e2 = await env({ ...SSO, SSO_BASE_URL: "http://sso.example.org" });
  assert.ok(!/BAPS SSO/.test((await openForm(e2)).html), "the SSO host must be https");
});

test("the callback refuses every sign-in while verifyCallback is a stub", async () => {
  const e = await env(SSO);
  const f = await openForm(e);
  const start = await post("/auth/sso/start", e, f);
  const state = /state=([A-Za-z0-9_-]+)/.exec(await start.text())[1];
  const cookie = cookiesOf(start);
  // Whatever SSO (or anyone) sends back, it is refused.
  for (const q of [`state=${state}`, `state=${state}&email=priya@example.org&token=looks-valid`]) {
    const res = await get(`/auth/sso/callback?${q}`, e, { cookie });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /isn&#39;t set up yet/);
    assert.equal(res.headers.getSetCookie().find((c) => c.includes("session=") && !c.includes("Max-Age=0")), undefined, "no session");
  }
  const posted = await call(new Request(`${BASE}/auth/sso/callback?state=${state}`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: "email=priya@example.org" }), e);
  assert.equal(posted.status, 403);
  assert.equal((await get(`/auth/sso/callback?state=other`, e, { cookie })).status, 403, "state must match");
  assert.deepEqual(await verifyCallback(new Request(BASE + "/auth/sso/callback"), e), { ok: false, reason: "BAPS SSO sign-in isn't set up yet (verifyCallback is not implemented)." });
});

test("only allowlisted editors would get in", () => {
  assert.equal(isAllowed(SSO, { email: "priya@example.org" }), true);
  assert.equal(isAllowed(SSO, { username: "NAND" }), true);
  assert.equal(isAllowed(SSO, { email: "someone@example.org" }), false);
  assert.equal(isAllowed(SSO, {}), false);
  assert.equal(isAllowed({ ...SSO, SSO_ALLOWED_EDITORS: "" }, { email: "priya@example.org" }), false);
});
