// The few HTML pages the service shows. Every value is escaped; scripts and styles run only with a per-response nonce.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// JSON that is safe inside a <script> element.
const js = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const STYLE = `body{font:16px/1.5 system-ui,sans-serif;background:#F7F4EF;color:#1C1410;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{background:#fff;padding:32px;max-width:360px;width:100%;box-shadow:0 20px 40px -30px rgba(28,20,16,.5)}
h1{font-size:20px;margin:0 0 20px}label{display:block;font-weight:600;font-size:14px;margin:14px 0 4px}
input{width:100%;box-sizing:border-box;min-height:44px;padding:0 12px;border:1px solid #B9A68D;border-radius:2px;font:inherit}
button{margin-top:20px;width:100%;min-height:48px;border:0;border-radius:2px;background:#B4441C;color:#fff;font:inherit;font-weight:600;cursor:pointer}
button.alt{background:#1C1410}.err{background:#FBE9E4;padding:10px 12px;font-size:14px}.or{text-align:center;margin:20px 0 0;font-size:14px;color:#6B5D50}`;

export function page({ title, body, nonce, script = "", formAction = "'self'" }) {
  const csp = [
    "default-src 'none'", `style-src 'nonce-${nonce}'`, `script-src 'nonce-${nonce}'`,
    `form-action ${formAction}`, "frame-ancestors 'none'", "base-uri 'none'",
  ].join("; ");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title><style nonce="${nonce}">${STYLE}</style></head>
<body><main>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
  return { html, csp };
}

export function loginPage({ nonce, csrf, simple, sso, error, username = "" }) {
  let body = `<h1>Sign in to edit the museum website</h1>`;
  if (error) body += `<p class="err" role="alert">${esc(error)}</p>`;
  if (simple) {
    body += `<form method="post" action="/auth/login" autocomplete="on">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<label for="u">Username</label><input id="u" name="username" autocomplete="username" required value="${esc(username)}">
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button></form>`;
  }
  if (simple && sso) body += `<p class="or">or</p>`;
  if (sso) {
    body += `<form method="post" action="/auth/sso/start"><input type="hidden" name="csrf" value="${esc(csrf)}">
<button type="submit" class="${simple ? "alt" : ""}">Sign in with BAPS SSO</button></form>`;
  }
  if (!simple && !sso) body += `<p class="err">No sign-in method is switched on. See SECURITY.md.</p>`;
  return page({ title: "Sign in — museum website", body, nonce });
}

// Sends the browser on to the SSO host with the fields it expects.
export function ssoRedirectPage({ nonce, action, fields }) {
  const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  const body = `<h1>Signing in with BAPS SSO…</h1><form id="go" method="post" action="${esc(action)}">${inputs}<button type="submit">Continue</button></form>`;
  return page({ title: "Signing in…", body, nonce, script: `document.getElementById("go").submit();`, formAction: new URL(action).origin });
}

export function messagePage({ nonce, title, text }) {
  return page({ title, body: `<h1>${esc(title)}</h1><p>${esc(text)}</p>`, nonce });
}

// Decap's sign-in hand-off: tell the admin window we're here, wait for it to answer from an allowed origin,
// then send the token to that origin only.
export function handoffPage({ nonce, allowedOrigins, message }) {
  const script = `(function () {
  var allowed = ${js(allowedOrigins)}, message = ${js(message)};
  if (!window.opener) { document.body.textContent = "Open the editor and sign in from there."; return; }
  function receive(e) {
    if (allowed.indexOf(e.origin) === -1 || e.data !== "authorizing:github") return;
    window.removeEventListener("message", receive);
    window.opener.postMessage(message, e.origin);
    setTimeout(function () { window.close(); }, 300);
  }
  window.addEventListener("message", receive, false);
  window.opener.postMessage("authorizing:github", "*");
})();`;
  return page({ title: "Signed in", body: `<h1>Signed in</h1><p>You can close this window.</p>`, nonce, script });
}
