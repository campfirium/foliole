import { useEffect, useRef, useState } from 'react';

export function isSyncProtocolIncompatibleError(error: string | null) {
  return Boolean(error && /(?:^|\W)(?:protocol_incompatible|discovery_incompatible|sync_group_peer_incompatible)(?:\W|$)/.test(error));
}

export function useSyncProtocolIncompatibleNotice(incompatible: boolean) {
  const [open, setOpen] = useState(false);
  const shown = useRef(false);
  useEffect(() => {
    if (incompatible && !shown.current) {
      shown.current = true;
      setOpen(true);
    }
  }, [incompatible]);
  return {
    close: () => setOpen(false),
    open,
    retry: () => { shown.current = false; setOpen(false); }
  };
}
