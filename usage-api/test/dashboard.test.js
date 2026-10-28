import test from "node:test";
import assert from "node:assert/strict";
import { normalizeClaude, normalizeCodex } from "../src/providers.js";
import { renderDashboard } from "../src/view.js";

test("normalizes Claude and Codex subscription windows", () => {
  assert.deepEqual(normalizeClaude({ five_hour: { utilization: 68, resets_at: "2026-07-22T16:17:00Z" }, seven_day: { utilization: 51, resets_at: null } }), {
    fiveHour: { usedPercent: 68, resetsAt: "2026-07-22T16:17:00Z" }, weekly: { usedPercent: 51, resetsAt: null },
  });
  assert.equal(normalizeCodex({ rate_limit: { primary_window: { used_percent: 79, reset_at: 1800001000 } } }).fiveHour.usedPercent, 79);
});

test("renders a script-free Kindle page with five-minute fallback", () => {
  const now = new Date("2026-07-22T17:35:00Z");
  const snapshot = {
    updatedAt: now.toISOString(),
    claude: { available: true, status: "available", attemptedAt: now.toISOString(), fiveHour: { usedPercent: 68, resetsAt: "2026-07-22T18:35:00Z" }, weekly: null },
    codex: { available: false, status: "not_authenticated", attemptedAt: now.toISOString() },
  };
  const html = renderDashboard(snapshot, now);
  assert.match(html, /http-equiv="refresh" content="300"/);
  assert.match(html, /CLAUDE CODE/);
  assert.match(html, /Não autenticado/);
  assert.doesNotMatch(html, /<script/);
});

