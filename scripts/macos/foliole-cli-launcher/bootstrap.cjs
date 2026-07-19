/* global process */

const { pathToFileURL } = require('node:url');

const agentScript = process.env.FOLIOLE_AGENT_SCRIPT;
if (!agentScript) {
  process.stderr.write('{"error":"cli_agent_script_unavailable"}\n');
  process.exitCode = 3;
} else {
  process.argv[1] = agentScript;
  import(pathToFileURL(agentScript).href).catch(() => {
    process.stderr.write('{"error":"cli_agent_script_unavailable"}\n');
    process.exitCode = 3;
  });
}
