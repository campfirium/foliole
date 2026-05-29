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
    <aside className="bg-settings-control/30 px-4 py-6 max-[900px]:hidden">
      <div className="grid gap-1">
        {PREVIEW_ROWS.map((row) => (
          <div
            className={[
              'grid min-h-9 grid-cols-[1.4rem_minmax(0,1fr)] items-center gap-2 rounded-sm px-2',
              row.child ? 'pl-8' : '',
              row.active ? 'bg-settings-selected text-foreground shadow-[inset_2px_0_0_rgb(var(--color-foreground)_/_0.32)]' : 'text-foreground/58'
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
