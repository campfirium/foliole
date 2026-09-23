import { Plus } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  settingsActionTableAddButtonClassName
} from '../../../../shared/ui';
import type { HotkeySettingItem } from '../../model/hotkeySettings';

import { SettingsRailActionPicker } from './SettingsRailActionPicker';
import { IconPicker } from './SettingsRailIconPicker';

type PickerStep = 'action' | 'icon';

function PickerContent(props: {
  actions: HotkeySettingItem[];
  actionQuery: string;
  iconQuery: string;
  selectedAction: HotkeySettingItem | null;
  selectedIconId: string;
  step: PickerStep;
  onActionQueryChange: (query: string) => void;
  onBack: () => void;
  onIconQueryChange: (query: string) => void;
  onSelectAction: (item: HotkeySettingItem) => void;
  onSelectIcon: (iconId: string, selectedAction: HotkeySettingItem) => void;
}) {
  const selectedAction = props.selectedAction;
  if (props.step === 'icon' && selectedAction) {
    return (
      <IconPicker
        onBack={props.onBack}
        onQueryChange={props.onIconQueryChange}
        onSelect={(iconId) => props.onSelectIcon(iconId, selectedAction)}
        query={props.iconQuery}
        selectedAction={selectedAction}
        selectedIconId={props.selectedIconId}
      />
    );
  }
  return (
    <SettingsRailActionPicker
      actions={props.actions}
      onQueryChange={props.onActionQueryChange}
      onSelect={props.onSelectAction}
      query={props.actionQuery}
      selectedAction={props.selectedAction}
    />
  );
}

function AddActionDialog(props: {
  actionQuery: string;
  actions: HotkeySettingItem[];
  iconQuery: string;
  open: boolean;
  selectedAction: HotkeySettingItem | null;
  selectedIconId: string;
  step: PickerStep;
  onActionQueryChange: (query: string) => void;
  onBack: () => void;
  onIconQueryChange: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (item: HotkeySettingItem) => void;
  onSelectIcon: (iconId: string, selectedAction: HotkeySettingItem) => void;
}) {
  const t = useTranslation();
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(760px,calc(100vw-48px))] p-4">
          <AppDialogTitle className="sr-only">{t('settings.rail.addDialog.title')}</AppDialogTitle>
          <PickerContent
            actionQuery={props.actionQuery}
            actions={props.actions}
            iconQuery={props.iconQuery}
            onActionQueryChange={props.onActionQueryChange}
            onBack={props.onBack}
            onIconQueryChange={props.onIconQueryChange}
            onSelectAction={props.onSelectAction}
            onSelectIcon={props.onSelectIcon}
            selectedAction={props.selectedAction}
            selectedIconId={props.selectedIconId}
            step={props.step}
          />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function selectMenuAction(args: {
  item: HotkeySettingItem;
  requireIcon: boolean;
  onAdd: (command: { commandId: string; iconId?: string; label: string }) => void;
  closePicker: () => void;
  setSelectedAction: (item: HotkeySettingItem) => void;
  setStep: (step: PickerStep) => void;
}) {
  if (!args.requireIcon) {
    args.onAdd({ commandId: args.item.commandId, label: args.item.title });
    args.closePicker();
    return;
  }
  args.setSelectedAction(args.item);
  args.setStep('icon');
}

export function AddRailActionRow({
  actionItems,
  currentCommandIds,
  onAdd,
  requireIcon = true,
  compact = false
}: {
  actionItems: HotkeySettingItem[];
  currentCommandIds: Set<string>;
  onAdd: (command: { commandId: string; iconId?: string; label: string }) => void;
  requireIcon?: boolean;
  compact?: boolean;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<PickerStep>('action');
  const [actionQuery, setActionQuery] = useState('');
  const [iconQuery, setIconQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<HotkeySettingItem | null>(null);
  const availableActions = actionItems.filter((item) => !currentCommandIds.has(item.commandId));

  function closePicker(nextOpen = false) {
    setOpen(nextOpen);
    setStep('action');
    setSelectedAction(null);
    setActionQuery('');
    setIconQuery('');
  }

  return (
    <>
      <button
        className={compact ? settingsActionTableAddButtonClassName('col-span-1 w-full') : 'mx-5 my-3 flex min-h-12 w-[calc(100%-2.5rem)] items-center justify-center gap-2 rounded-md border border-dashed border-settings-control-border bg-transparent px-4 text-ui-md text-foreground/60 transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45'}
        disabled={!availableActions.length}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Plus aria-hidden="true" size={compact ? 15 : 18} />
        <span>{t('settings.rail.addAction')}</span>
      </button>
      <AddActionDialog
        actionQuery={actionQuery}
        actions={availableActions}
        iconQuery={iconQuery}
        onActionQueryChange={setActionQuery}
        onBack={() => setStep('action')}
        onIconQueryChange={setIconQuery}
        onOpenChange={closePicker}
        onSelectAction={(item) => selectMenuAction({ item, requireIcon, onAdd, closePicker, setSelectedAction, setStep })}
        onSelectIcon={(iconId, action) => {
          onAdd({ commandId: action.commandId, iconId, label: action.title });
          closePicker(false);
        }}
        open={open}
        selectedAction={selectedAction}
        selectedIconId="FileUp"
        step={step}
      />
    </>
  );
}
