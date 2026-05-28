import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

type PreviewRow = {
  active?: boolean;
  child?: boolean;
  kind: EditableIconKind;
  state: NodeTreeRowIconState;
  title: string;
};

const PREVIEW_ROWS: PreviewRow[] = [
  { kind: 'reading', state: 'pending', title: 'Topic pending' },
  { child: true, kind: 'review', state: 'pending', title: 'Item pending' },
  { active: true, kind: 'reading', state: 'scheduled', title: 'Topic scheduled' },
  { child: true, kind: 'review', state: 'scheduled', title: 'Item scheduled' },
  { kind: 'reading', state: 'dismissed', title: 'Topic dismissed' }
];

export function NodeIconSettingsPreview() {
  return (
    <aside className="border-l border-settings-divider/55 bg-settings-shell/45 p-5 max-[1120px]:border-l-0 max-[1120px]:border-t">
      <div className="overflow-hidden rounded-md border border-settings-control-border bg-settings-control/50">
        {PREVIEW_ROWS.map((row) => (
          <div
            className={[
              'grid min-h-14 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3 border-t border-settings-divider/45 px-3 first:border-t-0',
              row.child ? 'pl-10' : '',
              row.active ? 'bg-settings-control-active text-foreground shadow-[inset_3px_0_0_rgb(var(--app-accent-color-rgb))]' : 'text-foreground/68'
            ].join(' ')}
            key={`${row.kind}-${row.state}`}
          >
            <NodeTreeRowIcon kind={row.kind} preview state={row.state} />
            <span className="truncate text-sm">{row.title}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
