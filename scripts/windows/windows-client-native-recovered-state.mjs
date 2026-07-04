export async function recoverClientStateFromReady({ currentHead, ready, saveState, state }) {
  if (!ready) {
    return;
  }
  await saveState({
    ...state,
    failedAt: undefined,
    head: ready.appReady.head ?? state?.head ?? await currentHead(),
    lastError: undefined,
    runtimePid: ready.windowVisible.pid,
    session: ready.appReady.session,
    startedAt: state?.startedAt ?? new Date().toISOString()
  });
}

export async function recoverClientStateFromStatus({ currentHead, saveState, status }) {
  if (!status.ok) return;
  await recoverClientStateFromReady({ currentHead, ready: status.ready, saveState, state: status.state });
}
