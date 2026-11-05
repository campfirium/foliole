/* global process */
const { pathToFileURL } = require('node:url');

import(pathToFileURL(process.argv[1]).href).catch(() => {
  process.stderr.write('{"error":"cli_agent_script_unavailable"}\n');
  process.exitCode = 3;
});
