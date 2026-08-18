import { Trash2 } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  settingsButtonClassName,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';

export function ExternalLibraryRowActions(props: {
  disabled: boolean;
  folderId: string;
  onDisconnectFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  const t = useTranslation();

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        className={settingsButtonClassName('h-9 px-3')}
        disabled={props.disabled}
        onClick={() => props.onDisconnectFolder(props.folderId)}
        type="button"
      >
        {t('settings.externalSources.disconnect')}
      </button>
      <button
        aria-label={t('settings.externalSources.updateMirror')}
        className={settingsButtonClassName('h-9 px-3')}
        disabled={props.disabled}
        onClick={() => props.onRebuildIndex(props.folderId)}
        title={t('settings.externalSources.updateMirrorTitle')}
        type="button"
      >
        {t('settings.externalSources.update')}
      </button>
      <button
        aria-label={t('settings.externalSources.removeFolder')}
        className={settingsUtilityIconButtonClassName()}
        disabled={props.disabled}
        onClick={() => props.onRemoveFolder(props.folderId)}
        type="button"
      >
        <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}
