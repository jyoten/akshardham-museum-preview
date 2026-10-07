// Provider "baps-sso": sign in through BAPS single sign-on, the way WebNext does. OFF unless AUTH_PROVIDERS
// includes "baps-sso".
//
// What we know of the hand-off: the app POSTs client_id, client_key and redirect_uri to the SSO host's root,
// the person signs in there, and SSO sends them back to redirect_uri. What comes back, and how to check it is
// genuine, isn't known yet, so verifyCallback() refuses every sign-in until it is written. See SECURITY.md for
// what to ask the SSO team.
//
// Settings (environment variables, never committed):
//   SSO_BASE_URL         the SSO host, e.g. https://sso.example.org
//   SSO_CLIENT_ID        this app's client id
//   SSO_CLIENT_KEY       this app's client key
//   SSO_ALLOWED_EDITORS  comma-separated emails or usernames allowed to edit, e.g. "priya@example.org,nand"

export const name = "baps-sso";

export function settings(env) {
  return {
    baseUrl: String(env.SSO_BASE_URL || "").replace(/\/+$/, ""),
    clientId: env.SSO_CLIENT_ID || "",
    clientKey: env.SSO_CLIENT_KEY || "",
    allowed: String(env.SSO_ALLOWED_EDITORS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
}

export function configured(env) {
  const s = settings(env);
  return /^https:\/\//.test(s.baseUrl) && !!s.clientId && !!s.clientKey;
}

// The fields the browser POSTs to the SSO host to start signing in.
export function startFields(env, redirectUri) {
  const s = settings(env);
  return { action: s.baseUrl + "/", fields: { client_id: s.clientId, client_key: s.clientKey, redirect_uri: redirectUri } };
}

// Only editors on the allowlist get in, even with a valid SSO sign-in.
export function isAllowed(env, identity) {
  const s = settings(env);
  const ids = [identity && identity.email, identity && identity.username].filter(Boolean).map((x) => String(x).toLowerCase());
  return ids.length > 0 && ids.some((id) => s.allowed.includes(id));
}

// ---------------------------------------------------------------------------------------------------------
// TODO(BAPS SSO): check that the callback really came from BAPS SSO, and for this sign-in.
// Must return { ok: true, identity: { email, username } } only when the response is proven genuine (for
// example a signature checked against SSO's published key, or a server-to-server call that exchanges a code
// using SSO_CLIENT_KEY), it is recent, and it is for SSO_CLIENT_ID. Until then it refuses everyone.
// ---------------------------------------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
export async function verifyCallback(request, env) {
  return { ok: false, reason: "BAPS SSO sign-in isn't set up yet (verifyCallback is not implemented)." };
}
