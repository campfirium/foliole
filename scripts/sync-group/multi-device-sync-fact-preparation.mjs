import { settleSiblingActions } from './multi-device-sync-stage-runtime.mjs';

export async function runAOfflineAdmissionPrelude({
  cancelSiblings = () => {}, closeTransport, createFact, openSession, openTransport,
  reportProgress = () => {}, runApproval, startWindows, waitForFact
}) {
  const session = await openSession();
  let closed = false;
  let transportOpen = false;
  const close = async () => {
    if (closed) return;
    closed = true; await session.close();
  };
  let windowsWork;
  let windowsStarted;
  const windowsStart = new Promise((resolve) => { windowsStarted = resolve; });
  try {
    const listener = await session.enable();
    if (listener.sync_enabled !== true || listener.server_status?.state !== 'running') {
      throw Object.assign(new Error('MacOS A product sync listener did not become ready.'), {
        failureOwner: 'controller', host: 'macos-a', missingFact: 'a_product_listener_unavailable'
      });
    }
    reportProgress('a-listener-ready');
    const fact = await createFact(session);
    reportProgress('a-fact-created');
    const approvalWork = runApproval({
      onProviderStopped: async () => {
        reportProgress('b-provider-stopped');
        await openTransport();
        transportOpen = true; reportProgress('b-transport-ready');
      },
      onReady: async () => {
        await waitForFact(fact.factId);
        reportProgress('b-fact-received');
        await closeTransport();
        transportOpen = false;
        await close();
        reportProgress('a-offline');
        windowsWork = startWindows(); reportProgress('c-join-started'); windowsStarted();
      }
    });
    const first = await Promise.race([
      approvalWork.then(() => 'approval'), windowsStart.then(() => 'windows-started')
    ]);
    if (first === 'approval' && !windowsWork) {
      throw Object.assign(new Error('Android approval completed before Windows C started.'), {
        failureOwner: 'controller', host: 'android-b', missingFact: 'windows_c_join_not_started'
      });
    }
    const settled = await settleSiblingActions([
      { name: 'android-b-approval', work: approvalWork.then((approval) => {
        reportProgress('b-approval-completed'); return approval;
      }) },
      { name: 'windows-c-join', work: windowsWork }
    ], cancelSiblings);
    return { approval: settled['android-b-approval'], fact, windows: settled['windows-c-join'] };
  } finally {
    if (transportOpen) await closeTransport().catch(() => undefined);
    await close().catch(() => undefined);
  }
}
