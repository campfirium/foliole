function getOldWindowLockReason(diagnostics) {
  const currentPid = diagnostics.currentRuntime?.pid ?? 'unknown';
  const readyMarkerPid = diagnostics.bridgeBreakpoint?.readyMarkerPid ?? 'unknown';
  return `visible desktop window is still locked to an older runtime (current pid=${currentPid}, ready marker pid=${readyMarkerPid})`;
}

export function explainBridgeBackedControlBlockedReason(diagnostics) {
  const currentRuntime = diagnostics.currentRuntime;
  const rendererPage = diagnostics.rendererPage;
  const bridgeBreakpoint = diagnostics.bridgeBreakpoint;

  if (currentRuntime?.appReady !== true) {
    return 'current desktop runtime has not reported app_ready yet';
  }
  if (currentRuntime?.navigationReady !== true) {
    return `renderer has not reached the target page (url=${rendererPage?.url ?? currentRuntime?.rendererUrl ?? 'unknown'}, readyState=${rendererPage?.readyState ?? 'unknown'}, rootPresent=${String(rendererPage?.rootPresent ?? null)})`;
  }
  if (currentRuntime?.bridgeAvailable !== true) {
    if (bridgeBreakpoint?.kind === 'single_instance_old_window_lock') {
      return getOldWindowLockReason(diagnostics);
    }
    if (bridgeBreakpoint?.kind === 'renderer_not_target_page') {
      return `visible window is not on the target renderer page (url=${rendererPage?.url ?? currentRuntime?.rendererUrl ?? 'unknown'})`;
    }
    return `desktop preload or bridge is unavailable for the visible window (kind=${bridgeBreakpoint?.kind ?? 'unknown'}, preloadPath=${currentRuntime?.preloadPath ?? 'unknown'})`;
  }
  if (currentRuntime?.bridgeReady !== true) {
    return 'current desktop runtime reached the renderer page, but bridge_ready is still missing';
  }
  return 'control is still disabled even though the desktop bridge reports healthy';
}
