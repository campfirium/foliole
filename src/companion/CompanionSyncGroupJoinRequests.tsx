import { useState } from 'react';

import {
  SYNC_GROUP_JOIN_COPY,
  syncGroupJoinRequestDescription,
  type SyncGroupJoinRequestSurfaceItem
} from '../shared/ui/syncGroupJoinPrepareSurface';

export function CompanionSyncGroupJoinRequests(props: {
  onAccept(requestId: string): Promise<void>;
  onReject(requestId: string): Promise<void>;
  requests: SyncGroupJoinRequestSurfaceItem[];
}) {
  const request = props.requests[0];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!request) return null;
  const requestId = request.request_id;
  async function resolve(action: (requestId: string) => Promise<void>) {
    setBusy(true); setFailed(false);
    try { await action(requestId); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <section className="border-t border-companion-divider py-3">
    <h3 className="text-sm font-semibold text-foreground">{SYNC_GROUP_JOIN_COPY.title}</h3>
    <p className="mt-1 text-sm leading-6 text-companion-text-secondary">
      {syncGroupJoinRequestDescription(request.device_name)}
    </p>
    <p className="mt-1 text-xs text-companion-text-tertiary">{request.platform}</p>
    <div className="mt-3 flex gap-2">
      <button className="min-h-11 flex-1 rounded-md border border-companion-divider px-3 py-2 text-sm font-semibold disabled:opacity-45"
        disabled={busy} onClick={() => void resolve(props.onReject)} type="button">
        {SYNC_GROUP_JOIN_COPY.reject}
      </button>
      <button className="min-h-11 flex-1 rounded-md border border-companion-accent px-3 py-2 text-sm font-semibold text-companion-accent disabled:opacity-45"
        disabled={busy} onClick={() => void resolve(props.onAccept)} type="button">
        {SYNC_GROUP_JOIN_COPY.accept}
      </button>
    </div>
    {failed ? <p className="mt-3 text-sm text-error" role="alert">{SYNC_GROUP_JOIN_COPY.error}</p> : null}
  </section>;
}
