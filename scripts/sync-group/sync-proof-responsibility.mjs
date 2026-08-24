export const PROOF_OWNERS = Object.freeze({
  data: 'O-sync-data-scenario',
  instrumentation: 'O-android-instrumentation-receipt',
  readiness: 'O-android-public-runtime-readiness'
});

export const DATA_SCENARIO_PROOFS = Object.freeze([
  ['fresh-join', 'fresh-join', 'T146-16', ['mac', 'android-a5']],
  ['existing-member-admission', 'existing-member-admission', 'T146-17',
    ['mac', 'android-a5', 'windows']],
  ['leave-continuity', 'lifecycle-continuity', 'T146-18', ['mac', 'android-a5', 'windows']],
  ['rejoin-continuity', 'lifecycle-continuity', 'T146-19', ['mac', 'android-a5', 'windows']],
  ['pause-continuity', 'lifecycle-continuity', 'T146-20', ['mac', 'android-a5', 'windows']],
  ['t121-continuity', 't121-continuity', 'T146-21', ['mac', 'android-a5', 'windows']]
].map(([entry, proofClass, cutoverOwner, hosts]) => Object.freeze({
  cutoverOwner, entry, hosts: Object.freeze(hosts), proofClass
})));

export const LEGACY_SCENARIO_CUTOVER = Object.freeze({
  'a-offline-b-admits-c': 'T146-17',
  'founder-leave-continuity': 'T146-18',
  'nonempty-library-convergence': 'T146-17',
  'participation-control-continuity': 'T146-20',
  'sync-from-zero-continuity': 'T146-21',
  'three-device-convergence': 'T146-19'
});

export function assertProofResponsibility({
  dataEntries = DATA_SCENARIO_PROOFS, legacyEntries, owners = PROOF_OWNERS
}) {
  if (new Set(Object.values(owners)).size !== 3) {
    throw new Error('Each proof axis must have one distinct owner');
  }
  if (new Set(dataEntries.map(({ entry }) => entry)).size !== dataEntries.length) {
    throw new Error('Data scenario proof entry is duplicated');
  }
  for (const item of dataEntries) {
    if (!/^T146-(?:1[6-9]|20|21)$/u.test(item.cutoverOwner) || item.hosts.length < 2) {
      throw new Error(`Data scenario proof ownership is incomplete: ${item.entry}`);
    }
  }
  const documented = Object.keys(LEGACY_SCENARIO_CUTOVER).sort();
  if (JSON.stringify([...legacyEntries].sort()) !== JSON.stringify(documented)) {
    throw new Error('Legacy scenario entry cutover coverage is incomplete');
  }
  return { dataEntries: dataEntries.length, legacyEntries: documented.length };
}
