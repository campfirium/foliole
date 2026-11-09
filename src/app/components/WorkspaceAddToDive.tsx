import { useCallback, useEffect, useRef, useState } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { getDiveRepository } from '../../shared/platform/desktop/diveRepository';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { AddToDiveDialog } from './AddToDiveDialog';
import { saveWorkspaceDive } from './workspaceDiveMutation';

export function useWorkspaceAddToDive() {
  const [sourceIds, setSourceIds] = useState<string[] | null>(null);
  const close = useCallback(() => setSourceIds(null), []);
  return {
    open: getDiveRepository() ? setSourceIds : undefined,
    dialog: sourceIds ? <WorkspaceAddToDive sourceIds={sourceIds} onClose={close} /> : null
  };
}

function WorkspaceAddToDive(props: { sourceIds: readonly string[]; onClose: () => void }) {
  const t = useTranslation();
  const [dives, setDives] = useState<Dive[] | null>(null);
  const busy = useRef(false);
  const { onClose } = props;
  useEffect(() => {
    let active = true;
    const repository = getDiveRepository();
    if (!repository) return;
    void repository.list().then((result) => {
      if (active) setDives(result);
    }).catch(() => {
      if (!active) return;
      showAppRuntimeNotice(t('desktop.nodeList.addToDive.loadFailed'));
      onClose();
    });
    return () => { active = false; };
  }, [onClose, t]);

  async function save(action: (repository: NonNullable<ReturnType<typeof getDiveRepository>>) => Promise<Dive>) {
    const repository = getDiveRepository();
    if (!repository || busy.current) return;
    busy.current = true;
    try {
      const dive = await saveWorkspaceDive(() => action(repository));
      showAppRuntimeNotice(t('desktop.nodeList.addToDive.added', { title: dive.title }));
      onClose();
    } catch {
      showAppRuntimeNotice(t('desktop.nodeList.addToDive.saveFailed'));
    } finally {
      busy.current = false;
    }
  }

  function close() {
    if (!busy.current) onClose();
  }

  if (!dives) return null;
  return <AddToDiveDialog
    dives={dives}
    onAdd={(id, ids) => void save((repository) => repository.add(id, ids))}
    onClose={close}
    sourceIds={props.sourceIds}
  />;
}
