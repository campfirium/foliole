export async function runAOfflineAdmissionPrelude({
  closeTransport, createFact, openSession, openTransport, runApproval, startWindows, waitForFact
}) {
  const session = await openSession();
  let closed = false;
  let transportOpen = false;
  const close = async () => {
    if (closed) return;
    closed = true; await session.close();
  };
  let windowsWork;
  try {
    const listener = await session.enable();
    if (listener.sync_enabled !== true || listener.server_status?.state !== 'running') {
      throw Object.assign(new Error('MacOS A product sync listener did not become ready.'), {
        failureOwner: 'controller', host: 'macos-a', missingFact: 'a_product_listener_unavailable'
      });
    }
    const fact = await createFact(session);
    await openTransport();
    transportOpen = true;
    const approval = await runApproval(async () => {
      await waitForFact(fact.factId);
      await closeTransport();
      transportOpen = false;
      await close();
      windowsWork = startWindows();
    });
    return { approval, fact, windows: await windowsWork };
  } finally {
    if (transportOpen) await closeTransport().catch(() => undefined);
    await close().catch(() => undefined);
  }
}
