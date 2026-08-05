import fs from 'node:fs';
import path from 'node:path';

function failure(message, stage, result) {
  return Object.assign(new Error(message), { exitCode: 74, result, stage });
}

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code === 0) return result;
  const detail = result.lines?.at(-1) || result.stderr || `${command} exited ${result.code}`;
  throw failure(String(detail).trim(), stage, result);
}

function adbArgs(adbPort, serial, args) {
  return ['-P', adbPort, '-s', serial, ...args];
}

export async function captureWindowsA5Screenshot({
  adbPort, env, evidenceRoot, execute, fileName, fsApi = fs, paths, remotePath, serial, stage
}) {
  const screenshotPath = path.join(evidenceRoot, fileName);
  const options = { env, timeoutCode: `${stage}_timeout`, timeoutMs: 30_000, windowsHide: true };
  await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
    ['shell', 'screencap', '-p', remotePath]), options, stage);
  try {
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['pull', remotePath, screenshotPath]), options, stage);
  } finally {
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['shell', 'rm', remotePath]), options, `${stage}-cleanup`);
  }
  if (!fsApi.existsSync(screenshotPath)) throw failure('A5 screenshot was not written', stage);
  return screenshotPath;
}
