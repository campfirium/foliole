import { useCallback, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

export function useAnnotationNoteSave(args: {
  draft: string;
  onClose: () => void;
  onCreateNote: (note: string) => boolean | Promise<boolean> | void;
}) {
  const t = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearError = useCallback(() => setError(null), []);
  const save = async () => {
    if (saving || !args.draft.trim()) return;
    setSaving(true);
    try {
      if (await args.onCreateNote(args.draft) === true) {
        args.onClose();
        return;
      }
    } catch {
      // Rejected and unsuccessful saves have the same user-visible result.
    } finally {
      setSaving(false);
    }
    setError(t('desktop.annotation.saveFailed'));
  };

  return { clearError, error, save, saving };
}
