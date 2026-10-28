import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { pollClaude, pollCodex, ProviderError } from "./providers.js";
import { renderDashboard } from "./view.js";

const port = Number.parseInt(process.env.PORT || "8787", 10);
const pollMs = Math.max(60, Number.parseInt(process.env.POLL_SECONDS || "300", 10)) * 1000;
const localToken = process.env.LOCAL_TOKEN || "";
await Promise.all([
  mkdir(process.env.CLAUDE_CONFIG_DIR || "/data/.claude", { recursive: true }),
  mkdir(process.env.CODEX_HOME || "/data/.codex", { recursive: true }),
]);
const unavailable = () => ({ available: false, status: "unavailable", attemptedAt: new Date().toISOString() });
let snapshot = { updatedAt: new Date().toISOString(), claude: unavailable(), codex: unavailable() };

function safeProvider(result, attemptedAt, previous) {
  if (result.status === "fulfilled") return { available: true, status: "available", attemptedAt, ...result.value };
  const status = result.reason instanceof ProviderError ? result.reason.status : "unavailable";
  console.error(`[${attemptedAt}] provider poll failed: ${status}`);
  // Keep last good data on transient failure so brief rate limits (429) don't blank the display.
  if (status !== "not_authenticated" && previous?.available) {
    return { ...previous, attemptedAt };
  }
  return { available: false, status, attemptedAt };
}

async function refresh() {
  const attemptedAt = new Date().toISOString();
  const [claude, codex] = await Promise.allSettled([pollClaude(), pollCodex()]);
  snapshot = {
    updatedAt: new Date().toISOString(),
    claude: safeProvider(claude, attemptedAt, snapshot.claude),
    codex: safeProvider(codex, attemptedAt, snapshot.codex),
  };
}

function authorized(url) {
  if (!localToken) return true;
  const supplied = url.searchParams.get("token") || "";
  const expectedHash = createHash("sha256").update(localToken).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

const noCache = {
  "cache-control": "no-store, no-cache, must-revalidate",
  pragma: "no-cache",
  expires: "0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (!authorized(url)) {
    response.writeHead(401, { ...noCache, "content-type": "text/plain; charset=utf-8" }).end("Não autorizado");
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, { ...noCache, allow: "GET" }).end();
    return;
  }
  if (url.pathname === "/kindle" || url.pathname === "/kindle/") {
    response.writeHead(200, { ...noCache, "content-type": "text/html; charset=utf-8" }).end(renderDashboard(snapshot));
    return;
  }
  if (url.pathname === "/api/usage") {
    const body = JSON.stringify({ ...snapshot, stale: Date.now() - new Date(snapshot.updatedAt) > 900_000 });
    response.writeHead(200, { ...noCache, "content-type": "application/json; charset=utf-8" }).end(body);
    return;
  }
  response.writeHead(404, { ...noCache, "content-type": "text/plain; charset=utf-8" }).end("Not found");
}).listen(port, "0.0.0.0", () => console.log(`Kindle dashboard listening on port ${port}`));

refresh();
setInterval(refresh, pollMs).unref();
