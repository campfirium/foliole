import type { CSSProperties } from 'react';

import { getNodeIconStateAppearance } from '../../../nodes/components/nodeIconAppearanceSettings';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import type { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

type PreviewRow = {
  child?: boolean;
  kind: EditableIconKind;
  state: NodeTreeRowIconState;
  title: string;
};

const PREVIEW_ROWS: PreviewRow[] = [
  { kind: 'reading', state: 'pending', title: 'Topic pending' },
  { child: true, kind: 'review', state: 'pending', title: 'Item pending' },
  { kind: 'reading', state: 'scheduled', title: 'Topic scheduled' },
  { child: true, kind: 'review', state: 'scheduled', title: 'Item scheduled' },
  { kind: 'reading', state: 'dismissed', title: 'Topic dismissed' }
];

function resolvePreviewRowStyle(row: PreviewRow, state?: ReturnType<typeof useNodeIconSettingsState>) {
  const appearance = state?.stateStyles?.[row.state]?.[row.kind] ?? getNodeIconStateAppearance(row.state, row.kind);
  if (row.state !== 'dismissed' || !appearance.fadeEnabled) return undefined;
  return { '--node-muted-opacity': appearance.fadeTextOpacity } as CSSProperties;
}

export function NodeIconSettingsPreview(props: { state?: ReturnType<typeof useNodeIconSettingsState> }) {
  return (
    <aside className="bg-settings-control/25 px-5 py-6 max-[900px]:hidden">
      <div className="grid gap-0.5">
        {PREVIEW_ROWS.map((row) => (
          <div
            className={[
              'grid min-h-7 grid-cols-[1rem_minmax(0,1fr)] items-center gap-1.5 rounded-sm px-2 text-sm leading-5',
              row.child ? 'ml-7' : '',
              row.state === 'dismissed' ? 'text-foreground/62' : 'text-foreground/72'
            ].join(' ')}
            key={`${row.kind}-${row.state}`}
            style={resolvePreviewRowStyle(row, props.state)}
          >
            <NodeTreeRowIcon kind={row.kind} state={row.state} />
            <span className="truncate text-sm" style={row.state === 'dismissed' ? { opacity: 'var(--node-muted-opacity, 1)' } : undefined}>{row.title}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
