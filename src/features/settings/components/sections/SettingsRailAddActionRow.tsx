import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppInput
} from '../../../../shared/ui';
import type { HotkeySettingItem } from '../../model/hotkeySettings';

import { IconPicker } from './SettingsRailIconPicker';

type PickerStep = 'action' | 'icon';

function matchesQuery(values: Array<string | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery || values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function ActionPicker(props: {
  actions: HotkeySettingItem[];
  query: string;
  selectedAction: HotkeySettingItem | null;
  onQueryChange: (query: string) => void;
  onSelect: (item: HotkeySettingItem) => void;
}) {
  const t = useTranslation();
  const filteredActions = useMemo(
    () => props.actions.filter((item) => matchesQuery([item.title, item.section, item.commandId], props.query)),
    [props.actions, props.query]
  );
  return (
    <>
      <div className="mb-3 text-[1.02rem] font-semibold text-foreground">{t('settings.rail.chooseAction')}</div>
      <AppInput
        aria-label={t('settings.rail.searchActions')}
        autoFocus
        className="h-9 text-sm"
        onChange={(event) => props.onQueryChange(event.target.value)}
        placeholder={t('settings.rail.searchActions.placeholder')}
        value={props.query}
      />
      <div className="mt-3 max-h-[420px] overflow-auto pr-1">
        {filteredActions.map((item) => (
          <ActionPickerItem item={item} key={item.commandId} onSelect={props.onSelect} selectedAction={props.selectedAction} />
        ))}
        {!filteredActions.length ? <p className="px-3 py-3 text-sm text-foreground/60">{t('settings.rail.noMatchingActions')}</p> : null}
      </div>
    </>
  );
}

function ActionPickerItem(props: {
  item: HotkeySettingItem;
  selectedAction: HotkeySettingItem | null;
  onSelect: (item: HotkeySettingItem) => void;
}) {
  const t = useTranslation();
  return (
    <button
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
        props.selectedAction?.commandId === props.item.commandId
          ? 'bg-settings-selected text-foreground'
          : 'text-foreground/72 hover:bg-settings-control-hover hover:text-foreground'
      }`}
      onClick={() => props.onSelect(props.item)}
      type="button"
    >
      <span className="min-w-0 truncate font-medium">{props.item.title}</span>
      <span className="ml-4 shrink-0 text-xs text-foreground/45">{props.item.section ?? t('settings.rail.workspaceFallback')}</span>
    </button>
  );
}

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
    <ActionPicker
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

export function AddRailActionRow({
  actionItems,
  currentCommandIds,
  onAdd
}: {
  actionItems: HotkeySettingItem[];
  currentCommandIds: Set<string>;
  onAdd: (command: { commandId: string; iconId?: string; label: string }) => void;
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
        className="mx-5 my-3 flex min-h-12 w-[calc(100%-2.5rem)] items-center justify-center gap-3 rounded-md border border-dashed border-settings-divider bg-settings-control px-4 text-[0.96rem] text-foreground/62 transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!availableActions.length}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Plus aria-hidden="true" size={18} />
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
        onSelectAction={(item) => {
          setSelectedAction(item);
          setStep('icon');
        }}
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
