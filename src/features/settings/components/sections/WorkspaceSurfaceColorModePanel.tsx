import { AppInput } from '../../../../shared/ui';
import {
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteOptions
} from '../../model/workspaceSurfaceAutoPalette';
import {
  formatWorkspaceSurfaceColorCss,
  formatWorkspaceSurfaceColorHex,
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue
} from '../../model/workspaceSurfaceColor';
import { getWorkspaceSurfaceRecommendationFamilies } from '../../model/workspaceSurfaceColorRecommendations';

import { cn } from '@/shared/lib/utils';

function InlineSwitch(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.checked}
      className="inline-flex items-center gap-3 text-left"
      onClick={() => props.onChange(!props.checked)}
      type="button"
    >
      <span className="text-sm text-foreground/82">{props.label}</span>
      <span
        className={cn(
          'relative h-8 w-14 rounded-full border transition-colors',
          props.checked ? 'border-foreground/20 bg-foreground/35' : 'border-border/60 bg-foreground/[0.08]'
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-6 w-6 rounded-full bg-bg-elevated shadow-sm transition-all',
            props.checked ? 'left-7' : 'left-1'
          )}
        />
      </span>
    </button>
  );
}

function WorkspaceSurfacePreferences(props: {
  options: WorkspaceSurfaceAutoPaletteOptions;
  onOptionsChange: (options: WorkspaceSurfaceAutoPaletteOptions) => void;
}) {
  const setOption = (key: keyof WorkspaceSurfaceAutoPaletteOptions, value: boolean) => {
    props.onOptionsChange({ ...props.options, [key]: value });
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">Preferences</h4>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <InlineSwitch checked={props.options.documentPureWhite} label="Document stays white" onChange={(checked) => setOption('documentPureWhite', checked)} />
        <InlineSwitch checked={props.options.folderTopicSharedTone} label="Folder and topic match" onChange={(checked) => setOption('folderTopicSharedTone', checked)} />
      </div>
    </div>
  );
}

function RecommendedPaletteButton(props: {
  familyId: string;
  selected: boolean;
  tones: WorkspaceSurfaceColorValue[];
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`Apply recommended palette ${props.familyId}`}
      className={cn(
        'flex items-center gap-1.5 rounded-xl p-1 transition-all',
        props.selected ? 'bg-foreground/[0.05] shadow-[0_0_0_1px_rgba(32,33,36,0.22)]' : 'hover:bg-foreground/[0.03]'
      )}
      onClick={props.onClick}
      type="button"
    >
      {props.tones.map((tone, index) => (
        <span
          aria-hidden="true"
          className={cn(
            'block h-8 w-8 rounded-[10px]',
            props.selected ? 'shadow-[inset_0_0_0_1px_rgba(32,33,36,0.08)]' : ''
          )}
          key={`${props.familyId}-${index}`}
          style={{ backgroundColor: formatWorkspaceSurfaceColorCss(tone) }}
        />
      ))}
    </button>
  );
}

function WorkspaceSurfaceRecommendedPaletteRows(props: {
  activeRecommendationId: string | null;
  autoSeedColor: WorkspaceSurfaceColorValue;
  options: WorkspaceSurfaceAutoPaletteOptions;
  onApplyRecommended: (familyId: string, palette: string[]) => void;
}) {
  const families = getWorkspaceSurfaceRecommendationFamilies(props.autoSeedColor, props.options);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">Recommended</h4>
      <div className="flex flex-wrap gap-2.5">
        {families.map((family) => (
          <RecommendedPaletteButton
            familyId={family.id}
            key={family.id}
            onClick={() => props.onApplyRecommended(family.id, family.tones.map((tone) => formatWorkspaceSurfaceColorCss(tone)))}
            selected={props.activeRecommendationId === family.id}
            tones={family.tones}
          />
        ))}
      </div>
    </div>
  );
}

function AutomaticPalettePreview(props: { palette: string[] }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className="block h-8 w-8 rounded-[10px]"
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function WorkspaceSurfaceAutomaticPanel(props: {
  autoSeedColor: WorkspaceSurfaceColorValue;
  options: WorkspaceSurfaceAutoPaletteOptions;
  onAutoSeedColorChange: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const autoPalette = buildWorkspaceSurfaceAutoColumnPalette(props.autoSeedColor, props.options);
  const syncSeedColor = (value: string) => {
    const parsed = parseWorkspaceSurfaceColor(value.trim());
    if (parsed) {
      props.onAutoSeedColorChange({ ...parsed, a: props.autoSeedColor.a });
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">Automatic</h4>
      <div className="flex items-center gap-3">
        <button
          aria-label="Automatic workspace seed color"
          className="h-10 w-10 shrink-0 rounded-lg border border-border/55"
          onClick={() => document.getElementById('workspace-surface-auto-seed-picker')?.click()}
          style={{ backgroundColor: formatWorkspaceSurfaceColorCss(props.autoSeedColor) }}
          type="button"
        />
        <label className="w-28 shrink-0 text-sm text-foreground/72">
          <AppInput
            aria-label="Automatic workspace seed hex"
            className="h-9 rounded-lg px-3 text-sm"
            onChange={(event) => syncSeedColor(event.target.value)}
            value={formatWorkspaceSurfaceColorHex(props.autoSeedColor)}
          />
        </label>
        <div className="min-w-0">
          <AutomaticPalettePreview palette={autoPalette} />
        </div>
        <input
          aria-label="Automatic workspace seed native picker"
          className="sr-only"
          id="workspace-surface-auto-seed-picker"
          onChange={(event) => syncSeedColor(event.target.value)}
          type="color"
          value={formatWorkspaceSurfaceColorHex(props.autoSeedColor)}
        />
      </div>
    </div>
  );
}

export function WorkspaceSurfaceColorModePanel(props: {
  activeRecommendationId: string | null;
  autoOptions: WorkspaceSurfaceAutoPaletteOptions;
  autoSeedColor: WorkspaceSurfaceColorValue;
  onApplyRecommendedPalette: (familyId: string, palette: string[]) => void;
  onAutoOptionsChange: (options: WorkspaceSurfaceAutoPaletteOptions) => void;
  onAutoSeedColorChange: (color: WorkspaceSurfaceColorValue) => void;
}) {
  return (
    <div className="mt-3 space-y-4">
      <WorkspaceSurfacePreferences onOptionsChange={props.onAutoOptionsChange} options={props.autoOptions} />
      <WorkspaceSurfaceRecommendedPaletteRows
        activeRecommendationId={props.activeRecommendationId}
        autoSeedColor={props.autoSeedColor}
        onApplyRecommended={props.onApplyRecommendedPalette}
        options={props.autoOptions}
      />
      <WorkspaceSurfaceAutomaticPanel
        autoSeedColor={props.autoSeedColor}
        onAutoSeedColorChange={props.onAutoSeedColorChange}
        options={props.autoOptions}
      />
    </div>
  );
}
