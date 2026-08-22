import fs from 'node:fs';
import path from 'node:path';

import { buildMacosA5Desktop } from './macos-a5-extended-actions.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';

function statusEvidence(overview, session, runId) {
  const safe = session.sanitize(overview);
  return {
    activeMemberCount: overview.sync_group?.members?.filter(
      (member) => member.state === 'active'
    ).length ?? 0,
    pairedAuthorizationCount: safe.pairedAuthorizationFingerprints.length,
    resultStatus: 'success', runId, schemaVersion: 1,
    serverState: safe.serverState, syncEnabled: safe.syncEnabled
  };
}

export async function runMacosA5HiddenDesktopStatusEntry(args, {
  buildDesktop = buildMacosA5Desktop, fsApi = fs,
  openSession = openMacosPairSyncDesktopSession
} = {}) {
  args.build(); buildDesktop(args.checked, args.paths);
  const runId = args.buildIdentity();
  const session = await openSession({ env: args.env,
    libraryHome: args.paths.desktopDevLibrary, repoRoot: args.paths.buildRoot,
    runtimeRoot: args.paths.desktopRuntimeRoot });
  try {
    const overview = await session.load();
    if (!overview.sync_group) throw new Error('Hidden desktop Sync Group is unavailable.');
    const evidence = statusEvidence(overview, session, runId);
    const evidencePath = path.join(
      args.paths.artifactsRoot, 'a5-hidden-desktop-status', `${runId}.json`
    );
    fsApi.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fsApi.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    return { evidence, evidencePath };
  } finally { await session.close().catch(() => undefined); }
}
