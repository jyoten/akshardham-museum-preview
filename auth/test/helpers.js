import worker from "../src/index.js";
import { hashPassword } from "../src/crypto.js";
import { resetMemoryStore } from "../src/ratelimit.js";

export const PASSWORD = "correct-horse-battery-staple";
export const BASE = "https://auth.example.org";
export const ADMIN = "https://museum.example.org";

let usersJson;
export async function env(extra = {}) {
  usersJson ||= JSON.stringify({ editor: await hashPassword(PASSWORD) });
  resetMemoryStore();
  return {
    SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop",
    GITHUB_TOKEN: "github_pat_TEST_ONLY",
    ALLOWED_ORIGINS: ADMIN,
    SIMPLE_USERS: usersJson,
    ...extra,
  };
}
export const call = (req, e) => worker.fetch(req, e);
export const get = (path, e, headers = {}) => call(new Request(BASE + path, { headers }), e);
export const cookiesOf = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
export const cookieLine = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(name + "="));

// Opens the sign-in page and returns what a browser would keep: the CSRF cookie and the form's token.
export async function openForm(e, base = BASE) {
  const res = await call(new Request(base + "/auth?provider=github"), e);
  const html = await res.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
  return { res, html, csrf, cookie: cookiesOf(res) };
}
export function login(e, { csrf, cookie, username = "editor", password = PASSWORD, base = BASE, origin, path = "/auth/login" }) {
  const headers = { "content-type": "application/x-www-form-urlencoded", cookie, "cf-connecting-ip": "203.0.113.7" };
  if (origin !== null) headers.origin = origin || base;
  return call(new Request(base + path, { method: "POST", headers, body: new URLSearchParams({ csrf, username, password }).toString() }), e);
}
