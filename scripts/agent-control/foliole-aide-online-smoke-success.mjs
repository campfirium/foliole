const SMOKE_TITLE = 'Aide CLI Smoke Topic';
export const EXPECTED_SMOKE_ANSWER = `TRACE_SMOKE_OK ${SMOKE_TITLE}`;

export function isOnlineSmokeSuccessful(assistantText, apiRequests = []) {
  return assistantText.includes(EXPECTED_SMOKE_ANSWER) &&
    apiRequests.some((request) =>
      request.method === 'POST' &&
      request.url === '/agent-control/v1/materials/read' &&
      request.authorization === 'Bearer smoke-token' &&
      request.body?.id === 'smoke-topic'
    );
}
