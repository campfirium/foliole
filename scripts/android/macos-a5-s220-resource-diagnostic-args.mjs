export function buildS220ResourceDiagnosticInstrumentationArgs(fixture, groupId) {
  return ['-e', 'resourceNodeId', fixture.nodeId,
    '-e', 'resourceGroupId', groupId,
    '-e', 'availableHash', fixture.images[0].hash,
    '-e', 'recoveringHash', fixture.images[1].hash];
}
