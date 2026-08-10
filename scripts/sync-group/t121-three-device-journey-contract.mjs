export const JOURNEY_ACTIONS = {
  'b-admit-c': 'android-b-approve-windows-c',
  'verify-b-c-restart': 'inspect-android-b-and-windows-c',
  'a-rejoin': 'restart-macos-a',
  'verify-three-members': 'inspect-three-devices',
  'a-fact-converges': 'create-macos-a-fact-and-inspect-three',
  'b-fact-converges': 'create-android-b-fact-and-inspect-three',
  'c-fact-converges': 'create-windows-c-fact-and-inspect-three',
  'a-leave': 'macos-a-leave-group',
  'reject-a-old-credentials': 'probe-macos-a-retired-credentials',
  'verify-survivors-restart': 'restart-and-inspect-android-b-windows-c',
  'c-to-b-converges': 'create-windows-c-fact-and-inspect-android-b',
  'b-to-c-converges': 'create-android-b-fact-and-inspect-windows-c',
  'verify-final-convergence': 'inspect-final-android-b-windows-c'
};

function fail(step, detail) {
  throw new Error(`T121 journey evidence ${step}: ${detail}`);
}

function sameIdentity(value, baseline, step) {
  if (value?.groupId !== baseline.groupId || value?.timelineId !== baseline.timelineId) {
    fail(step, 'group or timeline differs from the frozen baseline');
  }
}

function requireDevices(value, expected, baseline, step, activeMemberCount) {
  for (const device of expected) {
    const facts = value?.devices?.[device];
    sameIdentity(facts, baseline, step);
    if (facts?.localMemberState !== 'active' || facts?.activeMemberCount !== activeMemberCount) {
      fail(step, `${device} membership evidence is incomplete`);
    }
  }
}

function requireFact(value, origin, visibleOn, step) {
  if (value?.origin !== origin || typeof value?.factId !== 'string' || !value.factId) {
    fail(step, 'fact origin or id is missing');
  }
  if (JSON.stringify(value.visibleOn) !== JSON.stringify(visibleOn)) {
    fail(step, 'fact visibility does not cover the required devices in order');
  }
}

export function journeySuccessCriteria() {
  return Object.entries(JOURNEY_ACTIONS).map(([step, action]) => ({ action, step }));
}

export function assertJourneyStepEvidence(manifest, step, receipt) {
  const evidence = receipt?.evidence;
  const baseline = manifest.baseline;
  if (receipt?.action !== JOURNEY_ACTIONS[step]) fail(step, 'registered action differs');
  if (!evidence || evidence.boundaryDigest !== manifest.boundaryDigest) {
    fail(step, 'evidence is not bound to this frozen journey');
  }
  if (step === 'b-admit-c' || step === 'verify-b-c-restart') {
    requireDevices(evidence, ['B', 'C'], baseline, step, 3);
  } else if (step === 'a-rejoin' || step === 'verify-three-members') {
    requireDevices(evidence, ['A', 'B', 'C'], baseline, step, 3);
  } else if (step.endsWith('-fact-converges')) {
    requireFact(evidence, step[0].toUpperCase(), ['A', 'B', 'C'], step);
    requireDevices(evidence, ['A', 'B', 'C'], baseline, step, 3);
  } else if (step === 'a-leave') {
    sameIdentity(evidence, baseline, step);
    if (evidence.localMemberState !== null || evidence.activeMemberCountBefore !== 3) {
      fail(step, 'A Leave evidence is incomplete');
    }
  } else if (step === 'reject-a-old-credentials') {
    sameIdentity(evidence, baseline, step);
    if (evidence.device !== 'A' || evidence.credentialsRejected !== true
        || evidence.groupAccessGranted !== false) fail(step, 'old A credentials were not rejected');
  } else if (step === 'verify-survivors-restart') {
    requireDevices(evidence, ['B', 'C'], baseline, step, 2);
  } else if (step === 'c-to-b-converges') {
    requireFact(evidence, 'C', ['B', 'C'], step);
    requireDevices(evidence, ['B', 'C'], baseline, step, 2);
  } else if (step === 'b-to-c-converges') {
    requireFact(evidence, 'B', ['B', 'C'], step);
    requireDevices(evidence, ['B', 'C'], baseline, step, 2);
  } else if (step === 'verify-final-convergence') {
    requireDevices(evidence, ['B', 'C'], baseline, step, 2);
    const b = evidence.devices.B;
    const c = evidence.devices.C;
    if (!b.convergenceDigest || b.convergenceDigest !== c.convergenceDigest
        || b.missingContentBlobs !== 0 || c.missingContentBlobs !== 0
        || b.missingAttachments !== 0 || c.missingAttachments !== 0) {
      fail(step, 'final data and resource convergence is incomplete');
    }
  }
}
