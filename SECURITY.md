# Security

The public website is static files: nothing on it accepts input or holds secrets. The risk is in **editing**: the
editor at `/admin/` (Decap CMS), the sign-in service in `auth/`, and the GitHub repository the editor writes to.
This file covers what the code already does, and the setup that needs your own accounts.

## What is already in place (in the code)

**Editor (`/admin/`)**
- Decap CMS is pinned to one release (3.16.3) and loaded with a Subresource Integrity hash, so the browser refuses it if the CDN ever serves a different file.
- Every change is a pull request (`publish_mode: editorial_workflow`): editors save drafts, mark them ready for review, and someone with merge rights publishes them.
- The admin page has its own Content-Security-Policy (only Decap's script, GitHub's API, image previews), `noindex, nofollow`, `no-referrer`, and `robots.txt` disallows `/admin/`.
  It allows `'unsafe-eval'` because Decap validates its configuration with ajv, which compiles code at runtime (without it the admin doesn't load). This applies only to the admin page.
- Uploads go into one folder (`src/images/`), from the computer only (no pasting web addresses), at most 2 MB each.
- The admin is **not** in the review preview: review builds (`SITE_REVIEW=1`) leave out `/admin/` entirely. The `auth/` folder is never part of any site build.

**Public pages**
- Content-Security-Policy: scripts only from the site itself, plus each page's one inline script by its hash (worked out at build time); no frames, plugins or outside connections. Styles allow inline because the design uses `style` attributes. `Referrer-Policy: strict-origin-when-cross-origin`.
  Adding analytics, a map or a video later means adding its host to `publicCsp` in `eleventy.config.js` first.

**Content checks on every pull request** (`.github/workflows/check.yml`, `npm run check-content`)
- Topics: WebNext limits (sub heading 100, description 2000 characters), stable IDs, every page's topics and styles exist.
- Text has no HTML in the files: fields are plain text, descriptions are Markdown (with raw HTML turned off), and anything in the files that looks like HTML fails the check. The HTML the build makes from it may only contain `p a mark br strong em span` with `href class style data-todo aria-hidden lang`; links must be `/…`, `#…`, `https://…`, `mailto:`, `tel:` or `todo:`; anything script-like fails.
- Images: JPEG, PNG, WebP or AVIF only (checked by content, not just name), at most 2 MB, no sub-folders.

**Sign-in service (`auth/`)**: see below. Tests: `npm test` (or `node --test auth/test/`).

## Setup that needs your accounts

Do these once the site has its real GitHub repository and hosting. None of it can be done from code.

1. **Two-factor authentication** on every GitHub account with write access to the repository (Settings → Password and authentication). Better still, require it for the organisation.
2. **Protect `main`** (repository Settings → Rules → Rulesets, or Branches → Branch protection):
   - require a pull request before merging, with **at least 1 approving review**; dismiss approvals when new commits are pushed;
   - require the **Check** status to pass;
   - block force pushes and deletion;
   - **no bypass**, including administrators and the account that owns the editor's token.
3. **Who gets write access**: only the people who review and merge. Editors using the simple sign-in don't need GitHub accounts; their changes arrive as pull requests from the token's account. Review the list of collaborators when people change roles.
4. **The editor's GitHub token** (`GITHUB_TOKEN` secret of the sign-in service):
   - a **fine-grained personal access token**, ideally owned by a separate "museum-website-bot" account that has 2FA and no other access;
   - repository access: **only this repository**; permissions: **Contents: read and write**, **Pull requests: read and write**, Metadata: read; expiry **90 days**.
   - Note: with Decap's GitHub backend the token is handed to the editor's browser. Anyone signed in to the editor could copy it, so branch protection (step 2) is what keeps it to proposing changes. Rotate it when an editor leaves.
5. **Put `/admin/` behind Cloudflare Access** (or your host's equivalent: Netlify site protection, Vercel password protection) once hosted, allowing only editors' email addresses. Put the sign-in service's address behind the same policy. This adds a second sign-in in front of everything editable.
6. **Host headers**: a `<meta>` CSP can't stop the site being framed. On the host, add `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) and `Strict-Transport-Security` for the site and admin.

## The sign-in service (`auth/`)

Decap opens the service in a popup. The person signs in there; the service then hands the GitHub token to the
editor window, but only if that window is on an allowed address. Written as a plain `fetch` handler: it runs as a
Cloudflare Worker as is, and can be wrapped for Netlify or Vercel functions.

- **HTTPS only.** Any plain-HTTP request is refused with 403 before anything is read: no form is shown and no credentials are accepted. The only exception is `localhost` when `ALLOW_HTTP_LOCALHOST=true` (development). Behind a proxy that ends TLS (Netlify, Vercel) set `TRUST_FORWARDED_PROTO=true`. Every response sends `Strict-Transport-Security`.
- Credentials only travel in a **POST** body; `GET /auth/login` and anything with a query string are refused.
- Passwords are stored only as **salted PBKDF2-SHA256** hashes (100,000 iterations, the most Cloudflare Workers allow), compared in constant time; an unknown username takes as long as a wrong password, and both get the same message.
- **Lockout**: 5 failed attempts for a username, or 20 from one address, locks sign-in for 15 minutes. Counts are kept in a KV namespace if you bind one as `AUTH_KV` (recommended; otherwise each running instance keeps its own).
- **CSRF**: the form carries a signed, expiring token that must match a `SameSite=Strict` cookie, and cross-site POSTs are refused.
- **Session**: a signed cookie, `HttpOnly; Secure; SameSite=Strict; __Host-` prefix, valid 5 minutes and used once (cleared when the token page is sent).
- **Hand-off**: the token page only answers a window on `ALLOWED_ORIGINS`, and only sends the token to that origin.
- **Logging**: one line per event with fixed fields (event, provider, outcome, username on success). Request bodies, passwords, tokens and cookies are never logged; a test checks this.
- Pages have a strict CSP with a per-response nonce, `frame-ancestors 'none'`, `no-store`, and `Referrer-Policy: same-origin` (not `no-referrer`, which makes browsers send `Origin: null` on the sign-in form and breaks the cross-site check).

### Secrets and settings

| Name | Secret? | What |
| --- | --- | --- |
| `SESSION_SECRET` | yes | At least 32 random characters, e.g. `openssl rand -base64 48`. Changing it signs everyone out. |
| `GITHUB_TOKEN` | yes | The fine-grained token from step 4 above. |
| `SIMPLE_USERS` | yes | JSON: `{"priya": "pbkdf2-sha256$100000$…$…", …}` |
| `ALLOWED_ORIGINS` | no | Where `/admin/` is served, comma-separated, no trailing slash: `https://museum.example.org` |
| `AUTH_PROVIDERS` | no | `simple` (default), `baps-sso`, or `simple,baps-sso` |
| `SSO_BASE_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_KEY`, `SSO_ALLOWED_EDITORS` | ID and key yes | BAPS SSO, see below |
| `TRUST_FORWARDED_PROTO` | no | `true` behind Netlify/Vercel |
| `ALLOW_HTTP_LOCALHOST` | no | `true` only when running on your own computer |

Never put real values in the repository. `auth/wrangler.example.toml` shows the Cloudflare layout; secrets go in with `wrangler secret put NAME`.

### Deploying (Cloudflare Workers)

1. `cd auth && cp wrangler.example.toml wrangler.toml` (not committed), set `ALLOWED_ORIGINS`.
2. `wrangler secret put SESSION_SECRET`, `GITHUB_TOKEN`, `SIMPLE_USERS`. Optional: create a KV namespace and bind it as `AUTH_KV`.
3. `wrangler deploy`, and give it an HTTPS address of its own (e.g. `editor-auth.museum.example.org`).
4. In `scripts/cms-config.js` set `AUTH_SERVICE_URL` to that address and `backend.repo` to the repository, then `npm run cms-config` and commit.

### Adding or removing an editor

1. `npm run hash-password -- priya` and type their password (at least 12 characters; it isn't shown or saved).
2. Add the printed line to the `SIMPLE_USERS` JSON and save it again: `wrangler secret put SIMPLE_USERS`.
3. To remove someone, delete their line and save the secret again. If they may have kept the GitHub token, rotate it too.

### Rotating the GitHub token

Create a new token (same settings), `wrangler secret put GITHUB_TOKEN`, check you can sign in to the editor, then revoke the old token on GitHub. Do this before it expires, and whenever an editor leaves.

### Upgrading Decap CMS

Change `DECAP_VERSION` in `eleventy.config.js`, then set `DECAP_INTEGRITY` to the new file's hash:
`curl -sL https://cdn.jsdelivr.net/npm/decap-cms@<version>/dist/decap-cms.js | openssl dgst -sha384 -binary | openssl base64 -A` (prefix it with `sha384-`). Check that `/admin/` loads.

## Switching to BAPS SSO

The `baps-sso` provider is written but **off**, and its `verifyCallback()` in `auth/src/providers/baps-sso.js` refuses every sign-in until it is implemented. It follows WebNext's hand-off as we understand it: the browser POSTs `client_id`, `client_key` and `redirect_uri` to the SSO host's root, the person signs in, SSO returns to `redirect_uri`. The service adds a one-time `state` value to `redirect_uri` and checks it on return.

**Ask the SSO team:**
1. Registration of our `redirect_uri` (`https://<auth service>/auth/sso/callback`) and our `client_id` / `client_key`. Is there a test environment?
2. What exactly comes back to `redirect_uri`: GET or POST, which fields, and which identify the person (email, username, BAPS ID)?
3. **How do we verify it is genuine?** A signed token (which algorithm, where are the public keys), or a code we exchange server-to-server using the client key? Lifetime, and an audience/client check.
4. Is `client_key` meant to be sent from the browser? In the hand-off above it is visible to anyone who opens the sign-in page. If there is a server-to-server alternative, we should use it.
5. Do they pass a `state` or `nonce` through, and is there a sign-out or session-length rule we should follow?

**Then:**
1. Set `SSO_BASE_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_KEY` (secrets) and `SSO_ALLOWED_EDITORS` (who may edit, by email or username).
2. Implement `verifyCallback()` to return `{ ok: true, identity: { email, username } }` only for a proven, recent sign-in for our client; add tests for a valid, a forged, an expired and another client's response.
3. Set `AUTH_PROVIDERS=simple,baps-sso` and try it. Once everyone can use SSO, set `AUTH_PROVIDERS=baps-sso` and remove `SIMPLE_USERS`.
