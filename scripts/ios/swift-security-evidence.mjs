export const SWIFT_LOCKS = {
  app: 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
  host: 'ios/App/Package.resolved'
};

export function swiftPins(lock) {
  if (![2, 3].includes(lock?.version) || !Array.isArray(lock.pins) || !lock.pins.length) {
    throw new Error('Missing or unsupported Swift lock');
  }
  const identities = new Set();
  for (const pin of lock.pins) {
    if (!pin.identity || pin.kind !== 'remoteSourceControl' || !pin.location?.startsWith('https://')
      || !pin.state?.version || !/^[a-f0-9]{40}$/.test(pin.state.revision)
      || identities.has(pin.identity)) throw new Error('Malformed or duplicate Swift pin');
    identities.add(pin.identity);
  }
  return lock.pins.map(pin => ({ identity: pin.identity, url: pin.location, ...pin.state }));
}

export function compareSwiftResolution(pins, resolved) {
  const errors = [];
  for (const pin of pins) {
    const node = resolved.find(row => row.identity === pin.identity);
    if (!node || node.version !== pin.version || node.revision !== pin.revision || node.url !== pin.url) {
      errors.push({ reason: 'lock-resolution-mismatch', pin, resolved: node ?? null });
    }
  }
  for (const node of resolved) {
    if (!pins.some(pin => pin.identity === node.identity)) {
      errors.push({ reason: 'unlocked-remote-package', resolved: node });
    }
  }
  return errors;
}

export function swiftManifestEvidence(manifest, source) {
  if (!manifest?.name || !Array.isArray(manifest.dependencies) || !Array.isArray(manifest.targets)) {
    throw new Error(`Malformed Swift manifest: ${source}`);
  }
  const edges = manifest.dependencies.flatMap(dependency => {
    if (dependency.fileSystem?.length === 1) {
      return [{ kind: 'local', ...dependency.fileSystem[0] }];
    }
    const remote = dependency.sourceControl?.[0];
    const url = remote?.location?.remote?.[0]?.urlString;
    if (!url || dependency.sourceControl.length !== 1) {
      throw new Error(`Unsupported Swift dependency: ${source}`);
    }
    return [{ kind: 'remote', identity: remote.identity, url, requirement: remote.requirement }];
  });
  return { source, name: manifest.name, edges,
    binaries: manifest.targets.filter(target => target.type === 'binary').map(target => ({
      name: target.name, url: target.url, checksum: target.checksum, path: target.path
    })) };
}

export function checkSwiftManifestCoverage(pins, manifests) {
  return manifests.flatMap(manifest => manifest.edges.filter(edge => edge.kind === 'remote'
    && !pins.some(pin => pin.identity === edge.identity && pin.url === edge.url))
    .map(edge => ({ reason: 'manifest-remote-missing-from-lock', source: manifest.source, edge })));
}

export function swiftHostNodes(tree, revisionAt) {
  if (!tree?.identity || !Array.isArray(tree.dependencies)) throw new Error('Malformed host dependency graph');
  const nodes = new Map();
  function visit(node) {
    if (!node.identity || !node.path || !Array.isArray(node.dependencies)) {
      throw new Error('Malformed host dependency node');
    }
    if (node.url?.startsWith('https://')) nodes.set(node.identity, {
      identity: node.identity, url: node.url, version: node.version, revision: revisionAt(node.path)
    });
    for (const child of node.dependencies) visit(child);
  }
  visit(tree);
  return [...nodes.values()];
}
