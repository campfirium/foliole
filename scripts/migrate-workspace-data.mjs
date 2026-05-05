/* global console, process */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORAGE_KEY = 'foliole-workspace-v1';
const FILE_NAME = `${STORAGE_KEY}.json`;

function normalizeWinPath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

function candidateRoots() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return {
      target: path.join(appData, 'Foliole', 'workspace'),
      legacy: [
        path.join(localAppData, 'Foliole', 'Foliole', 'data', 'workspace'),
        path.join(localAppData, 'foliole', 'Foliole', 'data', 'workspace'),
        path.join(localAppData, 'com', 'foliole', 'Foliole', 'data', 'workspace'),
        path.join(localAppData, 'Foliole', 'workspace')
      ]
    };
  }

  const wslUser = process.env.WINDOWS_USER || process.env.USER || process.env.LOGNAME || 'zephu';
  const wslBase = `/mnt/c/Users/${wslUser}/AppData`;
  const inWsl = process.platform === 'linux' && normalizeWinPath(home).includes('/home/');
  if (inWsl) {
    return {
      target: path.join(wslBase, 'Roaming', 'Foliole', 'workspace'),
      legacy: [
        path.join(wslBase, 'Local', 'Foliole', 'Foliole', 'data', 'workspace'),
        path.join(wslBase, 'Local', 'foliole', 'Foliole', 'data', 'workspace'),
        path.join(wslBase, 'Local', 'com', 'foliole', 'Foliole', 'data', 'workspace'),
        path.join(wslBase, 'Local', 'Foliole', 'workspace')
      ]
    };
  }

  return {
    target: path.join(home, '.config', 'Foliole', 'workspace'),
    legacy: [
      path.join(home, '.local', 'share', 'Foliole', 'Foliole', 'data', 'workspace'),
      path.join(home, '.local', 'share', 'foliole', 'Foliole', 'data', 'workspace'),
      path.join(home, '.local', 'share', 'com', 'foliole', 'Foliole', 'data', 'workspace')
    ]
  };
}

async function readPayloadSummary(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const state = parsed.state ?? {};
    return {
      filePath,
      raw,
      nodeCount: Object.keys(state.nodesById ?? {}).length,
      nodeOrderCount: Array.isArray(state.nodeOrder) ? state.nodeOrder.length : 0,
      activeNodeId: state.activeNodeId ?? null,
      mtimeMs: (await fs.stat(filePath)).mtimeMs
    };
  } catch {
    return null;
  }
}

async function collectLegacyCandidates(dirs) {
  const records = [];
  for (const dir of dirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.startsWith(FILE_NAME)) {
          continue;
        }
        const record = await readPayloadSummary(path.join(dir, file));
        if (record) {
          records.push(record);
        }
      }
    } catch {
      // Ignore missing directory.
    }
  }
  return records;
}

function pickBest(records) {
  const sorted = [...records].sort((a, b) => {
    if (b.nodeCount !== a.nodeCount) {
      return b.nodeCount - a.nodeCount;
    }
    if (b.nodeOrderCount !== a.nodeOrderCount) {
      return b.nodeOrderCount - a.nodeOrderCount;
    }
    return b.mtimeMs - a.mtimeMs;
  });
  return sorted[0] ?? null;
}

async function main() {
  const { target, legacy } = candidateRoots();
  const targetFile = path.join(target, FILE_NAME);
  const candidates = await collectLegacyCandidates(legacy);
  const best = pickBest(candidates);

  if (!best) {
    console.log('[workspace-migrate] no legacy workspace payload found');
    process.exit(1);
  }

  await fs.mkdir(target, { recursive: true });

  try {
    await fs.access(targetFile);
    const backupFile = `${targetFile}.bak-before-migrate-${Date.now()}`;
    await fs.copyFile(targetFile, backupFile);
    console.log(`[workspace-migrate] backup: ${backupFile}`);
  } catch {
    // No target file yet.
  }

  await fs.writeFile(targetFile, best.raw, 'utf8');
  console.log(`[workspace-migrate] source: ${best.filePath}`);
  console.log(`[workspace-migrate] target: ${targetFile}`);
  console.log(`[workspace-migrate] nodes: ${best.nodeCount}, active: ${best.activeNodeId ?? 'null'}`);
}

main().catch((error) => {
  console.error('[workspace-migrate] failed:', error.message);
  process.exit(1);
});
