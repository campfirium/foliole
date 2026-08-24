export const PUBLIC_RUNTIME_READINESS_OWNER = 'O-android-public-runtime-readiness';

function blocked(message) {
  throw Object.assign(new Error(`Public runtime readiness: ${message}`), {
    failureAxis: 'mechanical-readiness', failureOwner: PUBLIC_RUNTIME_READINESS_OWNER
  });
}

export function assertActionLocalPublicRuntimeReadiness({ action, observation }) {
  if (!action?.actionId || action.surface !== 'public' || !action.runtimeId) {
    blocked('public action identity is incomplete');
  }
  if (observation?.source !== 'public-runtime'
      || observation.actionId !== action.actionId
      || observation.runtimeId !== action.runtimeId) {
    blocked('observation does not belong to the current public runtime action');
  }
  if (observation.provider !== 'available' || observation.listener !== 'listening') {
    blocked('provider/listener is not consumable');
  }
  return {
    actionId: action.actionId, gate: 'open', owner: PUBLIC_RUNTIME_READINESS_OWNER,
    runtimeId: action.runtimeId
  };
}
