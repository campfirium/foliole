import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsRow, SettingsSection } from '../../../../shared/ui';
import { saveSidebarTiers, useSavedSidebarTiers, useSidebarLayoutWindowPercent } from '../../model/sidebarLayoutPreference';
import {
  defaultSidebarTiers, nextSidebarThreshold, selectSidebarTier, sidebarModes, type SidebarMode, type SidebarRule, type SidebarSide, type SidebarTier
} from '../../model/sidebarLayoutTiers';

const fieldClass = 'rounded border border-settings-control-border bg-settings-control px-2 py-1';

function NumberField(props: { label: string; value: number; onChange: (value: number) => boolean; integer?: boolean }) {
  return (
    <input
      aria-label={props.label}
      className={`${fieldClass} w-20`}
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
  );
}

function SideFields({ rule, side, onChange }: { rule: SidebarRule; side: SidebarSide; onChange: (rule: SidebarRule) => void }) {
  const t = useTranslation();
  const sideLabel = t(side === 'left' ? 'settings.appearance.sidebarLayout.left' : 'settings.appearance.sidebarLayout.right');
  return (
    <td className="p-2">
      <div className="flex gap-2">
        <select
          aria-label={sideLabel}
          className={fieldClass}
          onChange={event => onChange({ ...rule, mode: event.currentTarget.value as SidebarMode })}
          value={rule.mode}
        >
          {sidebarModes.map(mode => <option key={mode} value={mode}>{t(`settings.appearance.sidebarLayout.${mode}`)}</option>)}
        </select>
        <NumberField label={`${sideLabel} (%)`} value={rule.width} onChange={width => {
          if (width !== rule.width) onChange({ ...rule, width });
          return true;
        }} />
      </div>
    </td>
  );
}

function TierRow(props: {
  tier: SidebarTier;
  active: boolean;
  update: (tier: SidebarTier) => void;
  remove: () => void;
  changeThreshold: (threshold: number) => boolean;
}) {
  const t = useTranslation();
  const { tier, update } = props;
  return (
    <tr aria-current={props.active ? 'true' : undefined} className={props.active ? 'bg-settings-control' : undefined}>
      <td className="p-2">
        {tier.threshold === null ? t('settings.appearance.sidebarLayout.base') : (
          <NumberField label={t('settings.appearance.sidebarLayout.threshold')} value={tier.threshold} integer onChange={props.changeThreshold} />
        )}
      </td>
      <SideFields rule={tier.left} side="left" onChange={left => update({ ...tier, left })} />
      <SideFields rule={tier.right} side="right" onChange={right => update({ ...tier, right })} />
      <td className="p-2">
        {tier.threshold !== null && (
          <button aria-label={t('settings.appearance.sidebarLayout.remove')} onClick={props.remove} type="button"><Trash2 size={16} /></button>
        )}
      </td>
    </tr>
  );
}

export function SettingsSidebarLayoutSection() {
  const t = useTranslation();
  const windowPercent = useSidebarLayoutWindowPercent();
  const tiers = useSavedSidebarTiers() ?? defaultSidebarTiers;
  const [error, setError] = useState<'duplicate' | 'saveError' | null>(null);
  if (windowPercent === null) return null;

  const active = selectSidebarTier(tiers, windowPercent);
  const nextThreshold = nextSidebarThreshold(tiers, windowPercent);
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
    <SettingsSection ariaLabel={t('settings.appearance.sidebarLayout.title')} title={t('settings.appearance.sidebarLayout.title')}>
      <SettingsRow title={t('settings.appearance.sidebarLayout.windowWidth')}>
        <output>{Math.round(windowPercent)}%</output>
      </SettingsRow>
      <div className="overflow-x-auto px-settings-panel-x">
        <table className="w-full text-left text-sm">
          <thead><tr>
            <th className="p-2">{t('settings.appearance.sidebarLayout.threshold')}</th>
            <th className="p-2">{t('settings.appearance.sidebarLayout.left')}</th>
            <th className="p-2">{t('settings.appearance.sidebarLayout.right')}</th>
            <th />
          </tr></thead>
          <tbody>
            {tiers.map(tier => (
              <TierRow key={tier.id} tier={tier} active={active?.id === tier.id} update={update}
                changeThreshold={threshold => updateThreshold(tier, threshold)}
                remove={() => save(tiers.filter(existing => existing.id !== tier.id))} />
            ))}
          </tbody>
        </table>
        <div className="flex gap-3 py-2">
          <button className={fieldClass} disabled={nextThreshold === undefined || !active} onClick={() => {
            if (nextThreshold !== undefined && active) save([...tiers, { ...active, id: crypto.randomUUID(), threshold: nextThreshold }]);
          }} type="button">{t('settings.appearance.sidebarLayout.add')}</button>
          <button className={fieldClass} aria-label={t('settings.appearance.sidebarLayout.reset')} onClick={() => save(defaultSidebarTiers)} type="button"><RotateCcw size={16} /></button>
        </div>
        {error && <p role="alert">{t(`settings.appearance.sidebarLayout.${error}`)}</p>}
      </div>
    </SettingsSection>
  );
}
