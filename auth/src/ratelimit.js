// Failed sign-in counting and lockout. Uses a KV namespace bound as AUTH_KV when there is one (shared by all
// instances); otherwise memory, which only covers one running instance. See SECURITY.md.
export const LIMITS = { user: { max: 5, windowSeconds: 900 }, ip: { max: 20, windowSeconds: 900 } };

const memory = new Map();
export function memoryStore() {
  return {
    async get(k) { const v = memory.get(k); if (!v) return null; if (v.until < Date.now()) { memory.delete(k); return null; } return v.value; },
    async put(k, value, ttl) { memory.set(k, { value, until: Date.now() + ttl * 1000 }); },
    async delete(k) { memory.delete(k); },
  };
}
export const resetMemoryStore = () => memory.clear();
function kvStore(kv) {
  return {
    async get(k) { const v = await kv.get(k); return v === null ? null : +v; },
    async put(k, value, ttl) { await kv.put(k, String(value), { expirationTtl: Math.max(60, ttl) }); },
    async delete(k) { await kv.delete(k); },
  };
}
export const storeFor = (env) => (env.AUTH_KV ? kvStore(env.AUTH_KV) : memoryStore());

const keys = (username, ip) => ({ user: `fail:user:${String(username || "").toLowerCase()}`, ip: `fail:ip:${ip || "unknown"}` });

export async function isLocked(store, username, ip) {
  const k = keys(username, ip);
  return ((await store.get(k.user)) || 0) >= LIMITS.user.max || ((await store.get(k.ip)) || 0) >= LIMITS.ip.max;
}
export async function recordFailure(store, username, ip) {
  const k = keys(username, ip);
  await store.put(k.user, ((await store.get(k.user)) || 0) + 1, LIMITS.user.windowSeconds);
  await store.put(k.ip, ((await store.get(k.ip)) || 0) + 1, LIMITS.ip.windowSeconds);
}
export async function recordSuccess(store, username) { await store.delete(keys(username).user); }
