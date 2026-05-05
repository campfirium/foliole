const DIRECTORY_GROUPS = [
  { detail: 'Synced source topics and derived topics from this workspace.', title: 'Internal topics' },
  { detail: 'Folder-shaped views will appear here after the directory model is connected.', title: 'Virtual folders' },
  { detail: 'External documents synced to this device will be grouped here.', title: 'External documents' },
  { detail: 'Top-level workspace topics and folders.', title: 'Root' }
];

export function CompanionDirectoryContent() {
  return (
    <section className="px-1 py-4">
      <div className="divide-y divide-companion-divider border-y border-companion-divider">
        {DIRECTORY_GROUPS.map((group) => (
          <div className="py-4" key={group.title}>
            <h2 className="text-base font-medium text-foreground">{group.title}</h2>
            <p className="mt-1 text-sm leading-6 text-companion-text-secondary">{group.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
