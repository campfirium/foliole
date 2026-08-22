import { useCallback } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { resolveSystemEntryId } from '../../../shared/localization/systemEntryNames';
import { renameRuntimeSystemEntry } from '../../../shared/platform/desktop/systemEntryDisplayNamesRuntimeRepository';
import { useDemoRuntimeState } from '../../../shared/platform/runtime/demoRuntime';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

export function useNodeListRename(
  updateNodeTitle: (nodeId: string, title: string) => Promise<boolean>
) {
  const t = useTranslation();
  const { isDemo } = useDemoRuntimeState();
  return useCallback(async (nodeId: string, title: string) => {
    if (!resolveSystemEntryId(nodeId)) return updateNodeTitle(nodeId, title);
    try {
      return await renameRuntimeSystemEntry(nodeId, title, { demo: isDemo });
    } catch {
      showAppRuntimeNotice(t('settings.general.systemEntryNames.saveFailed'));
      return false;
    }
  }, [isDemo, t, updateNodeTitle]);
}
