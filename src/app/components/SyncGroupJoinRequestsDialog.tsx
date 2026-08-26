import { useState } from 'react';

import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import {
  SYNC_GROUP_JOIN_COPY,
  syncGroupJoinRequestDescription,
  type SyncGroupJoinRequestSurfaceItem
} from '../../shared/ui/syncGroupJoinPrepareSurface';

export function SyncGroupJoinRequestsDialog(props: {
  onAccept(requestId: string): Promise<void>;
  onReject(requestId: string): Promise<void>;
  requests: SyncGroupJoinRequestSurfaceItem[];
}) {
  const request = props.requests[0];
  if (!request) return null;
  return <AppDialog open><AppDialogPortal><AppDialogOverlay />
    <AppDialogContent aria-describedby={undefined} className="w-[min(460px,calc(100vw-48px))] p-6">
      <JoinRequestContent {...props} request={request} />
    </AppDialogContent>
  </AppDialogPortal></AppDialog>;
}

function JoinRequestContent(props: {
  onAccept(requestId: string): Promise<void>;
  onReject(requestId: string): Promise<void>;
  request: SyncGroupJoinRequestSurfaceItem;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function resolve(action: (requestId: string) => Promise<void>) {
    setBusy(true); setFailed(false);
    try { await action(props.request.request_id); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <div className="space-y-2 text-center">
      <AppDialogTitle>{SYNC_GROUP_JOIN_COPY.title}</AppDialogTitle>
      <p className="text-sm text-foreground/65">
        {syncGroupJoinRequestDescription(props.request.device_name)}
      </p>
      <p className="text-xs text-foreground/55">{props.request.platform}</p>
    </div>
    <div className="flex gap-2">
      <AppButton className="flex-1" disabled={busy}
        onClick={() => void resolve(props.onReject)} variant="danger">
        {SYNC_GROUP_JOIN_COPY.reject}
      </AppButton>
      <AppButton className="flex-1" disabled={busy} loading={busy}
        onClick={() => void resolve(props.onAccept)} variant="emphasis">
        {SYNC_GROUP_JOIN_COPY.accept}
      </AppButton>
    </div>
    {failed ? <p className="text-center text-sm text-error" role="alert">
      {SYNC_GROUP_JOIN_COPY.error}
    </p> : null}
  </div>;
}
