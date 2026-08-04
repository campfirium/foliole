import { SlidersHorizontal } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import type {
  NativeAssistantModelOption,
  NativeAssistantModelSelection
} from '../../../lib/platform/nativeAssistantModelContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppIconButton,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

import type { FolioleAideModelControlsState } from './useFolioleAideModelControls';

export function WorkspaceRightSidebarAssistantModelControl(props: {
  controls: FolioleAideModelControlsState;
}) {
  const t = useTranslation();
  const ready = props.controls.status === 'ready'
    && props.controls.catalog !== null
    && props.controls.selection !== null;
  const tooltip = ready
    ? formatSelectionTooltip(props.controls, t)
    : props.controls.status === 'loading'
      ? t('desktop.rightPanel.assistant.model.loading')
      : t('desktop.rightPanel.assistant.model.unavailable');
  if (!ready) return <DisabledModelControl tooltip={tooltip} />;
  return (
    <AppDropdownMenu>
      <AppTooltip>
        <AppTooltipTrigger asChild>
          <AppDropdownMenuTrigger asChild>
            <ModelControlButton />
          </AppDropdownMenuTrigger>
        </AppTooltipTrigger>
        <AppTooltipContent>{tooltip}</AppTooltipContent>
      </AppTooltip>
      <ModelMenu controls={props.controls} />
    </AppDropdownMenu>
  );
}

function DisabledModelControl(props: { tooltip: string }) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <span className="inline-flex">
          <ModelControlButton disabled />
        </span>
      </AppTooltipTrigger>
      <AppTooltipContent>{props.tooltip}</AppTooltipContent>
    </AppTooltip>
  );
}

const ModelControlButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function ModelControlButton(
  props,
  ref
) {
  const t = useTranslation();
  const { className, ...buttonProps } = props;
  return (
    <AppIconButton
      {...buttonProps}
      className={`size-7 text-foreground/55 ${className ?? ''}`}
      icon={<SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.8} />}
      label={t('desktop.rightPanel.assistant.model.settings')}
      ref={ref}
      type={props.type ?? 'button'}
    />
  );
});

function ModelMenu(props: { controls: FolioleAideModelControlsState }) {
  const t = useTranslation();
  const { catalog, selection } = props.controls;
  if (!catalog || !selection) return null;
  const model = catalog.models.find((item) => item.model === selection.model);
  if (!model) return null;
  return (
    <AppDropdownMenuContent align="end" className="w-64">
      <AppDropdownMenuLabel>{t('desktop.rightPanel.assistant.model.model')}</AppDropdownMenuLabel>
      {catalog.models.map((item) => (
        <AppDropdownMenuCheckItem
          checked={item.model === selection.model}
          key={item.model}
          onSelect={() => props.controls.select(defaultSelection(item))}
          title={item.description}
        >
          {item.displayName}
        </AppDropdownMenuCheckItem>
      ))}
      <AppDropdownMenuSeparator />
      <AppDropdownMenuLabel>{t('desktop.rightPanel.assistant.model.reasoning')}</AppDropdownMenuLabel>
      {model.supportedReasoningEfforts.map((item) => (
        <AppDropdownMenuCheckItem
          checked={item.effort === selection.effort}
          key={item.effort}
          onSelect={() => props.controls.select({ ...selection, effort: item.effort })}
          title={item.description}
        >
          {item.description || item.effort}
        </AppDropdownMenuCheckItem>
      ))}
      <AppDropdownMenuSeparator />
      <ServiceTierItems controls={props.controls} model={model} selection={selection} />
    </AppDropdownMenuContent>
  );
}

function ServiceTierItems(props: {
  controls: FolioleAideModelControlsState;
  model: NativeAssistantModelOption;
  selection: NativeAssistantModelSelection;
}) {
  const t = useTranslation();
  const showDefault = props.model.defaultServiceTier === null;
  return (
    <>
      <AppDropdownMenuLabel>{t('desktop.rightPanel.assistant.model.speed')}</AppDropdownMenuLabel>
      {showDefault ? (
        <AppDropdownMenuCheckItem
          checked={props.selection.serviceTier === null}
          onSelect={() => props.controls.select({ ...props.selection, serviceTier: null })}
        >
          {t('desktop.rightPanel.assistant.model.defaultSpeed')}
        </AppDropdownMenuCheckItem>
      ) : null}
      {props.model.serviceTiers.map((tier) => (
        <AppDropdownMenuCheckItem
          checked={tier.id === props.selection.serviceTier}
          key={tier.id}
          onSelect={() => props.controls.select({ ...props.selection, serviceTier: tier.id })}
          title={tier.description}
        >
          {tier.name}
        </AppDropdownMenuCheckItem>
      ))}
    </>
  );
}

function defaultSelection(model: NativeAssistantModelOption): NativeAssistantModelSelection {
  return {
    effort: model.defaultReasoningEffort,
    model: model.model,
    serviceTier: model.defaultServiceTier
  };
}

function formatSelectionTooltip(
  controls: FolioleAideModelControlsState,
  t: ReturnType<typeof useTranslation>
) {
  const selection = controls.selection as NativeAssistantModelSelection;
  const model = controls.catalog?.models.find((item) => item.model === selection.model);
  const effort = model?.supportedReasoningEfforts.find((item) => item.effort === selection.effort);
  const tier = model?.serviceTiers.find((item) => item.id === selection.serviceTier);
  return t('desktop.rightPanel.assistant.model.tooltip', {
    effort: effort?.description || selection.effort,
    model: model?.displayName || selection.model,
    speed: tier?.name || t('desktop.rightPanel.assistant.model.defaultSpeed')
  });
}
