// The only logging the service does: an event name and a few fixed, harmless fields.
// Request bodies, passwords, tokens and cookies are never logged.
const ALLOWED = ["event", "provider", "outcome", "user", "path", "status"];
export function log(fields) {
  const out = {};
  for (const k of ALLOWED) if (fields[k] !== undefined) out[k] = String(fields[k]).slice(0, 80);
  console.log(JSON.stringify(out));
}
