import { PanelLeft, PanelRight } from 'lucide-react';
import { useId, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { settingsRangeClassName } from '../../../../shared/ui';
import type { SidebarMode, SidebarSide, SidebarTier } from '../../model/sidebarLayoutTiers';

const sides = ['left', 'right'] as const;

export function SidebarLayoutPreview({ percent, tier, onResize }: {
  percent: number;
  tier: SidebarTier;
  onResize: (percent: number) => void;
}) {
  const t = useTranslation();
  const sliderId = useId();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="px-settings-panel-x pb-4">
      <h4 className="mb-2 text-ui-md font-medium" id={titleId}>{t('settings.appearance.sidebarLayout.preview')}</h4>
      <div className="mb-3 flex items-center gap-3 text-ui-md">
        <label htmlFor={sliderId}>{t('settings.appearance.sidebarLayout.previewWidth')}</label>
        <input className={settingsRangeClassName("min-w-0 flex-1")} id={sliderId} max={100} min={0}
          onChange={event => onResize(event.currentTarget.valueAsNumber)} type="range" value={percent} />
        <span className="w-[4ch] text-right tabular-nums">{percent}%</span>
      </div>
      <div className="flex h-40 justify-center rounded-lg bg-settings-control p-2">
        <PreviewWindow key={tier.id} tier={tier} percent={percent} />
      </div>
    </section>
  );
}

function PreviewWindow({ tier, percent }: { tier: SidebarTier; percent: number }) {
  const t = useTranslation();
  const [overrides, setOverrides] = useState<Partial<Record<SidebarSide, SidebarMode>>>({});
  const [revealed, setRevealed] = useState<SidebarSide>();
  const mode = (side: SidebarSide) => overrides[side] ?? tier[side].mode;
  const panel = (side: SidebarSide, floating = false) => (
    <div data-sidebar-preview-panel={side} data-floating={floating || undefined} className={`grid min-w-0 shrink-0 place-items-center overflow-hidden border-settings-divider text-ui-sm text-muted-foreground
      ${side === 'left' ? 'border-r bg-[var(--role-nav-bg)]' : 'border-l bg-[var(--role-sidebar-bg)]'}
      ${floating ? `absolute inset-y-0 z-10 shadow-md ${side === 'left' ? 'left-0' : 'right-0'}` : ''}`}
      onPointerLeave={floating ? () => setRevealed(undefined) : undefined}
      style={{ width: `${tier[side].width}%` }}>
      <span className="max-w-full truncate px-1">{t(`settings.appearance.sidebarLayout.${side}Column`)}</span>
    </div>
  );
  const toggle = (side: SidebarSide) => {
    const Icon = side === 'left' ? PanelLeft : PanelRight;
    return (
      <button aria-label={t(`settings.appearance.sidebarLayout.${side}`)} aria-pressed={mode(side) === 'dock'}
        className="app-focus-boundary grid h-7 w-7 place-items-center rounded hover:bg-settings-selected"
        onClick={() => {
          setRevealed(undefined);
          setOverrides({ ...overrides, [side]: mode(side) === 'dock' ? 'closed' : 'dock' });
        }} type="button"><Icon aria-hidden="true" size={16} /></button>
    );
  };
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-md border border-settings-control-border"
      style={{ width: `${percent}%` }}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-settings-divider bg-settings-control text-center text-ui-sm">
        {toggle('left')}<span className="truncate">Foliole</span>{toggle('right')}
      </div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-background" onPointerLeave={() => setRevealed(undefined)}>
        {mode('left') === 'dock' && panel('left')}
        <div className="grid min-w-0 flex-1 place-items-center overflow-hidden text-ui-sm text-muted-foreground">
          <span className="max-w-full truncate px-1">{t('settings.appearance.sidebarLayout.previewDocument')}</span>
        </div>
        {mode('right') === 'dock' && panel('right')}
        {sides.map(side => mode(side) === 'edge' && (
          <div aria-hidden="true" data-sidebar-preview-edge={side} className={`absolute inset-y-0 w-2 ${side === 'left' ? 'left-0' : 'right-0'}`}
            key={side} onPointerEnter={() => setRevealed(side)} />
        ))}
        {revealed && mode(revealed) === 'edge' && panel(revealed, true)}
      </div>
    </div>
  );
}
