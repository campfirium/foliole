import { AppEmptyState } from '../shared/ui';

export function CompanionOnlyReviewContent() {
  return (
    <section className="border-t border-companion-divider px-1 py-6">
      <AppEmptyState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description="Review-only filtering is not connected yet, so mixed learning cards stay hidden here for now."
        title="Only Review mode is coming soon"
      />
    </section>
  );
}
