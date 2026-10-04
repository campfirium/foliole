import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

import type { CompanionReadingActivity } from './companionReadingActivity';

export function CompanionNextTopicFooter(props: {
  activity: CompanionReadingActivity;
  onOpen(): void;
  title: string;
}) {
  const t = useTranslation();
  const [error, setError] = useState(false);
  const [opening, setOpening] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function openNextTopic() {
    if (opening || props.activity.editing) return;
    setOpening(true);
    setError(false);
    try {
      await props.activity.flush();
      if (mounted.current && !props.activity.editing) props.onOpen();
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setOpening(false);
    }
  }

  return <div className="mx-auto w-full max-w-[760px] border-t border-companion-divider pt-3">
    <AppButton className="min-h-14 w-full" contentClassName="w-full justify-between" disabled={props.activity.editing || opening}
      onClick={() => void openNextTopic()} variant="list">
      <span className="min-w-0 text-left">
        <span className="block text-xs text-companion-text-secondary">{t('companion.reading.nextTopic')}</span>
        <span className="block truncate text-sm">{props.title}</span>
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
    </AppButton>
    {error ? <p className="px-3 text-sm text-error" role="alert">{t('companion.reading.nextTopicError')}</p> : null}
  </div>;
}
