import { type PointerEvent as ReactPointerEvent } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../../shared/localization/translations';
import { type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

const GRID_TEMPLATE_COLUMNS = '40fr 120fr 180fr 627fr 213fr';
const GRID_TEMPLATE_ROWS = '40fr 420fr 56fr';
const GRID_CELLS: Array<{ id: WorkspaceSurfaceRegionId; labelKey: TranslationKey; row: number; column: number }> = [
  { column: 1, id: 'titlebar-rail', labelKey: 'settings.appearance.surface.grid.topRail', row: 1 },
  { column: 2, id: 'titlebar-folder', labelKey: 'settings.appearance.surface.grid.topFolder', row: 1 },
  { column: 3, id: 'titlebar-topic', labelKey: 'settings.appearance.surface.grid.topTopic', row: 1 },
  { column: 4, id: 'titlebar-document', labelKey: 'settings.appearance.surface.grid.topDocument', row: 1 },
  { column: 5, id: 'titlebar-sidebar', labelKey: 'settings.appearance.surface.grid.topSidebar', row: 1 },
  { column: 1, id: 'main-rail', labelKey: 'settings.appearance.surface.grid.mainRail', row: 2 },
  { column: 2, id: 'main-folder', labelKey: 'settings.appearance.surface.grid.mainFolder', row: 2 },
  { column: 3, id: 'main-topic', labelKey: 'settings.appearance.surface.grid.mainTopic', row: 2 },
  { column: 4, id: 'main-document', labelKey: 'settings.appearance.surface.grid.mainDocument', row: 2 },
  { column: 5, id: 'main-sidebar', labelKey: 'settings.appearance.surface.grid.mainSidebar', row: 2 },
  { column: 1, id: 'footer-rail', labelKey: 'settings.appearance.surface.grid.bottomRail', row: 3 },
  { column: 2, id: 'footer-folder', labelKey: 'settings.appearance.surface.grid.bottomFolder', row: 3 },
  { column: 3, id: 'footer-topic', labelKey: 'settings.appearance.surface.grid.bottomTopic', row: 3 },
  { column: 4, id: 'footer-document', labelKey: 'settings.appearance.surface.grid.bottomDocument', row: 3 },
  { column: 5, id: 'footer-sidebar', labelKey: 'settings.appearance.surface.grid.bottomSidebar', row: 3 }
];

export function WorkspaceSurfaceGrid(props: {
  appearance: {
    workspaceSurfaceAssignments: Record<WorkspaceSurfaceRegionId, number>;
    workspaceSurfacePalette: string[];
  };
  isPainting: boolean;
  onPaintStart: (event: ReactPointerEvent<HTMLButtonElement>, regionId: WorkspaceSurfaceRegionId) => void;
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void;
}) {
  const t = useTranslation();
  return (
    <div className="overflow-hidden rounded-sm border border-divider bg-transparent">
      <div className="grid gap-px bg-divider" style={{ aspectRatio: '16 / 9', gridTemplateColumns: GRID_TEMPLATE_COLUMNS, gridTemplateRows: GRID_TEMPLATE_ROWS }}>
        {GRID_CELLS.map((cell) => {
          const swatchIndex = props.appearance.workspaceSurfaceAssignments[cell.id];
          const backgroundColor = props.appearance.workspaceSurfacePalette[swatchIndex] ?? props.appearance.workspaceSurfacePalette[0];
          return (
            <button
              aria-label={t(cell.labelKey)}
              className="group relative min-h-0 min-w-0 bg-settings-control text-left transition-colors"
              data-workspace-region-id={cell.id}
              key={cell.id}
              onPointerDown={(event) => props.onPaintStart(event, cell.id)}
              onPointerEnter={() => props.isPainting && props.paintRegion(cell.id)}
              style={{ backgroundColor, gridColumn: cell.column, gridRow: cell.row }}
              type="button"
            >
            </button>
          );
        })}
      </div>
    </div>
  );
}
