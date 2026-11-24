/* global process */

import { execFileSync } from 'node:child_process';

export const SYNC_PROTOCOL_SOURCE_PATH = 'lib/platform/syncProtocolContract.ts';

const DESCRIPTOR_BLOCK = /CURRENT_SYNC_PROTOCOL_DESCRIPTOR\s*=\s*Object\.freeze\(\{[\s\S]*?\n\}\s+as const/u;
const VERSION_FIELD = /\n\s*version:\s*(\d+)\s*\n/u;

export function parseSyncProtocolVersion(source) {
  const block = DESCRIPTOR_BLOCK.exec(String(source ?? ''))?.[0];
  const match = block ? VERSION_FIELD.exec(block) : null;
  if (!match) throw new Error(`${SYNC_PROTOCOL_SOURCE_PATH} must declare CURRENT_SYNC_PROTOCOL_DESCRIPTOR version.`);
  return Number(match[1]);
}

// The protocol requires strictly equal versions, so any change cuts off older mobile builds.
export function syncProtocolChanged(previousProtocol, currentProtocol) {
  return previousProtocol !== currentProtocol;
}

export function assertSyncBreakingMarked({ currentProtocol, entry, previousProtocol, previousVersion, version }) {
  if (!syncProtocolChanged(previousProtocol, currentProtocol)) return { changed: false };
  if (entry?.syncBreaking !== true) {
    throw new Error(
      `sync protocol changed from ${previousProtocol} (v${previousVersion}) to ${currentProtocol} (v${version}); ` +
      `releases/update-manifest.json entry ${version} must set "syncBreaking": true.`
    );
  }
  return { changed: true };
}

export function readSyncProtocolAtTag(tag, { cwd = process.cwd(), run = execFileSync } = {}) {
  const show = () => run('git', ['show', `${tag}:${SYNC_PROTOCOL_SOURCE_PATH}`], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  let source;
  try {
    source = show();
  } catch {
    run('git', ['fetch', '--depth=1', 'origin', `refs/tags/${tag}:refs/tags/${tag}`], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    source = show();
  }
  return parseSyncProtocolVersion(source);
}
