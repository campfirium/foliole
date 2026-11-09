import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { AttachmentStatusRequest } from '../../lib/platform/attachmentMaintenanceContract';
import { createCompanionSettingsPreview } from '../../scripts/vite/companionSettingsPreview';
import '../../src/app/styles.css';
import { CompanionBackupLocationDialog } from '../../src/companion/CompanionBackupLocationDialog';
import { CompanionFeedbackSettingsRow } from '../../src/companion/CompanionFeedbackSettingsRow';
import { CompanionStorageSettingsContent } from '../../src/companion/CompanionStorageSettingsContent';
import '../../src/companion/companionMinimal.css';
import { AttachmentCleanupThresholdDialog } from '../../src/features/settings/components/sections/AttachmentCleanupThresholdDialog';
import { SettingsAttachmentStorageSection } from '../../src/features/settings/components/sections/SettingsAttachmentStorageSection';
import { LocalizationProvider, useTranslation } from '../../src/shared/localization/LocalizationProvider';
import { AppConfirmationProvider } from '../../src/shared/ui/AppConfirmationProvider';
import { chooseSyncGroupJoinMode } from '../../src/shared/ui/chooseSyncGroupJoinMode';
import { SettingsTouchSurface } from '../../src/shared/ui/SettingsTouchSurface';

const attachments = createCompanionSettingsPreview();
Object.assign(window, { electronAPI: { invoke: (_command: string, request: AttachmentStatusRequest) => attachments.maintainAttachments(request) } });

function SettingsSheets() {
  const t = useTranslation();
  const [threshold, setThreshold] = useState(30);
  const [open, setOpen] = useState(false);
  const [backup, setBackup] = useState(false);
  return <SettingsTouchSurface>
    <button onClick={() => setOpen(true)}>Days: {threshold}</button>
    <button onClick={() => setBackup(true)}>Backup location</button>
    <button onClick={() => void chooseSyncGroupJoinMode(t, 'Home Library')}>Join</button>
    <SettingsAttachmentStorageSection mobile />
    <CompanionStorageSettingsContent />
    <CompanionFeedbackSettingsRow />
    <AttachmentCleanupThresholdDialog open={open} value={threshold} onOpenChange={setOpen}
      onSave={value => { setThreshold(value); setOpen(false); }} />
    <CompanionBackupLocationDialog open={backup} working={false} label={'/Backups/'.repeat(30)}
      onOpenChange={setBackup} onChange={() => {}} />
  </SettingsTouchSurface>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en">
    <AppConfirmationProvider><SettingsSheets /></AppConfirmationProvider>
  </LocalizationProvider>
);
