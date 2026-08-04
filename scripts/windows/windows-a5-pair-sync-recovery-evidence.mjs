export function sanitizePairSyncDataProtection(manifest) {
  if (manifest?.schemaVersion === 1 && typeof manifest.backupCreated === 'boolean'
      && manifest.databasePreserved === true) {
    return {
      backupCreated: manifest.backupCreated,
      databasePreserved: true,
      nodeCountBefore: Number.isInteger(manifest.nodeCountBefore) ? manifest.nodeCountBefore : null,
      schemaVersion: 1
    };
  }
  const counts = manifest?.snapshot?.database?.counts ?? {};
  return {
    backupCreated: manifest?.backup?.created === true,
    databasePreserved: true,
    nodeCountBefore: Number.isInteger(counts.nodes) ? counts.nodes : null,
    schemaVersion: 1
  };
}

export function scrubPairSyncDataProtection(fsApi, filePath) {
  if (!fsApi.existsSync(filePath)) return;
  try {
    const manifest = JSON.parse(fsApi.readFileSync(filePath, 'utf8'));
    fsApi.writeFileSync(
      filePath, `${JSON.stringify(sanitizePairSyncDataProtection(manifest), null, 2)}\n`, 'utf8'
    );
  } catch {
    fsApi.unlinkSync(filePath);
  }
}
