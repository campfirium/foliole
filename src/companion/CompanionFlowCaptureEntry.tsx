import { Plus } from 'lucide-react';
import { createContext, useContext } from 'react';
import { flushSync } from 'react-dom';

import { useTranslation } from '../shared/localization/LocalizationProvider';

export const CompanionFlowCaptureContext = createContext<(() => void) | null>(null);

export function CompanionFlowCaptureEntry({ onClose }: { onClose(): void }) {
  const openCapture = useContext(CompanionFlowCaptureContext);
  const t = useTranslation();
  if (!openCapture) return null;

  const expand = () => {
    // Mount and focus the editor during the tap so the WebView can open the keyboard.
    flushSync(() => {
      onClose();
      openCapture();
    });
  };

  return (
    <button type="button"
      className="flex min-h-11 w-full items-center gap-3 border-b border-companion-divider px-1 py-2 text-left text-sm text-companion-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent"
      onClick={expand}>
      <Plus aria-hidden="true" className="h-5 w-5 shrink-0" />
      {t('companion.capture.placeholder')}
    </button>
  );
}
