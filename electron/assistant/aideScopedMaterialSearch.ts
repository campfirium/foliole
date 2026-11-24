import { createDiagnosticAgentControlAuditSink, recordAgentControlAuditEvent } from '../agentControl/agentControlAudit.js';
import { normalizeMaterialSearchLimit, searchScopedAgentControlMaterials } from '../agentControl/agentControlMaterialSearch.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { createAideSearchFilter, type AideReadScope } from './aideReadScope.js';

const auditSink = createDiagnosticAgentControlAuditSink();

export async function searchAideMaterials(scope: AideReadScope, body: Record<string, unknown>, signal?: AbortSignal) {
  const payload = await runWithDatabaseConnectionOwner(() => {
    signal?.throwIfAborted();
    return searchScopedAgentControlMaterials(
      String(body.query), normalizeMaterialSearchLimit(body.limit), createAideSearchFilter(scope)
    );
  });
  recordAgentControlAuditEvent(auditSink, {
    capability: 'materials.search',
    callerId: 'foliole-aide',
    result: 'success'
  });
  return payload;
}
