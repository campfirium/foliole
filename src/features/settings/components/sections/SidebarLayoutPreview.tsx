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
        <input className={settingsRangeClassName('min-w-0 flex-1')} id={sliderId} max={100} min={0}
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
  const [revealed, setRevealed] = useState<{ side: SidebarSide; fromEdge: boolean }>();
  const mode = (side: SidebarSide) => overrides[side] ?? tier[side].mode;
  const floating = revealed && mode(revealed.side) === 'edge' ? revealed.side : undefined;
  const dismissHover = () => { if (revealed?.fromEdge) setRevealed(undefined); };
  const panel = (side: SidebarSide, floating = false) => (
    <div data-sidebar-preview-panel={side} data-floating={floating || undefined}
      className={`grid min-w-0 shrink-0 place-items-center overflow-hidden text-ui-sm
        ${floating
          ? `absolute inset-y-3 z-10 rounded-md border border-foreground/30 shadow-lg ${side === 'left' ? 'left-0' : 'right-0'}`
          : `text-muted-foreground border-settings-divider ${side === 'left' ? 'border-r' : 'border-l'}`}`}
      onPointerLeave={floating ? dismissHover : undefined}
      style={{ width: `${tier[side].width}%`, background: previewPanelBackground(side, floating) }}>
      <div className="min-w-0 max-w-full px-1 text-center">
        <div className="truncate">{t(`settings.appearance.sidebarLayout.${side}Column`)}</div>
        {floating && <div className="truncate text-xs font-semibold">{t('settings.appearance.sidebarLayout.previewOverlay')}</div>}
      </div>
    </div>
  );
  const toggle = (side: SidebarSide) => {
    const Icon = side === 'left' ? PanelLeft : PanelRight;
    return (
      <button aria-label={t(`settings.appearance.sidebarLayout.${side}`)} aria-pressed={mode(side) === 'dock' || floating === side}
        className="app-focus-boundary grid h-7 w-7 place-items-center rounded hover:bg-settings-selected"
        onClick={() => {
          if (mode(side) === 'edge') {
            setRevealed(floating === side ? undefined : { side, fromEdge: false });
            return;
          }
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
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-background" onPointerLeave={dismissHover}>
        {mode('left') === 'dock' && panel('left')}
        <PreviewDocument />
        {mode('right') === 'dock' && panel('right')}
        {sides.map(side => mode(side) === 'edge' && (
          <div aria-hidden="true" data-sidebar-preview-edge={side} className={`absolute inset-y-0 w-2 ${side === 'left' ? 'left-0' : 'right-0'}`}
            key={side} onPointerEnter={() => setRevealed({ side, fromEdge: true })} />
        ))}
        {floating && panel(floating, true)}
      </div>
    </div>
  );
}


function previewPanelBackground(side: SidebarSide, floating: boolean) {
  const surface = side === 'left' ? 'var(--role-nav-bg)' : 'var(--role-sidebar-bg)';
  return floating ? `color-mix(in srgb, var(--app-settings-selected-bg, ${surface}) 82%, transparent)` : surface;
}

function PreviewDocument() {
  const t = useTranslation();
  return (
    <div data-sidebar-preview-document="" className="relative min-w-0 flex-1 overflow-hidden px-4 py-3">
      <div className="h-full min-w-0 rounded-sm border border-dashed border-foreground/30 px-3 py-2 text-ui-sm text-muted-foreground">
        <div className="truncate font-medium">{t('settings.appearance.sidebarLayout.previewDocument')}</div>
        <div aria-hidden="true" className="mt-2 grid gap-2">
          <div className="h-px w-full bg-foreground/35" />
          <div className="h-px w-[94%] bg-foreground/30" />
          <div className="h-px w-full bg-foreground/35" />
          <div className="h-px w-[87%] bg-foreground/30" />
        </div>
      </div>
    </div>
  );
}
