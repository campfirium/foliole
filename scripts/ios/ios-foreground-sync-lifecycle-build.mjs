const ACCEPTANCE_ENV_KEYS = [
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE', 'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT',
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO'
];

export function sanitizeIosAcceptanceEnv(env) {
  const sanitized = { ...env };
  for (const key of ACCEPTANCE_ENV_KEYS) delete sanitized[key];
  return sanitized;
}

export function createLifecycleBuildEnv(env, endpoint) {
  return {
    ...sanitizeIosAcceptanceEnv(env),
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: endpoint,
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'foreground-sync-lifecycle'
  };
}
