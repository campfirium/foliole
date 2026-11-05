/* global process */

const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');

function unavailable() {
  process.stderr.write('{"error":"cli_agent_script_unavailable"}\n');
  process.exitCode = 3;
}

const agentScript = process.env.FOLIOLE_AGENT_SCRIPT;
if (!agentScript) {
  unavailable();
} else {
  try {
    const script = realpathSync(agentScript);
    process.argv[1] = script;
    createRequire(script)('./foliole-agent-entry.cjs');
  } catch {
    unavailable();
  }
}
