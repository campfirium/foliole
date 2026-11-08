import { Plus } from 'lucide-react';
import { createContext, useContext } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

export const CompanionFlowCaptureContext = createContext<(() => void) | null>(null);

export function CompanionFlowCaptureButton() {
  const openCapture = useContext(CompanionFlowCaptureContext);
  const t = useTranslation();
  if (!openCapture) return null;

  return (
    <button type="button"
      aria-label={t('companion.capture.title')}
      className="inline-flex h-11 w-10 shrink-0 items-center justify-center text-companion-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent"
      onClick={openCapture}>
      <Plus aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
