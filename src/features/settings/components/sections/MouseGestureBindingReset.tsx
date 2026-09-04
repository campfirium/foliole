import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  requestAppConfirmation,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import type { EditorMouseGestureBinding } from '../../../editor/model/editorMouseGestures';
import { hasCustomEditorMouseGestureBindings } from '../../../editor/model/editorMouseGestureSettings';

export function MouseGestureBindingReset(props: {
  bindings: EditorMouseGestureBinding[];
  onReset: () => void;
}) {
  const t = useTranslation();
  const reset = async () => {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('settings.mouseGestures.record.cancel'),
      confirmLabel: t('settings.mouseGestures.bindings.reset'),
      description: [t('settings.mouseGestures.bindings.resetDescription')],
      title: t('settings.mouseGestures.bindings.resetTitle')
    });
    if (confirmed) props.onReset();
  };
  return (
    <button
      aria-label={t('settings.mouseGestures.bindings.reset')}
      className={settingsResetButtonClassName()}
      disabled={!hasCustomEditorMouseGestureBindings(props.bindings)}
      onClick={() => void reset()}
      type="button"
    >
      <RotateCcw aria-hidden="true" size={17} />
    </button>
  );
}
