import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { executeBounded } from './windows-bounded-process.mjs';

const { fetch, AbortSignal } = globalThis;
const root = path.resolve(process.argv[2]);
const relative = path.relative(path.resolve('.tmp/artifacts'), root);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Temporary evidence root required');
fs.mkdirSync(root, { recursive: true });
const require = createRequire(import.meta.url);
const electronRoot = path.dirname(require.resolve('electron/package.json'));
const { version } = require(path.join(electronRoot, 'package.json'));
const fileName = `electron-v${version}-win32-x64.zip`;
const url = `https://github.com/electron/electron/releases/download/v${version}/${fileName}`;
const report = { node: process.version, version, url,
  binaryPresent: fs.existsSync(path.join(electronRoot, 'dist', 'electron.exe')),
  pathFilePresent: fs.existsSync(path.join(electronRoot, 'path.txt')),
  environment: Object.fromEntries(['ELECTRON_GET_USE_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY',
    'ELECTRON_MIRROR', 'electron_config_cache'].map(key => [key, Boolean(process.env[key])])), steps: [] };
const save = () => fs.writeFileSync(path.join(root, 'electron-download.json'), JSON.stringify(report, null, 2));

async function step(name, operation) {
  const start = performance.now();
  try { report.steps.push({ name, ok: true, ...await operation(), ms: performance.now() - start }); }
  catch (error) { report.steps.push({ name, ok: false, ms: performance.now() - start,
    error: error.message, code: error.code, cause: error.cause?.message, causeCode: error.cause?.code }); }
  save();
}

save();
await step('node-official-range', async () => {
  const response = await fetch(url, { headers: { Range: 'bytes=0-65535' }, signal: AbortSignal.timeout(15_000) });
  const destination = new URL(response.url);
  let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes >= 65536) break; }
  return { status: response.status, finalHost: destination.hostname, bytes };
});
await step('curl-official-range', async () => {
  const result = await executeBounded('curl.exe', ['--location', '--range', '0-65535',
    '--connect-timeout', '10', '--max-time', '20', '--retry', '0', '--silent', '--show-error',
    '--output', path.join(root, 'curl-range.bin'), '--write-out',
    'http=%{http_code} remote=%{remote_ip} bytes=%{size_download} total=%{time_total}', url],
  { timeoutMs: 25_000, windowsHide: true });
  return { exitCode: result.code, output: result.output };
});
await step('electron-downloader-single-attempt', async () => {
  const { downloadArtifact } = await import('@electron/get');
  let progress;
  try {
    const archive = await downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: 'x64',
      cacheRoot: process.env.electron_config_cache, checksums: require(path.join(electronRoot, 'checksums.json')),
      downloadOptions: { quiet: true, signal: AbortSignal.timeout(45_000), getProgressCallback: value => { progress = value; } } });
    return { archive, bytes: fs.statSync(archive).size, progress };
  } finally { report.lastDownloadProgress = progress ?? null; }
});
process.stdout.write(`${JSON.stringify(report)}\n`);
