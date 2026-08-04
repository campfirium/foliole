/* global process */

import { runCapture as defaultRunCapture } from './windows-client-native-process.mjs';

export async function resolveWindowsClientHead({
  env = process.env, repoRoot, runCapture = defaultRunCapture
}) {
  const envHead = env.FOLIOLE_RUNTIME_HEAD?.trim();
  if (envHead) return envHead;
  const result = await runCapture('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return result.code === 0 ? result.stdout.trim() : '';
}
