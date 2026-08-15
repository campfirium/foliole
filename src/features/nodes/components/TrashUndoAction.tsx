import { RotateCcw } from 'lucide-react';

import { AppIconButton, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../../shared/ui';
import { clearAppRuntimeNotice, useAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

const TRASH_UNDO_LABEL = 'Restore last deleted item';

export function TrashUndoAction() {
  const notice = useAppRuntimeNotice();
  if (notice?.presentation !== 'trash-row' || !notice.action) return null;

  const handleUndo = () => {
    clearAppRuntimeNotice(notice.id);
    notice.action?.onSelect();
  };

  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <AppIconButton
          className="size-7 text-foreground/55"
          icon={<RotateCcw aria-hidden="true" size={15} strokeWidth={1.8} />}
          label={TRASH_UNDO_LABEL}
          onClick={handleUndo}
        />
      </AppTooltipTrigger>
      <AppTooltipContent side="right">{TRASH_UNDO_LABEL}</AppTooltipContent>
    </AppTooltip>
  );
}
