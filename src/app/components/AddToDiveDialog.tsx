import type { Dive } from '../../../lib/core/nodes/dive';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { MembershipDestinationPalette } from './MembershipDestinationPalette';

interface AddToDiveDialogProps {
  dives: readonly Dive[];
  sourceIds: readonly string[];
  onCreate?: () => void;
  onAdd: (diveId: string, sourceIds: readonly string[]) => void;
  onClose: () => void;
}

export function AddToDiveDialog({ dives, sourceIds, onAdd, onClose, onCreate }: AddToDiveDialogProps) {
  const t = useTranslation();
  const targets = dives.filter((dive) => sourceIds.some((id) => !dive.directSourceIds.includes(id)));

  return (
    <MembershipDestinationPalette
      copy={{
        title: t('desktop.nodeList.addToDive.title'),
        input: t('desktop.nodeList.addToDive.title'),
        placeholder: t('desktop.nodeList.addToDive.placeholder'),
        results: t('desktop.nodeList.addToDive.results'),
        empty: t('desktop.nodeList.addToDive.empty'),
        noResults: t('desktop.nodeList.addToDive.noResults'),
        create: t('desktop.nodeList.addToDive.create')
      }}
      onClose={onClose}
      {...(onCreate ? { onCreate, showCreateWithResults: true } : {})}
      onSelect={(diveId) => {
        const target = targets.find((dive) => dive.id === diveId);
        if (target) onAdd(diveId, sourceIds.filter((id) => !target.directSourceIds.includes(id)));
      }}
      targets={targets}
    />
  );
}
