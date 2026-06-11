#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import { refreshBaseline } from './thread-preview-slot/slotBaseline.mjs';
import { readSlotReady } from './thread-preview-slot/slotClient.mjs';
import {
  DEFAULT_MAIN_MIRROR,
  DEFAULT_ROOT,
  paths,
  readState,
  validateSlotId
} from './thread-preview-slot/slotCommon.mjs';
import { refreshLibrary, slotLibraryDatabase } from './thread-preview-slot/slotLibrary.mjs';
import { releaseCurrentSlot, releaseSlot } from './thread-preview-slot/slotRelease.mjs';
import { prepare, preview, record } from './thread-preview-slot/slotWorkspace.mjs';

function usage() {
  console.log(`Usage:
  thread-preview-slot.mjs status [--slot single]
  thread-preview-slot.mjs record [--slot single] --file <path> [--file <path>...]
  thread-preview-slot.mjs baseline-refresh [--slot single]
  thread-preview-slot.mjs library-refresh [--slot single] --from <library-path>
  thread-preview-slot.mjs prepare [--slot single] [--reset]
  thread-preview-slot.mjs preview [--slot single] [--reset] [--label <title>] [--thread <id>]
  thread-preview-slot.mjs release [--slot single]
  thread-preview-slot.mjs release-current [--thread <id>]

Environment:
  FOLIOLE_PREVIEW_SLOT_ROOT            default ${DEFAULT_ROOT}
  FOLIOLE_WINDOWS_MAIN_MIRROR          default ${DEFAULT_MAIN_MIRROR}`);
}

function parseArgs(argv) {
  const command = argv[0] ?? '';
  const options = {
    files: [],
    from: '',
    label: '',
    reset: false,
    slot: process.env.FOLIOLE_PREVIEW_SLOT_ID || 'single',
    thread: ''
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--slot') {
      options.slot = argv[++index] ?? '';
    } else if (arg.startsWith('--slot=')) {
      options.slot = arg.slice('--slot='.length);
    } else if (arg === '--file') {
      options.files.push(argv[++index] ?? '');
    } else if (arg.startsWith('--file=')) {
      options.files.push(arg.slice('--file='.length));
    } else if (arg === '--from') {
      options.from = argv[++index] ?? '';
    } else if (arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length);
    } else if (arg === '--label') {
      options.label = argv[++index] ?? '';
    } else if (arg.startsWith('--label=')) {
      options.label = arg.slice('--label='.length);
    } else if (arg === '--thread') {
      options.thread = argv[++index] ?? '';
    } else if (arg.startsWith('--thread=')) {
      options.thread = arg.slice('--thread='.length);
    } else if (arg === '--reset') {
      options.reset = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  validateSlotId(options.slot);
  return { command, options };
}

function status(slot) {
  const state = readState(slot);
  const p = paths(slot);
  const ready = readSlotReady(slot);
  console.log(JSON.stringify({
    baselineDir: p.baselineDir,
    baselineExists: fs.existsSync(path.join(p.baselineDir, '.git')),
    baselineIsGitCheckout: fs.existsSync(path.join(p.baselineDir, '.git')),
    libraryDir: p.libraryDir,
    libraryReady: fs.existsSync(p.libraryDir),
    libraryDatabaseExists: fs.existsSync(slotLibraryDatabase(p)),
    previewRoot: p.root,
    slotDir: p.slotDir,
    slotIsGitCheckout: fs.existsSync(path.join(p.slotDir, '.git')),
    slotReady: {
      head: ready.appReady?.head ?? '',
      runtimePid: ready.windowVisible?.pid ?? null,
      session: ready.appReady?.session ?? '',
      trust: ready.running ? 'OK' : 'FAILED'
    },
    state
  }, null, 2));
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || command === '--help') {
    usage();
    return;
  }
  if (command === 'baseline-refresh') refreshBaseline(options.slot);
  else if (command === 'library-refresh') refreshLibrary(options.slot, options.from);
  else if (command === 'record') record(options.slot, options.files);
  else if (command === 'prepare') prepare(options.slot, options.reset);
  else if (command === 'preview') await preview(options.slot, {
    label: options.label,
    reset: options.reset,
    thread: options.thread
  });
  else if (command === 'release') await releaseSlot(options.slot);
  else if (command === 'release-current') await releaseCurrentSlot({ thread: options.thread });
  else if (command === 'status') status(options.slot);
  else throw new Error(`unknown command: ${command}`);
}

try {
  await main();
} catch (error) {
  console.error(`[preview-slot] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
