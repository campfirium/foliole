import { useEffect, useState } from 'react';

import { useBackupSearchSession } from '../../features/settings/components/sections/useBackupSearchSession';
import { subscribeBackupSearchDialogOpen } from '../../features/settings/model/backupSearchDialogRequests';

import { BackupSearchDialog } from './BackupSearchDialog';

export function BackupSearchDialogHost() {
  const [open, setOpen] = useState(false);
  const search = useBackupSearchSession(open);
  useEffect(() => subscribeBackupSearchDialogOpen(() => setOpen(true)), []);
  return (
    <BackupSearchDialog
      onCancel={() => { void search.cancel(); }}
      onClose={() => setOpen(false)}
      onNext={() => { void search.next(); }}
      onPrevious={search.previous}
      onQueryChange={search.setQuery}
      onSubmit={() => { void search.submit(); }}
      open={open}
      state={search}
    />
  );
}
