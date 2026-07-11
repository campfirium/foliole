const SMOKE_TITLE = 'Aide CLI Smoke Topic';
export const EXPECTED_SMOKE_ANSWER = `TRACE_SMOKE_OK ${SMOKE_TITLE}`;
const FORBIDDEN_REPLY_MARKERS = [
  'FOLIOLE_AGENT_DESCRIPTOR',
  'foliole_materials_read',
  'foliole_agent_control',
  'Bearer smoke-token',
  '/agent-control/v1/',
  'agent-control-session.json',
  'http://127.0.0.1:'
];

export function isOnlineSmokeSuccessful(assistantText, apiRequests = [], providerThreadId = '') {
  return providerThreadId.trim().length > 0 &&
    assistantText.includes(EXPECTED_SMOKE_ANSWER) &&
    FORBIDDEN_REPLY_MARKERS.every((marker) => !assistantText.includes(marker)) &&
    apiRequests.some((request) =>
      request.method === 'POST' &&
      request.url === '/agent-control/v1/materials/read' &&
      request.authorization === 'Bearer smoke-token' &&
      request.body?.id === 'smoke-topic'
    );
}
