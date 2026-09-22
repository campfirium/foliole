import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { useCompanionListInteraction } from './CompanionListViewport';

export function CompanionTopicListMenu(props: { title: string; metadata: string; onOpen(): void }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const interaction = useCompanionListInteraction();
  useEffect(() => {
    if (!open && !infoOpen) return;
    interaction(true);
    return () => interaction(false);
  }, [open, infoOpen, interaction]);
  return (
    <>
      <button aria-label={`${t('companion.browse.more')}: ${props.title}`} className="companion-topic-more" onClick={() => setOpen(true)} type="button">
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>
      <CompanionBottomSheet onOpenChange={setOpen} open={open} title={t('companion.browse.more')}>
        <button className="block min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm" onClick={() => { setOpen(false); props.onOpen(); }} type="button">
          {t('desktop.searchPreview.open')}
        </button>
        <button className="block min-h-11 w-full py-3 text-left text-sm" onClick={() => { setOpen(false); setInfoOpen(true); }} type="button">
          {t('companion.reading.info')}
        </button>
      </CompanionBottomSheet>
      <CompanionBottomSheet onOpenChange={setInfoOpen} open={infoOpen} title={t('companion.reading.info')}>
        <p className="text-base leading-6">{props.title}</p>
        <p className="mt-3 text-sm text-companion-text-secondary">{props.metadata}</p>
      </CompanionBottomSheet>
    </>
  );
}
