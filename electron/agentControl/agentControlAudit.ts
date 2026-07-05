import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

import type { AgentControlAuditEvent } from './agentControlTypes.js';

export type AgentControlAuditSink = (event: AgentControlAuditEvent) => Promise<void> | void;

export function createDiagnosticAgentControlAuditSink(): AgentControlAuditSink {
  return (event) => appendDiagnosticLog({
    event: 'agent_control_api_call',
    level: event.result === 'success' ? 'info' : 'warn',
    occurred_at: event.occurredAt,
    payload: {
      capability: event.capability,
      callerId: event.callerId,
      ...(event.errorCategory ? { errorCategory: event.errorCategory } : {}),
      result: event.result,
      ...(event.targetId ? { targetId: event.targetId } : {})
    },
    source: 'electron.agentControl'
  });
}

export function recordAgentControlAuditEvent(
  sink: AgentControlAuditSink,
  event: Omit<AgentControlAuditEvent, 'occurredAt'>
) {
  void Promise.resolve(sink({
    ...event,
    occurredAt: new Date().toISOString()
  })).catch(() => undefined);
}
