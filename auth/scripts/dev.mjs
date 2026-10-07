// Runs the service on http://localhost:8788 for trying the editor locally. Development only:
// it allows plain HTTP because it is on localhost. Settings come from the environment (see SECURITY.md).
//   SESSION_SECRET=… SIMPLE_USERS='{"test":"pbkdf2…"}' GITHUB_TOKEN=… ALLOWED_ORIGINS=http://localhost:8090 node auth/scripts/dev.mjs
import http from "node:http";
import worker from "../src/index.js";

const PORT = +(process.env.PORT || 8788);
const env = { ...process.env, ALLOW_HTTP_LOCALHOST: "true" };
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks);
  const response = await worker.fetch(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body }), env);
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = k === "set-cookie" ? response.headers.getSetCookie() : v; });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`sign-in service on http://localhost:${PORT}/auth`));
