// Small Web Crypto helpers. Web Crypto exists in Cloudflare Workers, Deno, Netlify/Vercel edge and Node 18+.
const enc = new TextEncoder();

export function toB64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(str) {
  const s = atob(String(str).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const randomToken = (n = 24) => toB64url(randomBytes(n));

// Compares two byte arrays (or strings) in time that doesn't depend on where they differ.
export function timingSafeEqual(a, b) {
  const x = typeof a === "string" ? enc.encode(a) : new Uint8Array(a);
  const y = typeof b === "string" ? enc.encode(b) : new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// ---- passwords: PBKDF2-SHA256, stored as "pbkdf2-sha256$<iterations>$<salt>$<hash>" ----
// Cloudflare Workers allow at most 100,000 PBKDF2 iterations, so that is the default.
export const PBKDF2_ITERATIONS = 100000;
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = randomBytes(16);
  return `pbkdf2-sha256$${iterations}$${toB64url(salt)}$${toB64url(await pbkdf2(password, salt, iterations))}`;
}
export function parseHash(stored) {
  const m = /^pbkdf2-sha256\$(\d{4,7})\$([A-Za-z0-9_-]{16,})\$([A-Za-z0-9_-]{40,})$/.exec(String(stored || ""));
  return m ? { iterations: +m[1], salt: fromB64url(m[2]), hash: fromB64url(m[3]) } : null;
}
// A hash to check against when the username doesn't exist, so a wrong name takes as long as a wrong password.
const DUMMY = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export async function verifyPassword(password, stored) {
  const p = parseHash(stored) || parseHash(DUMMY);
  const got = await pbkdf2(String(password), p.salt, p.iterations);
  return timingSafeEqual(got, p.hash) && !!parseHash(stored);
}

// ---- HMAC-signed values (sessions, CSRF tokens) ----
async function hmacKey(secret) {
  if (!secret || String(secret).length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
export async function sign(value, secret) {
  return toB64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(value)));
}
export async function signedVerify(value, signature, secret) {
  return timingSafeEqual(await sign(value, secret), String(signature || ""));
}
