export function selectDedicatedIphoneTemplate(devicePayload) {
  const candidates = Object.entries(devicePayload.devices ?? {})
    .filter(([runtime]) => runtime.includes('SimRuntime.iOS-'))
    .flatMap(([runtime, devices]) => devices
      .filter((device) => device.isAvailable && /^iPhone /.test(device.name) && device.deviceTypeIdentifier)
      .map((device) => ({ device, runtime })));
  candidates.sort((left, right) => Number(right.device.state === 'Booted') - Number(left.device.state === 'Booted') ||
    left.device.name.localeCompare(right.device.name));
  const selected = candidates[0];
  if (!selected) throw new Error('Could not find an available iPhone Simulator template.');
  return {
    deviceTypeIdentifier: selected.device.deviceTypeIdentifier,
    runtimeIdentifier: selected.runtime,
    sourceName: selected.device.name
  };
}

export function createDedicatedSimulatorArgs(template, name) {
  return ['simctl', 'create', name, template.deviceTypeIdentifier, template.runtimeIdentifier];
}

export function dedicatedSimulatorCleanupArgs(udid) {
  return {
    delete: ['simctl', 'delete', udid],
    shutdown: ['simctl', 'shutdown', udid]
  };
}
