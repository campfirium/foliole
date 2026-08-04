export function createWindowsClientStateReaders({
  appReadyFile, bootEventLogFile, bridgeReadyFile, nativeState, stateFile, windowVisibleFile
}) {
  const readClientState = () => nativeState.readClientState(stateFile);
  const readReadyState = () => nativeState.readReadyState({
    appReadyFile, bridgeReadyFile, windowVisibleFile
  }) ?? nativeState.readReadyStateFromBootEvents(bootEventLogFile, {
    session: readClientState()?.session
  });
  return { readClientState, readReadyState };
}
