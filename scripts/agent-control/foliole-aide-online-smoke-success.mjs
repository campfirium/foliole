const SMOKE_TITLE = 'Aide MCP Smoke Topic';
export const EXPECTED_SMOKE_ANSWER = `TRACE_SMOKE_OK ${SMOKE_TITLE}`;

export function isOnlineSmokeSuccessful(assistantText, trace, apiRequests = []) {
  return assistantText.includes(EXPECTED_SMOKE_ANSWER) &&
    trace.some((event) => event.tool === 'foliole_materials_read' && event.status === 'ok') &&
    apiRequests.some((request) =>
      request.method === 'POST' &&
      request.url === '/agent-control/v1/materials/read' &&
      request.authorization === 'Bearer smoke-token' &&
      request.body?.id === 'smoke-topic'
    );
}
