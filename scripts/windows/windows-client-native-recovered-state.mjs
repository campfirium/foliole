export async function recoverClientStateFromReady({ currentHead, ready, saveState, state }) {
  if (!ready || state?.runtimePid) {
    return;
  }
  await saveState({
    ...state,
    head: ready.appReady.head ?? state?.head ?? await currentHead(),
    runtimePid: ready.windowVisible.pid,
    session: ready.appReady.session,
    startedAt: state?.startedAt ?? new Date().toISOString()
  });
}
