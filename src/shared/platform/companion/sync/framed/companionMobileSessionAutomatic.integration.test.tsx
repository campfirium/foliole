// @vitest-environment jsdom
import '../../../../../test/companionJoinedMobile.testSupport.js';

import { webcrypto } from 'node:crypto';

import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../../lib/platform/syncProtocolContract.js';
import type { TryForegroundAutoSync } from '../../../../../companion/companionForegroundSyncRunner.js';
import { tryForegroundAutoSyncTarget } from '../../../../../companion/companionSyncTargetFlow.js';
import { useForegroundAutoSync } from '../../../../../companion/useCompanionWorkspaceAutoSync.js';
import { approveJoiningMobile, createJoiningMobile, mobile } from '../../../../../test/companionJoinedMobile.testSupport.js';
import { closeCompanionDesktopSession, companionDesktopSessionId } from '../../network/companionDesktopSession.js';
import { syncCompanionIdentityObjects } from '../syncGroupIdentityCompanionResult.js';

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => { await closeCompanionDesktopSession(); await host?.close(); host = undefined; vi.unstubAllGlobals(); });

it('opens notifications from the ready endpoint effect and recovers stale sessions after a desktop process restart', { meta: { calibratedMs: 60000 } }, async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  host = await createJoiningMobile();
  const instance = host;
  await instance.provider.send('seed', { id: 'automatic-article', content: 'Before' });
  const initial: NativeCompanionWorkspaceSyncState = { endpoint_url: null, remembered_targets: [],
    last_synced_at: null, sync_events: [], sync_onboarding_status: 'pending', workspace_snapshot: null };
  const errors: Array<string | null> = [];
  const setError = (error: string | null) => { errors.push(error); };
  const setProgress = vi.fn(), setStatus = vi.fn();
  const run: TryForegroundAutoSync = args => tryForegroundAutoSyncTarget(args, {
    endpointUrl: instance.peer.origin, deviceId: instance.peer.identity, groupId: instance.groupId,
    platform: 'darwin', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version
  }, async stream => {
    await syncCompanionIdentityObjects(stream.endpointUrl, {
      ...(stream.framedPeer ? { framedPeer: stream.framedPeer } : {}),
      ...(stream.confirmDatabase ? { onDatabaseConfirmed: stream.confirmDatabase } : {})
    });
    return 'completed';
  });
  const hook = renderHook(({ ready }) => {
    const [state, setState] = useState(initial);
    useForegroundAutoSync(setError, setState, setProgress, setStatus, ready, state, run);
    return { state, setState };
  }, { initialProps: { ready: false } });
  try {
    await act(async () => { await approveJoiningMobile(instance); });
    expect(companionDesktopSessionId(instance.peer.identity)).toBeUndefined();
    await act(async () => {
      hook.result.current.setState({ ...initial, endpoint_url: instance.peer.origin, remembered_targets: [instance.peer.origin] });
      hook.rerender({ ready: true });
    });
    await vi.waitFor(() => expect(companionDesktopSessionId(instance.peer.identity)).toBeDefined(), { timeout: 8000 });
    await instance.provider.send('local_content_edit', { nodeId: 'automatic-article',
      baseVersionId: instance.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id=?').pluck().get('automatic-article'),
      versionId: 'automatic-after-join', content: 'Automatic delivery', hostName: 'Desktop', updatedAt: new Date().toISOString() });
    await vi.waitFor(() => expect(instance.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('automatic-article'))
      .toBe('Automatic delivery'), { timeout: 8000 });
    const oldSession = companionDesktopSessionId(instance.peer.identity);
    const requestCount = mobile.http.mock.calls.length;
    await instance.restartProvider();
    await instance.provider.send('local_content_edit', { nodeId: 'automatic-article',
      baseVersionId: 'automatic-after-join', versionId: 'automatic-after-restart', content: 'Recovered automatically',
      hostName: 'Desktop', updatedAt: new Date().toISOString() });
    await vi.waitFor(() => {
      expect(instance.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('automatic-article'))
        .toBe('Recovered automatically');
      expect(companionDesktopSessionId(instance.peer.identity)).toBeDefined();
      expect(companionDesktopSessionId(instance.peer.identity)).not.toBe(oldSession);
    }, { timeout: 15000 });
    expect(mobile.http.mock.calls.slice(requestCount).some(([request]) => request.url.includes('sync-session'))).toBe(true);
  } catch (error) {
    throw new Error(`${String(error)}; sync errors: ${JSON.stringify(errors)}`);
  } finally {
    hook.unmount();
    await closeCompanionDesktopSession();
  }
});
