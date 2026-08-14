import { startWindowsSyncGroupProvider } from './multi-device-sync-windows-provider.mjs';

export function existingJourneyFactIds(journeyFacts) {
  return new Set(Object.keys(journeyFacts ?? {}));
}

export function freshJourneyFactIds(journeyFacts, excluded) {
  const result = {};
  for (const [id, origin] of Object.entries(journeyFacts ?? {})) {
    if (excluded.has(id) || !['A', 'B', 'C'].includes(origin)) continue;
    if (result[origin]) throw new Error(`Multiple fresh ${origin} facts were observed.`);
    result[origin] = id;
  }
  return result;
}

export function startWindowsARejoinProvider({ execute, reportProgress, repoRoot }) {
  return startWindowsSyncGroupProvider({
    action: 'multi-device-sync-a-rejoin', execute, reportProgress, repoRoot
  });
}
