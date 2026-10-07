// Provider "simple": a list of editors with passwords, kept as PBKDF2 hashes in the SIMPLE_USERS secret:
//   SIMPLE_USERS='{"priya": "pbkdf2-sha256$100000$…$…", "nand": "pbkdf2-sha256$100000$…$…"}'
// Make a hash with: node auth/scripts/hash-password.mjs
import { verifyPassword } from "../crypto.js";

export const name = "simple";

export function users(env) {
  try {
    const u = JSON.parse(env.SIMPLE_USERS || "{}");
    return u && typeof u === "object" && !Array.isArray(u) ? u : {};
  } catch {
    return {};
  }
}

// Usernames are case-insensitive. Always runs the full password check, even for an unknown name.
export async function authenticate(env, username, password) {
  const list = users(env);
  const key = Object.keys(list).find((k) => k.toLowerCase() === String(username || "").trim().toLowerCase());
  const ok = await verifyPassword(String(password || ""), key ? list[key] : null);
  return ok && key ? { user: key } : null;
}
