import fs from 'node:fs';

import { resolveCurrentBinding, removeSlotBinding } from './slotBinding.mjs';
import { runSlotClient } from './slotClient.mjs';
import { paths, resolveSafeSlotDir } from './slotCommon.mjs';
import { readSlotPort, releaseSlotPort } from './slotPorts.mjs';

function removeSlotFiles(slot) {
  const p = paths(slot);
  const safeSlotDir = resolveSafeSlotDir(slot);
  forceRemovePath(safeSlotDir);
  forceRemovePath(p.runtimeDir);
}

function forceRemovePath(targetPath) {
  try {
    fs.rmSync(targetPath, { force: true, recursive: true });
  } catch (error) {
    if (!(error instanceof Error) || !['EACCES', 'EPERM'].includes(error.code ?? '')) {
      throw error;
    }
    chmodWritable(targetPath);
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
}

function chmodWritable(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  fs.chmodSync(targetPath, stat.mode | 0o200);
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(targetPath)) {
    chmodWritable(`${targetPath}/${entry}`);
  }
}

export async function releaseSlot(slot) {
  const p = paths(slot);
  const hasSlotObject = fs.existsSync(p.slotDir) || fs.existsSync(p.runtimeDir) || readSlotPort(slot) !== null;
  if (!hasSlotObject) {
    removeSlotBinding(slot);
    console.log(`[preview-slot] release skipped: no slot object slot=${slot}`);
    return;
  }
  if (fs.existsSync(p.slotDir)) {
    const stop = runSlotClient(slot, 'stop', {}, { timeoutMs: 60000 });
    if (stop.status !== 0) {
      const detail = [stop.stdout, stop.stderr].filter(Boolean).join('\n').trim();
      throw new Error(`slot client stop failed; release aborted slot=${slot}${detail ? `\n${detail}` : ''}`);
    }
  }
  removeSlotFiles(slot);
  releaseSlotPort(slot);
  removeSlotBinding(slot);
  console.log(`[preview-slot] released slot=${slot}`);
}

export async function releaseCurrentSlot({ thread = '' } = {}) {
  const binding = resolveCurrentBinding(thread);
  if (!binding?.slot) {
    console.log('[preview-slot] release-current skipped: no slot binding');
    return;
  }
  await releaseSlot(binding.slot);
}
