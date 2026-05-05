import { AppButton, AppStatusBadge, InspectorSection } from '../../shared/ui';

const importStatusItems = [
  {
    label: 'Last run',
    value: 'No imports yet'
  },
  {
    label: 'Inbox landing',
    value: 'Inbox is available in the node tree'
  },
  {
    label: 'Failures',
    value: 'Nothing recorded'
  }
] as const;

function EntryActionCard({
  title,
  description,
  actionLabel,
  disabled
}: {
  title: string;
  description: string;
  actionLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-panel px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-foreground/65">{description}</p>
        </div>
        <AppStatusBadge label={disabled ? 'Later' : 'Ready'} tone={disabled ? 'neutral' : 'info'} />
      </div>
      <AppButton className="mt-3 w-full justify-center" disabled={disabled} variant="primary">
        {actionLabel}
      </AppButton>
    </div>
  );
}

export function WorkspaceRightSidebarImportPanel() {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <InspectorSection
        description="Keep quick clipboard capture separate from file-based import so the future pipeline has a clear workspace entry."
        title="Import entry points"
      >
        <div className="flex flex-col gap-3">
          <EntryActionCard
            actionLabel="Quick capture stays in editor"
            description="Paste or create a node directly in the editor for immediate capture. This path stays lightweight and does not go through Import Manager."
            title="Quick capture"
          />
          <EntryActionCard
            actionLabel="Formal import coming soon"
            description="Use this surface as the visible hand-off point for file and adapter-based import. The full Import Manager and runtime pipeline land in follow-up tasks."
            disabled
            title="Formal import"
          />
        </div>
      </InspectorSection>
      <InspectorSection
        description="Reserve a stable place for upcoming batch status, failures, and Inbox landing feedback."
        title="Import status"
      >
        <dl className="space-y-3">
          {importStatusItems.map((item) => (
            <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3 last:border-b-0 last:pb-0" key={item.label}>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/45">{item.label}</dt>
              <dd className="text-right text-sm text-foreground/70">{item.value}</dd>
            </div>
          ))}
        </dl>
      </InspectorSection>
    </div>
  );
}
