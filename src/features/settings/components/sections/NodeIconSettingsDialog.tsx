import { useEffect } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { onWindowEscape } from '../../../../shared/platform/keyboard';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../../../shared/ui';

import {
  NodeIconSettingsDialogBody,
  type NodeIconEditTarget,
  type NodeIconSettingsDialogState
} from './NodeIconSettingsDialogParts';

export type { NodeIconEditTarget };

type NodeIconSettingsDialogProps = {
  editTarget: NodeIconEditTarget | null;
  iconQuery: string;
  onClose: () => void;
  onIconQueryChange: (value: string) => void;
  resetLabel: string;
  onReset: (target: NodeIconEditTarget) => void;
  state: NodeIconSettingsDialogState;
};

export function NodeIconSettingsDialog(props: NodeIconSettingsDialogProps) {
  const target = props.editTarget;
  const t = useTranslation();
  useEffect(() => {
    if (!target) return undefined;
    return onWindowEscape(() => {
      props.onClose();
      return true;
    });
  }, [props.onClose, target]);
  if (!target) return null;
  return (
    <AppDialog open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="grid max-h-[calc(100dvh-32px)] w-[min(640px,calc(100vw-32px))] gap-4 overflow-auto rounded-lg border-settings-outline bg-settings-shell p-5 shadow-settings"
          data-settings-nested-dialog="true"
        >
          <AppDialogTitle className="text-[1.05rem]">{target.title}</AppDialogTitle>
          <NodeIconSettingsDialogBody {...props} target={target} />
          <footer className="flex justify-between border-t border-settings-divider/55 pt-4">
            <AppButton onClick={() => props.onReset(target)}>{props.resetLabel}</AppButton>
            <AppButton onClick={props.onClose} variant="primary">{t('settings.icons.done')}</AppButton>
          </footer>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
