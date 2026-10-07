// Short-lived signed cookies: the session that carries a successful sign-in to the hand-off page,
// and the CSRF token for the sign-in form.
import { randomToken, sign, signedVerify, toB64url, fromB64url } from "./crypto.js";

export const SESSION_SECONDS = 300;
export const CSRF_SECONDS = 900;
const now = () => Math.floor(Date.now() / 1000);

// "__Host-" cookies must be Secure, path=/ and have no Domain: the browser then guarantees they came from this host.
export function cookieName(name, secure) { return (secure ? "__Host-" : "") + name; }
export function setCookie(name, value, { secure, maxAge }) {
  return `${cookieName(name, secure)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function clearCookie(name, secure) { return setCookie(name, "", { secure, maxAge: 0 }); }
export function getCookie(request, name, secure) {
  const want = cookieName(name, secure);
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === want) return part.slice(i + 1).trim();
  }
  return null;
}

const json = (o) => toB64url(new TextEncoder().encode(JSON.stringify(o)));
const unjson = (s) => JSON.parse(new TextDecoder().decode(fromB64url(s)));

export async function makeSession(user, provider, secret, seconds = SESSION_SECONDS) {
  const body = json({ sub: user, prv: provider, exp: now() + seconds, n: randomToken(8) });
  return `${body}.${await sign("session." + body, secret)}`;
}
export async function readSession(value, secret) {
  if (!value || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  const [body, sig] = value.split(".");
  if (!(await signedVerify("session." + body, sig, secret))) return null;
  try { const s = unjson(body); return s.exp > now() ? s : null; } catch { return null; }
}

// CSRF: a signed, expiring token that must arrive both in the form and in a SameSite=Strict cookie.
export async function makeCsrf(secret, seconds = CSRF_SECONDS) {
  const body = `${randomToken(18)}.${now() + seconds}`;
  return `${body}.${await sign("csrf." + body, secret)}`;
}
export async function checkCsrf(formToken, cookieToken, secret) {
  if (!formToken || !cookieToken || formToken !== cookieToken) return false;
  const m = /^([A-Za-z0-9_-]+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(formToken);
  if (!m || +m[2] < now()) return false;
  return signedVerify(`csrf.${m[1]}.${m[2]}`, m[3], secret);
}
