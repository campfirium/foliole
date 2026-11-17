import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsRow, SettingsSection, settingsResetButtonClassName, settingsUtilityIconButtonClassName } from '../../../../shared/ui';
import { saveSidebarTiers, useSavedSidebarTiers, useSidebarLayoutWindowPercent } from '../../model/sidebarLayoutPreference';
import {
  defaultSidebarTiers, nextSidebarThreshold, selectSidebarTier, sidebarModes, type SidebarMode, type SidebarRule, type SidebarSide, type SidebarTier
} from '../../model/sidebarLayoutTiers';

import { SidebarLayoutPreview } from './SidebarLayoutPreview';

const fieldClass = 'app-focus-boundary h-9 rounded-md border border-settings-control-border bg-settings-control px-2 text-ui-md';
const cellClass = 'px-1.5 py-1.5 first:pl-2 last:pr-2';

function NumberField(props: { label: string; value: number; onChange: (value: number) => boolean; integer?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {props.integer && <span aria-hidden="true">≥</span>}
      <input
        aria-label={props.label}
        className={`${fieldClass} w-[3.875rem]`}
        defaultValue={props.value}
        key={props.value}
        max={100}
        min={0}
        onBlur={({ currentTarget }) => {
          const value = currentTarget.valueAsNumber;
          if (!currentTarget.validity.valid || !Number.isFinite(value) || !props.onChange(value)) {
            currentTarget.value = String(props.value);
          }
        }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        step={props.integer ? 1 : 'any'}
        type="number"
      />
      <span aria-hidden="true">%</span>
    </span>
  );
}

function SideFields({ rule, side, onChange }: { rule: SidebarRule; side: SidebarSide; onChange: (rule: SidebarRule) => void }) {
  const t = useTranslation();
  const sideLabel = t(side === 'left' ? 'settings.appearance.sidebarLayout.left' : 'settings.appearance.sidebarLayout.right');
  return (
    <>
      <td className={cellClass}>
        <select
          aria-label={sideLabel}
          className={`${fieldClass} w-full min-w-[5.75rem]`}
          onChange={event => onChange({ ...rule, mode: event.currentTarget.value as SidebarMode })}
          value={rule.mode}
        >
          {sidebarModes.map(mode => <option key={mode} value={mode}>{t(`settings.appearance.sidebarLayout.${mode}`)}</option>)}
        </select>
      </td>
      <td className={cellClass}>
        <NumberField label={`${sideLabel} (%)`} value={rule.width} onChange={width => {
          if (width !== rule.width) onChange({ ...rule, width });
          return true;
        }} />
      </td>
    </>
  );
}

function TierRow(props: {
  tier: SidebarTier;
  active: boolean;
  baseLabel: string;
  update: (tier: SidebarTier) => void;
  remove: () => void;
  changeThreshold: (threshold: number) => boolean;
}) {
  const t = useTranslation();
  const { tier, update } = props;
  return (
    <tr aria-current={props.active ? 'true' : undefined} className={props.active ? 'bg-settings-selected' : undefined}>
      <td className={cellClass}>
        {tier.threshold === null ? props.baseLabel : (
          <NumberField label={t('settings.appearance.sidebarLayout.threshold')} value={tier.threshold} integer onChange={props.changeThreshold} />
        )}
      </td>
      <SideFields rule={tier.left} side="left" onChange={left => update({ ...tier, left })} />
      <SideFields rule={tier.right} side="right" onChange={right => update({ ...tier, right })} />
      <td className={`${cellClass} w-px text-right`}>
        {tier.threshold !== null && (
          <button aria-label={t('settings.appearance.sidebarLayout.remove')} className={settingsUtilityIconButtonClassName()}
            onClick={props.remove} type="button"><Trash2 aria-hidden="true" size={16} /></button>
        )}
      </td>
    </tr>
  );
}

function TierTableHeader() {
  const t = useTranslation();
  return (
    <thead>
      <tr className="border-b border-settings-divider text-ui-sm text-muted-foreground">
        {(['windowColumn', 'leftColumn', 'widthColumn', 'rightColumn', 'widthColumn'] as const).map((column, index) => (
          <th className={`${cellClass} font-medium`} key={index} scope="col">{t(`settings.appearance.sidebarLayout.${column}`)}</th>
        ))}
        <th aria-label={t('settings.appearance.sidebarLayout.actionsColumn')} scope="col" />
      </tr>
    </thead>
  );
}

export function SettingsSidebarLayoutSection() {
  const t = useTranslation();
  const windowPercent = useSidebarLayoutWindowPercent();
  const tiers = useSavedSidebarTiers() ?? defaultSidebarTiers;
  const [error, setError] = useState<'duplicate' | 'saveError' | null>(null);
  const [previewPercent, setPreviewPercent] = useState<number>();
  if (windowPercent === null) return null;

  const simulatedPercent = previewPercent ?? Math.max(0, Math.min(100, Math.round(windowPercent)));
  const active = selectSidebarTier(tiers, previewPercent ?? windowPercent);
  const nextThreshold = nextSidebarThreshold(tiers, previewPercent ?? windowPercent);
  const rows = tiers.toSorted((a, b) => (b.threshold ?? -1) - (a.threshold ?? -1));
  const firstThreshold = rows.at(-2)?.threshold;
  const baseLabel = firstThreshold == null ? t('settings.appearance.sidebarLayout.base') : `< ${firstThreshold}%`;
  const save = (next: SidebarTier[]) => {
    setError(null);
    void saveSidebarTiers(next).then(saved => { if (!saved) setError('saveError'); });
  };
  const update = (tier: SidebarTier) => save(tiers.map(existing => existing.id === tier.id ? tier : existing));
  const updateThreshold = (tier: SidebarTier, threshold: number) => {
    if (tiers.some(other => other.id !== tier.id && other.threshold === threshold)) {
      setError('duplicate');
      return false;
    }
    if (threshold !== tier.threshold) update({ ...tier, threshold });
    return true;
  };
  return (
    <SettingsSection
      actions={<RestoreTiersButton onClick={() => save(defaultSidebarTiers)} />}
      ariaLabel={t('settings.appearance.sidebarLayout.title')}
      title={t('settings.appearance.sidebarLayout.title')}
    >
      <SettingsRow title={t('settings.appearance.sidebarLayout.windowWidth')}>
        <output className="tabular-nums">{Math.round(windowPercent)}%</output>
      </SettingsRow>
      {active && <SidebarLayoutPreview percent={simulatedPercent} tier={active} onResize={setPreviewPercent} />}
      <div className="px-settings-panel-x">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap text-left text-ui-md">
            <TierTableHeader />
            <tbody>
              {rows.map(tier => (
                <TierRow key={tier.id} tier={tier} active={active?.id === tier.id} baseLabel={baseLabel} update={update}
                  changeThreshold={threshold => updateThreshold(tier, threshold)}
                  remove={() => save(tiers.filter(existing => existing.id !== tier.id))} />
              ))}
            </tbody>
          </table>
        </div>
        <button className="app-focus-boundary mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-settings-control-border text-ui-md text-muted-foreground hover:bg-settings-control hover:text-foreground disabled:opacity-45"
          disabled={nextThreshold === undefined || !active} onClick={() => {
            if (nextThreshold !== undefined && active) save([...tiers, { ...active, id: crypto.randomUUID(), threshold: nextThreshold }]);
          }} type="button"><Plus aria-hidden="true" size={16} />{t('settings.appearance.sidebarLayout.add')}</button>
        {error && <p role="alert">{t(`settings.appearance.sidebarLayout.${error}`)}</p>}
      </div>
    </SettingsSection>
  );
}

function RestoreTiersButton({ onClick }: { onClick: () => void }) {
  const t = useTranslation();
  return (
    <button aria-label={t('settings.appearance.sidebarLayout.reset')} className={settingsResetButtonClassName()}
      onClick={onClick} type="button"><RotateCcw aria-hidden="true" size={18} /></button>
  );
}
