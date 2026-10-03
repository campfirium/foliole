import { createSignedRequestHeaders } from './companion/network/signedRequest';
import { traceCompanionSyncStep } from './companionDesktopSyncTrace';
import { applyCompanionDesktopSyncPack } from './companionSyncObjects';
import { withSyncStepTimeout } from './companionSyncTimeoutOwnership';

export function applyTracedStructurePage(args: {
  cursor: number;
  endpointUrl: string;
  page: number;
  pathWithQuery: string;
  restoreId: string | undefined;
  runId: string | undefined;
  sourceHostName: string;
  sourcePeerId: string;
}) {
  return traceCompanionSyncStep({
    runId: args.runId,
    stage: 'structure_page',
    fields: { page: args.page, fromCursor: args.cursor },
    task: async () => withSyncStepTimeout('structure_pack_apply', applyCompanionDesktopSyncPack({
      ...(args.restoreId ? { expectedRestoreId: args.restoreId } : {}),
      headers: await createSignedRequestHeaders({ endpointUrl: args.endpointUrl, method: 'GET',
        pathWithQuery: args.pathWithQuery }),
      sourceHostName: args.sourceHostName,
      sourcePeerId: args.sourcePeerId,
      url: `${args.endpointUrl.trim().replace(/\/+$/, '')}${args.pathWithQuery}`
    })),
    completedFields: (value) => ({
      toCursor: value.to_state_seq,
      appliedObjects: value.applied_object_count,
      appliedBlobs: value.applied_blob_count
    })
  });
}
