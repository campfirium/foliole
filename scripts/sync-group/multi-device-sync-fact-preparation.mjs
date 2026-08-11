export async function runAOfflineAdmissionPrelude({
  createFact, openSession, runApproval, startWindows, waitForFact
}) {
  const session = await openSession();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true; await session.close();
  };
  let windowsWork;
  try {
    const fact = await createFact(session);
    const approval = await runApproval(async () => {
      await waitForFact(fact.factId);
      await close();
      windowsWork = startWindows();
    });
    return { approval, fact, windows: await windowsWork };
  } finally {
    await close().catch(() => undefined);
  }
}
