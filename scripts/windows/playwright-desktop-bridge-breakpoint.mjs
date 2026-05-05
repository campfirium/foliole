function parsePositivePid(rawPid) {
  const parsed = Number.parseInt(String(rawPid ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isRendererOnTargetPage(rendererRuntime) {
  return Boolean(
    rendererRuntime?.rendererUrl &&
      rendererRuntime.rendererUrl !== 'about:blank' &&
      rendererRuntime.readyState &&
      rendererRuntime.readyState !== 'loading'
  );
}

export function classifyBridgeBreakpoint({ boot, bridgeAvailable, mainProcessPid, rendererRuntime }) {
  if (bridgeAvailable === true) {
    return {
      kind: 'bridge_ok',
      visibleWindow: isRendererOnTargetPage(rendererRuntime)
    };
  }

  if (!isRendererOnTargetPage(rendererRuntime)) {
    return {
      kind: 'renderer_not_target_page',
      visibleWindow: false
    };
  }

  const readyMarkerPid = parsePositivePid(boot?.readyMarker?.pid);
  const currentPid = parsePositivePid(mainProcessPid);
  if (readyMarkerPid !== null && currentPid !== null && readyMarkerPid !== currentPid) {
    return {
      kind: 'single_instance_old_window_lock',
      mainProcessPid: currentPid,
      readyMarkerPid,
      visibleWindow: true
    };
  }

  return {
    kind: 'preload_not_executed',
    mainProcessPid: currentPid,
    readyMarkerPid,
    visibleWindow: true
  };
}
