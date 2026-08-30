#!/usr/bin/env node
/* global console, process, URL */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function required(value, pattern, label) {
  if (!pattern.test(value ?? '')) throw new Error(`${label} is invalid`);
  return value;
}

async function main() {
  const [action, sourceRoot, attemptId, acceptanceRoot, expectedGroupId, expectedGroupTag] =
    process.argv.slice(2);
  if (action !== 'desktop-dnssd-find-acceptance') throw new Error('formal action is invalid');
  required(attemptId, /^[0-9a-f-]{36}$/u, 'formal attempt');
  required(expectedGroupId, /^group-[0-9a-f-]{36}$/u, 'expected group id');
  required(expectedGroupTag, /^[0-9a-f]{32}$/u, 'expected group tag');
  if (!path.win32.isAbsolute(sourceRoot) || !path.win32.isAbsolute(acceptanceRoot)
      || !fs.existsSync(path.win32.join(sourceRoot, 'package.json'))) {
    throw new Error('formal capsule paths are invalid');
  }
  process.env.FOLIOLE_T152_EXPECTED_GROUP_ID = expectedGroupId;
  process.env.FOLIOLE_T152_EXPECTED_GROUP_TAG = expectedGroupTag;
  const sourceUrl = pathToFileURL(path.win32.join(sourceRoot, 'scripts', 'windows'));
  const [{ formatWindowsDevFailure, runWindowsDevBuild }, { windowsDevPaths }] = await Promise.all([
    import(new URL('./windows-dev-build.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-dev-paths.mjs', `${sourceUrl.href}/`))
  ]);
  const paths = { ...windowsDevPaths({ repoRoot: sourceRoot }), acceptanceRepoRoot: acceptanceRoot,
    controlRepoRoot: sourceRoot };
  const result = await runWindowsDevBuild({ action, id: () => attemptId, paths });
  if (result.exitCode !== 0) {
    console.error(formatWindowsDevFailure(result.summary));
    process.exitCode = result.exitCode;
    return;
  }
  const manifest = result.summary.desktopDnsSdFindAcceptance?.manifestPath;
  if (!manifest) throw new Error('formal Find receipt is missing');
  console.log(`[t152-windows-formal] action=${action} attempt=${attemptId} receipt=${manifest}`);
}

main().catch((error) => {
  console.error(`[t152-windows-formal] ${error.message}`);
  process.exitCode = 1;
});
