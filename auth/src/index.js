// Sign-in service for the museum website's editor (Decap CMS, GitHub backend).
// A plain fetch handler: deploy as a Cloudflare Worker, or wrap for Netlify/Vercel functions. See SECURITY.md.
//
//   GET  /auth                 Decap opens this in a popup: the sign-in page
//   POST /auth/login           username + password (provider "simple")
//   POST /auth/sso/start       hand over to BAPS SSO (provider "baps-sso", off by default)
//   GET|POST /auth/sso/callback  BAPS SSO comes back here (refuses everyone until verifyCallback is written)
//   GET  /auth/done            after signing in: hands the GitHub token to the editor window
//
// Secrets and settings (environment): SESSION_SECRET, GITHUB_TOKEN, ALLOWED_ORIGINS, AUTH_PROVIDERS, SIMPLE_USERS,
// SSO_BASE_URL, SSO_CLIENT_ID, SSO_CLIENT_KEY, SSO_ALLOWED_EDITORS, ALLOW_HTTP_LOCALHOST, TRUST_FORWARDED_PROTO.
import { randomToken } from "./crypto.js";
import { makeCsrf, checkCsrf, makeSession, readSession, setCookie, clearCookie, getCookie, SESSION_SECONDS, CSRF_SECONDS } from "./session.js";
import { storeFor, isLocked, recordFailure, recordSuccess } from "./ratelimit.js";
import { loginPage, ssoRedirectPage, messagePage, handoffPage } from "./pages.js";
import * as simple from "./providers/simple.js";
import * as sso from "./providers/baps-sso.js";
import { log } from "./log.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_FORM_BYTES = 4096;

