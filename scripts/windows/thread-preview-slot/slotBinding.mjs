import fs from 'node:fs';

import { paths, readJson, readState, writeJson, writeState } from './slotCommon.mjs';

function nowIso() {
  return new Date().toISOString();
}

function cleanLabel(label, slot) {
  const trimmed = String(label ?? '').trim();
  if (trimmed) return trimmed;
  return readState(slot).label || '';
}

export function bindSlot(slot, { label = '', thread = '' } = {}) {
  const p = paths(slot);
  const nextLabel = cleanLabel(label, slot);
  const record = {
    label: nextLabel,
    slot,
    thread: String(thread ?? '').trim(),
    updatedAt: nowIso()
  };
  if (record.thread) {
    const bindings = readJson(p.bindingFile, { threads: {} });
    bindings.threads = bindings.threads && typeof bindings.threads === 'object' ? bindings.threads : {};
    bindings.threads[record.thread] = record;
    writeJson(p.bindingFile, bindings);
  } else {
    writeJson(p.currentSlotFile, record);
  }
  writeState(slot, { label: nextLabel, thread: record.thread });
  return record;
}

export function resolveCurrentBinding(thread = '') {
  const rootPaths = paths('current');
  const cleanThread = String(thread ?? '').trim();
  if (cleanThread) {
    const bindings = readJson(rootPaths.bindingFile, { threads: {} });
    return bindings.threads?.[cleanThread] ?? null;
  }
  return readJson(rootPaths.currentSlotFile, null);
}

export function removeSlotBinding(slot) {
  const p = paths(slot);
  const bindings = readJson(p.bindingFile, { threads: {} });
  let changed = false;
  for (const [thread, record] of Object.entries(bindings.threads ?? {})) {
    if (record?.slot === slot) {
      delete bindings.threads[thread];
      changed = true;
    }
  }
  if (changed) writeJson(p.bindingFile, bindings);
  const current = readJson(p.currentSlotFile, null);
  if (current?.slot === slot) {
    fs.rmSync(p.currentSlotFile, { force: true });
  }
}
