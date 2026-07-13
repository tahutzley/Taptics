const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const requiredRoutes = [
  "AGENTS.md",
  "public/AGENTS.md",
  "test/AGENTS.md",
  "docs/agent/architecture.md",
  "docs/agent/gameplay.md",
  "docs/agent/frontend.md",
  "docs/agent/testing.md",
  "docs/agent/maintenance.md"
];

test("agent context stays concise and all routed sources exist", () => {
  const agentMap = readFileSync(join(root, "AGENTS.md"), "utf8");
  const lines = agentMap.split(/\r?\n/).length;

  assert.ok(lines <= 100, `root AGENTS.md should remain a concise map (found ${lines} lines)`);
  for (const route of requiredRoutes) {
    assert.equal(existsSync(join(root, route)), true, `missing agent-context route: ${route}`);
    assert.match(agentMap, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `root AGENTS.md does not route to ${route}`);
  }
  assert.match(agentMap, /Context-maintenance check/);
});
