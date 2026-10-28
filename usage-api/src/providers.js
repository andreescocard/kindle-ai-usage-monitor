import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CLAUDE_AUTH = process.env.CLAUDE_AUTH_FILE || "/data/.claude/.credentials.json";
const CODEX_AUTH = process.env.CODEX_AUTH_FILE || "/data/.codex/auth.json";

export class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(path, provider) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new ProviderError("not_authenticated", `${provider} is not signed in`);
    }
    throw new ProviderError("unavailable", `Could not read ${provider} credentials`);
  }
}

async function requestJson(url, headers) {
  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ProviderError("unavailable", "Subscription service is unreachable");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("auth_expired", "Authentication expired");
  }
  if (!response.ok) {
    throw new ProviderError("unavailable", `Subscription service returned ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError("unavailable", "Subscription service returned invalid data");
  }
}

function runRefresh(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: "/tmp",
      env: process.env,
      stdio: "ignore",
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export function normalizeClaude(payload) {
  const map = (bucket) => bucket && ({
    usedPercent: clampPercent(bucket.utilization),
    resetsAt: bucket.resets_at || null,
  });
  return {
    fiveHour: map(payload.five_hour),
    weekly: map(payload.seven_day),
  };
}

export function normalizeCodex(payload) {
  const limits = payload?.rate_limit;
  const map = (window) => window && ({
    usedPercent: clampPercent(window.used_percent),
    resetsAt: Number.isFinite(window.reset_at)
      ? new Date(window.reset_at * 1000).toISOString()
      : null,
  });
  return {
    fiveHour: map(limits?.primary_window),
    weekly: map(limits?.secondary_window),
  };
}

function clampPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 0;
}

async function fetchClaude() {
  const auth = await readJson(CLAUDE_AUTH, "Claude Code");
  const token = auth?.claudeAiOauth?.accessToken;
  if (!token) throw new ProviderError("not_authenticated", "Claude Code is not signed in");
  const payload = await requestJson(CLAUDE_USAGE_URL, {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
    "user-agent": "kindle-ai-usage-dashboard",
  });
  return normalizeClaude(payload);
}

async function fetchCodex() {
  const auth = await readJson(CODEX_AUTH, "Codex");
  const token = auth?.tokens?.access_token;
  if (!token) throw new ProviderError("not_authenticated", "Codex is not signed in");
  const headers = {
    Authorization: `Bearer ${token}`,
    "user-agent": "codex-cli",
  };
  if (auth.tokens.account_id) headers["ChatGPT-Account-Id"] = auth.tokens.account_id;
  return normalizeCodex(await requestJson(CODEX_USAGE_URL, headers));
}

async function pollWithRefresh(fetcher, refreshCommand, refreshArgs) {
  try {
    return await fetcher();
  } catch (error) {
    if (!(error instanceof ProviderError) || error.status !== "auth_expired") throw error;
    await runRefresh(refreshCommand, refreshArgs);
    try {
      return await fetcher();
    } catch (retryError) {
      if (retryError instanceof ProviderError && retryError.status === "auth_expired") {
        throw new ProviderError("not_authenticated", "Sign in again");
      }
      throw retryError;
    }
  }
}

export function pollClaude() {
  return pollWithRefresh(fetchClaude, "claude", ["-p", "."]);
}

export function pollCodex() {
  return pollWithRefresh(fetchCodex, "codex", ["exec", "."]);
}

