import { MessageSquare } from 'lucide-react';
import { useState } from 'react';

import { FeedbackDialog } from '../shared/feedback/FeedbackDialog';
import { APP_FEEDBACK_ENDPOINT } from '../shared/feedback/feedbackEndpoint';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';

import { CompanionListRow, CompanionListSection } from './CompanionListSurface';

export function CompanionFeedbackSettingsRow() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const title = t('feedback.title');
  const { platform } = getCompanionRuntimeCapability();
  return (
    <CompanionListSection>
      <CompanionListRow ariaLabel={title} Icon={MessageSquare} onClick={() => setOpen(true)} title={title} />
      {open ? <FeedbackDialog
        companionPlatform={platform}
        endpoint={APP_FEEDBACK_ENDPOINT}
        onClose={() => setOpen(false)}
        open
        turnstileSiteKey={import.meta.env.VITE_FOLIOLE_TURNSTILE_SITE_KEY}
      /> : null}
    </CompanionListSection>
  );
}
