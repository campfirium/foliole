import { useEffect, useState } from 'react';

import type { AttachmentStatusRequest, AttachmentMaintenanceStatus } from '../../../../../lib/platform/attachmentMaintenanceContract';
import { runAttachmentMaintenance } from '../../../../shared/platform/attachments/attachmentMaintenance';

export function useAttachmentStorageSettings() {
  const [status, setStatus] = useState<AttachmentMaintenanceStatus | null>(null);
  const [threshold, setThreshold] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void runAttachmentMaintenance({ action: 'status' }).then((result) => {
      if (!active) return;
      setStatus(result); if (result) setThreshold(String(result.observationThreshold));
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  async function run(request: AttachmentStatusRequest) {
    setBusy(true); setError(false);
    try { setStatus(await runAttachmentMaintenance(request)); }
    catch { setError(true); }
    finally { setBusy(false); }
  }

  return { status, threshold, setThreshold, busy, error, run };
}
