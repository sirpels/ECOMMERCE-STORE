// Owns temporary local Next dev processes, never an existing server or deployment.
// Run: node scripts/run-advisor-edge-cases.mjs [case ...]
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
const cases = ["recovery", "http503", "http429", "midstream", "disconnect", "timeout", "quota", "tool-failure", "malformed-tool", "empty-match", "empty-response", "refusal", "slow", "route-error"];
const selected = process.argv.length > 2 ? process.argv.slice(2) : cases;
if (selected.some(value => !cases.includes(value))) throw Error("Unknown local test case");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
if (await fetch("http://localhost:3100/api/health", { signal: AbortSignal.timeout(800) }).then(() => true, () => false)) throw Error("Port 3100 is occupied. Stop your local dev server first.");
function run(file, args, options = {}) {
  const child = spawn(file, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options });
  let output = "";
  child.stdout.on("data", data => { output += data; }); child.stderr.on("data", data => { output += data; });
  const completed = new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => resolve({ code, output })); });
  return { child, completed, output: () => output };
}
async function stopOwnedServer(server) {
  // The exact PID comes only from spawn above. On Windows kill its child tree too.
  if (server.child.exitCode !== null) return;
  if (process.platform === "win32") await run("taskkill.exe", ["/PID", String(server.child.pid), "/T", "/F"]).completed;
  else { server.child.kill("SIGTERM"); await server.completed; }
  await delay(700);
}
for (const scenario of selected) {
  const env = { ...process.env, DEBUG: "", ADVISOR_DEV_SCENARIO: scenario === "route-error" ? "recovery" : scenario, ADVISOR_DEV_ROUTE_ERROR: scenario === "route-error" ? "once" : "", FABRIC_GUIDANCE_TEST_FAILURE: "" };
  const server = run(process.execPath, [load.resolve("next/dist/bin/next"), "dev", "--port", "3100"], { env });
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (server.output().includes("Ready in")) { ready = true; break; }
      if (server.child.exitCode !== null) break;
      await delay(200);
    }
    if (!ready) throw Error(`Local server did not become ready for ${scenario}`);
    const test = run(process.execPath, ["scripts/verify-advisor-edge-cases.mjs"], { env: { ...process.env, ADVISOR_BROWSER_CASE: scenario } });
    const timeout = setTimeout(() => test.child.kill(), 90000);
    const result = await test.completed; clearTimeout(timeout);
    if (result.code !== 0) { console.log(result.output); throw Error(`Browser scenario failed: ${scenario}`); }
    const report = JSON.parse(result.output);
    console.log(JSON.stringify({ scenario, passed: true, requests: report.requests, httpStatuses: report.httpStatuses, recovery: report.recovered ?? report.retryRecovery ?? false, secondFailureRecoverable: report.secondFailureRecoverable ?? false }));
  } finally { await stopOwnedServer(server); }
}
