export function createSyncProgressWatchdog({ label, now = Date.now, stallMs }) {
  let lastChangedAt = now();
  let lastDetail = null;
  let lastSignature = null;
  return function observe(signature, detail = null) {
    const current = now();
    if (signature !== lastSignature) {
      const advanced = lastSignature !== null;
      lastChangedAt = current;
      lastDetail = detail;
      lastSignature = signature;
      return advanced;
    }
    if (current - lastChangedAt >= stallMs) {
      throw new Error(`${label} made no progress for ${Math.ceil(stallMs / 1_000)} seconds; `
        + `last=${JSON.stringify(lastDetail)}`);
    }
    return false;
  };
}
