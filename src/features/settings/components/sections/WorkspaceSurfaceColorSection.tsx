import { useEffect, useRef, useState } from 'react';

import { AppButton, SettingsSection } from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { WORKSPACE_SURFACE_REGION_IDS, type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

const GRID_ROWS: Array<Array<{ id: WorkspaceSurfaceRegionId; label: string }>> = [
  [
    { id: 'titlebar-rail', label: 'Top rail' },
    { id: 'titlebar-folder', label: 'Top folder' },
    { id: 'titlebar-topic', label: 'Top topic' },
    { id: 'titlebar-document', label: 'Top doc' },
    { id: 'titlebar-sidebar', label: 'Top sidebar' }
  ],
  [
    { id: 'main-rail', label: 'Main rail' },
    { id: 'main-folder', label: 'Main folder' },
    { id: 'main-topic', label: 'Main topic' },
    { id: 'main-document', label: 'Main doc' },
    { id: 'main-sidebar', label: 'Main sidebar' }
  ],
  [
    { id: 'footer-rail', label: 'Bottom rail' },
    { id: 'footer-folder', label: 'Bottom folder' },
    { id: 'footer-topic', label: 'Bottom topic' },
    { id: 'footer-document', label: 'Bottom doc' },
    { id: 'footer-sidebar', label: 'Bottom sidebar' }
  ]
];

function clampBrushIndex(value: number, paletteLength: number) {
  return Math.min(Math.max(value, 0), Math.max(paletteLength - 1, 0));
}

function useWorkspaceSurfacePainter() {
  const appearance = useAppearanceSettings();
  const [activeBrushIndex, setActiveBrushIndex] = useState(0);
  const [isPainting, setIsPainting] = useState(false);
  const paletteInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setActiveBrushIndex((current) => clampBrushIndex(current, appearance.workspaceSurfacePalette.length));
  }, [appearance.workspaceSurfacePalette.length]);

  useEffect(() => {
    if (!isPainting) {
      return undefined;
    }
    const stopPainting = () => setIsPainting(false);
    window.addEventListener('mouseup', stopPainting);
    window.addEventListener('pointerup', stopPainting);
    return () => {
      window.removeEventListener('mouseup', stopPainting);
      window.removeEventListener('pointerup', stopPainting);
    };
  }, [isPainting]);

  return {
    activeBrushIndex,
    appearance,
    isPainting,
    paletteInputRefs,
    setActiveBrushIndex,
    setIsPainting,
    setRegionColor: (regionId: WorkspaceSurfaceRegionId) =>
      appearance.setWorkspaceSurfaceAssignments({
        ...appearance.workspaceSurfaceAssignments,
        [regionId]: activeBrushIndex
      }),
    updatePaletteColor: (index: number, value: string) =>
      appearance.setWorkspaceSurfacePalette(
        appearance.workspaceSurfacePalette.map((color, paletteIndex) => (paletteIndex === index ? value : color))
      ),
    addPaletteColor: () => {
      const fallbackColor = appearance.workspaceSurfacePalette[activeBrushIndex] ?? '#d8d8d8';
      appearance.setWorkspaceSurfacePalette([...appearance.workspaceSurfacePalette, fallbackColor]);
      setActiveBrushIndex(appearance.workspaceSurfacePalette.length);
    }
  };
}

function WorkspaceSurfaceGrid(props: ReturnType<typeof useWorkspaceSurfacePainter>) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {GRID_ROWS.flatMap((row) =>
        row.map((cell) => {
          const swatchIndex = props.appearance.workspaceSurfaceAssignments[cell.id];
          const backgroundColor =
            props.appearance.workspaceSurfacePalette[swatchIndex] ?? props.appearance.workspaceSurfacePalette[0];
          return (
            <button
              aria-label={cell.label}
              className="flex min-h-[72px] min-w-0 flex-col justify-between rounded-lg border border-settings-outline p-3 text-left text-xs text-foreground/72 transition-transform hover:scale-[1.01]"
              key={cell.id}
              onMouseDown={() => {
                props.setRegionColor(cell.id);
                props.setIsPainting(true);
              }}
              onMouseEnter={() => props.isPainting && props.setRegionColor(cell.id)}
              style={{ backgroundColor }}
              type="button"
            >
              <span className="font-medium text-foreground">{cell.label}</span>
              <span className="text-[11px] text-foreground/60">{WORKSPACE_SURFACE_REGION_IDS.indexOf(cell.id) + 1}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function WorkspaceSurfacePalette(props: ReturnType<typeof useWorkspaceSurfacePainter>) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {props.appearance.workspaceSurfacePalette.map((color, index) => {
        const isActive = index === props.activeBrushIndex;
        return (
          <div className="flex flex-col items-center gap-2" key={`${color}-${index}`}>
            <button
              aria-label={`Palette color ${index + 1}`}
              className={`h-10 w-10 rounded-full border ${isActive ? 'border-foreground' : 'border-border'}`}
              onClick={() => props.setActiveBrushIndex(index)}
              onDoubleClick={() => props.paletteInputRefs.current[index]?.click()}
              style={{ backgroundColor: color }}
              type="button"
            />
            <input
              aria-label={`Palette color ${index + 1} picker`}
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              onChange={(event) => props.updatePaletteColor(index, event.target.value)}
              ref={(node) => {
                props.paletteInputRefs.current[index] = node;
              }}
              type="color"
              value={color}
            />
          </div>
        );
      })}
      <button
        aria-label="Add palette color"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border bg-bg-elevated text-lg text-foreground/70"
        onClick={props.addPaletteColor}
        type="button"
      >
        +
      </button>
    </div>
  );
}

export function WorkspaceSurfaceColorSection() {
  const painter = useWorkspaceSurfacePainter();

  return (
    <SettingsSection
      actions={
        <AppButton onClick={painter.appearance.resetWorkspaceSurfaceSettings} variant="ghost">
          Reset
        </AppButton>
      }
      ariaLabel="Workspace surface color section"
      description="Paint the real 3×5 workspace regions. Changes apply directly to the desktop client background surfaces."
      title="Workspace surface colors"
    >
      <div className="rounded-xl border border-settings-outline bg-settings-group p-4">
        <WorkspaceSurfaceGrid {...painter} />
        <WorkspaceSurfacePalette {...painter} />
      </div>
    </SettingsSection>
  );
}