export function providers(env) {
  const list = String(env.AUTH_PROVIDERS || "simple").split(",").map((s) => s.trim()).filter(Boolean);
  return { simple: list.includes("simple"), sso: list.includes("baps-sso") };
}
export const allowedOrigins = (env) => String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter((s) => /^https?:\/\//.test(s));

// HTTPS only. Plain HTTP is refused before anything is read, except on localhost when ALLOW_HTTP_LOCALHOST=true.
// Behind a proxy that ends TLS (Netlify, Vercel), set TRUST_FORWARDED_PROTO=true to accept X-Forwarded-Proto: https.
export function transport(request, env) {
  const url = new URL(request.url);
  if (url.protocol === "https:") return { ok: true, secure: true };
  if (env.TRUST_FORWARDED_PROTO === "true" && request.headers.get("x-forwarded-proto") === "https") return { ok: true, secure: true };
  if (env.ALLOW_HTTP_LOCALHOST === "true" && LOCAL_HOSTS.has(url.hostname)) return { ok: true, secure: false };
  return { ok: false };
}

function respond(body, { status = 200, headers = {}, csp, secure = true } = {}) {
  const h = new Headers(headers);
  if (secure) h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  h.set("Cache-Control", "no-store");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  // "same-origin", not "no-referrer": with no-referrer, browsers send "Origin: null" on the form POST and the
  // same-origin check below would refuse every real sign-in. Nothing is sent to other sites either way.
  h.set("Referrer-Policy", "same-origin");
  h.set("Cross-Origin-Opener-Policy", "unsafe-none"); // the hand-off page must be able to reach window.opener
  if (csp) h.set("Content-Security-Policy", csp);
  if (typeof body === "string" && !h.has("Content-Type")) h.set("Content-Type", csp ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
  return new Response(body, { status, headers: h });
}
const html = (pg, opts = {}) => respond(pg.html, { ...opts, csp: pg.csp });
const clientIp = (request) => request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";

// Reads a small urlencoded form. Never logged.
async function readForm(request) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (type !== "application/x-www-form-urlencoded") return null;
  const text = await request.text();
  if (text.length > MAX_FORM_BYTES) return null;
  return new URLSearchParams(text);
}
// A POST must come from a page of this service: same Origin (when the browser sends one).
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function signInPage(request, env, t, { error, username, status = 200 } = {}) {
  const csrf = await makeCsrf(env.SESSION_SECRET);
  const p = providers(env);
  const nonce = randomToken(16);
  return html(loginPage({ nonce, csrf, simple: p.simple, sso: p.sso && sso.configured(env), error, username }), {
    status, secure: t.secure, headers: { "Set-Cookie": setCookie("csrf", csrf, { secure: t.secure, maxAge: CSRF_SECONDS }) },
  });
}
const message = (t, status, title, text) => html(messagePage({ nonce: randomToken(16), title, text }), { status, secure: t.secure });

async function signedIn(env, t, user, provider) {
  const session = await makeSession(user, provider, env.SESSION_SECRET);
  log({ event: "sign-in", provider, outcome: "ok", user });
  const h = new Headers({ Location: "/auth/done" });
  h.append("Set-Cookie", setCookie("session", session, { secure: t.secure, maxAge: SESSION_SECONDS }));
  h.append("Set-Cookie", clearCookie("csrf", t.secure));
  return respond(null, { status: 303, headers: h, secure: t.secure });
}

export async function handle(request, env) {
  const t = transport(request, env);
  if (!t.ok) return respond("HTTPS required.", { status: 403, secure: false });

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) return message(t, 500, "Not set up", "The sign-in service has no SESSION_SECRET.");
  const p = providers(env);

  if (path === "/auth" && method === "GET") return signInPage(request, env, t);

  if (path === "/auth/login") {
    if (!p.simple) return respond("Not found.", { status: 404, secure: t.secure });
    if (method !== "POST") return respond("Use the sign-in form.", { status: 405, headers: { Allow: "POST" }, secure: t.secure });
    // Credentials only ever travel in the POST body, never in the address.
    if (url.search) return respond("Credentials must not be sent in the address.", { status: 400, secure: t.secure });
    if (!sameOrigin(request)) return respond("Forbidden.", { status: 403, secure: t.secure });
    const form = await readForm(request);
    if (!form) return respond("Bad request.", { status: 400, secure: t.secure });
    if (!(await checkCsrf(form.get("csrf"), getCookie(request, "csrf", t.secure), env.SESSION_SECRET))) {
      log({ event: "sign-in", provider: "simple", outcome: "bad-csrf" });
      return signInPage(request, env, t, { error: "The form expired. Please try again.", status: 403 });
    }
    const username = String(form.get("username") || "").trim().slice(0, 100);
    const store = storeFor(env), ip = clientIp(request);
    if (await isLocked(store, username, ip)) {
      log({ event: "sign-in", provider: "simple", outcome: "locked" });
      return signInPage(request, env, t, { error: "Too many attempts. Wait 15 minutes and try again.", status: 429 });
    }
    const ok = await simple.authenticate(env, username, form.get("password"));
    if (!ok) {
      await recordFailure(store, username, ip);
      log({ event: "sign-in", provider: "simple", outcome: "failed" });
      return signInPage(request, env, t, { error: "That username and password don't match.", username, status: 401 });
    }
    await recordSuccess(store, username);
    return signedIn(env, t, ok.user, "simple");
  }

  if (path === "/auth/sso/start") {
    if (!p.sso || !sso.configured(env)) return respond("Not found.", { status: 404, secure: t.secure });
    if (method !== "POST") return respond("Use the sign-in page.", { status: 405, headers: { Allow: "POST" }, secure: t.secure });
    if (!sameOrigin(request)) return respond("Forbidden.", { status: 403, secure: t.secure });
    const form = await readForm(request);
    if (!form || !(await checkCsrf(form.get("csrf"), getCookie(request, "csrf", t.secure), env.SESSION_SECRET))) {
      return signInPage(request, env, t, { error: "The form expired. Please try again.", status: 403 });
    }
    // A one-time value that must come back on the callback, so nobody can finish a sign-in they didn't start.
    const state = randomToken(18);
    const redirectUri = `${url.origin}/auth/sso/callback?state=${state}`;
    const s = sso.startFields(env, redirectUri);
    log({ event: "sso-start", provider: "baps-sso" });
    return html(ssoRedirectPage({ nonce: randomToken(16), action: s.action, fields: s.fields }), {
      secure: t.secure, headers: { "Set-Cookie": setCookie("sso_state", state, { secure: t.secure, maxAge: 600 }) },
    });
  }

  if (path === "/auth/sso/callback") {
    if (!p.sso || !sso.configured(env)) return respond("Not found.", { status: 404, secure: t.secure });
    const state = getCookie(request, "sso_state", t.secure);
    if (!state || url.searchParams.get("state") !== state) {
      log({ event: "sso-callback", provider: "baps-sso", outcome: "bad-state" });
      return message(t, 403, "Sign-in refused", "This sign-in wasn't started here. Please start again from the editor.");
    }
    const v = await sso.verifyCallback(request, env);
    if (!v || v.ok !== true || !v.identity) {
      log({ event: "sso-callback", provider: "baps-sso", outcome: "refused" });
      return message(t, 403, "Sign-in refused", (v && v.reason) || "BAPS SSO sign-in could not be verified.");
    }
    if (!sso.isAllowed(env, v.identity)) {
      log({ event: "sso-callback", provider: "baps-sso", outcome: "not-an-editor" });
      return message(t, 403, "Not an editor", "Your BAPS account isn't on the list of website editors.");
    }
    return signedIn(env, t, v.identity.email || v.identity.username, "baps-sso");
  }

  if (path === "/auth/done" && method === "GET") {
    const session = await readSession(getCookie(request, "session", t.secure), env.SESSION_SECRET);
    if (!session) return message(t, 401, "Not signed in", "Please sign in again from the editor.");
    const origins = allowedOrigins(env);
    if (!env.GITHUB_TOKEN || !origins.length) return message(t, 500, "Not set up", "The sign-in service needs GITHUB_TOKEN and ALLOWED_ORIGINS.");
    const msg = "authorization:github:success:" + JSON.stringify({ token: env.GITHUB_TOKEN, provider: "github" });
    // The session is used once: the cookie is cleared as the token page is sent.
    return html(handoffPage({ nonce: randomToken(16), allowedOrigins: origins, message: msg }), {
      secure: t.secure, headers: { "Set-Cookie": clearCookie("session", t.secure) },
    });
  }

  return respond("Not found.", { status: 404, secure: t.secure });
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env || {});
    } catch (e) {
      log({ event: "error", status: 500 });
      return new Response("Something went wrong.", { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  },
};
