/* global process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PARSER_PROBE = `import(process.argv[1]).then(({ folioleMarkdownParser }) => {
  if (folioleMarkdownParser.parse('# package smoke').topNode.type.name !== 'Document') {
    throw new Error('Packaged Markdown parser returned an unexpected tree');
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });`;

const MIRROR_WORKER_PROBE = `import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
const article = {
  id: 'package-smoke', parentNodeId: null, kind: 'article', title: 'Smoke',
  hideTitleHeading: false, content: 'Body', reveal: null, anchorLink: null,
  updatedAt: '2026-09-20T00:00:00.000Z'
};
const result = await new Promise((resolve, reject) => {
  const worker = new Worker(pathToFileURL(process.argv[1]), {
    execArgv: [], workerData: { article, derivedChildren: [], manualTopics: [] }
  });
  let message;
  worker.once('message', (value) => { message = value; });
  worker.once('error', reject);
  worker.once('exit', (code) => code === 0 && message
    ? resolve(message) : reject(new Error('Mirror worker did not exit cleanly')));
});
if (result.error || result.markdown !== '# Smoke\\n\\nBody\\n') {
  throw new Error(result.error?.message || 'Packaged mirror worker returned unexpected markdown');
}`;

function runPackagedProbe(appPath, label, probe, target, run) {
  const executable = path.join(appPath, 'Contents/MacOS/Foliole');
  const result = run(executable, ['--input-type=module', '-e', probe, target], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 30_000
  });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
}

export function verifyPackagedMainMarkdownParser(appPath, run = spawnSync) {
  const parser = path.join(appPath, 'Contents/Resources/app.asar/dist/lib/core/markdown/folioleMarkdownParser.js');
  runPackagedProbe(appPath, 'packaged main Markdown parser load', PARSER_PROBE, parser, run);
}

export function verifyPackagedMirrorRenderWorker(appPath, run = spawnSync) {
  const worker = path.join(appPath, 'Contents/Resources/app.asar/dist/electron/mirror/articleMirrorRenderWorker.js');
  runPackagedProbe(appPath, 'packaged mirror worker render', MIRROR_WORKER_PROBE, worker, run);
}
