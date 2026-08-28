function required(value, message) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value;
}

export function desktopRunProof(deviceIdentityKey, result) {
  const status = required(result?.status, 'Desktop Sync run status is missing.');
  if (status !== 'completed') throw new Error(`Desktop Sync run is not completed: ${status}`);
  return {
    deviceIdentityKey: required(deviceIdentityKey, 'Desktop Device identity is missing.'),
    occurredAt: required(result.finished_at ?? result.started_at,
      'Desktop Sync run time is missing.'),
    runId: required(result.run_id, 'Desktop Sync run identity is missing.'),
    status,
    triggerReason: required(result.reason, 'Desktop Sync trigger reason is missing.')
  };
}

function projectedRun(event) {
  if (event?.status !== 'completed' && event?.result !== 'completed') return null;
  return {
    deviceIdentityKey: required(event.device_identity_key,
      'Mobile Device identity is missing.'),
    occurredAt: required(event.occurred_at ?? event.started_at,
      'Mobile Sync run time is missing.'),
    runId: required(event.run_id, 'Mobile Sync run identity is missing.'),
    ...(event.result ? { result: event.result } : {}),
    ...(event.status ? { status: event.status } : {}),
    triggerReason: required(event.trigger_reason, 'Mobile Sync trigger reason is missing.')
  };
}

export function selectProjectedRun(events, triggerReason, { exclude = [] } = {}) {
  const excluded = new Set(exclude.map(({ deviceIdentityKey, runId }) =>
    `${deviceIdentityKey}:${runId}`));
  const candidates = (events ?? []).map(projectedRun).filter(Boolean)
    .filter((run) => run.triggerReason === triggerReason
      && !excluded.has(`${run.deviceIdentityKey}:${run.runId}`))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  if (candidates.length === 0) {
    throw new Error(`No new completed ${triggerReason} mobile Sync run was projected.`);
  }
  return candidates[0];
}

export function projectedEvents(value, expectedContainer) {
  if (value?.container_identity !== expectedContainer
      && value?.application_id !== expectedContainer) {
    throw new Error('Mobile Sync projection container identity does not match the acceptance app.');
  }
  if (!Array.isArray(value.events)) throw new Error('Mobile Sync projection events are missing.');
  return value.events;
}
