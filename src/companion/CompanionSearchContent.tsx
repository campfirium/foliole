import { useState } from 'react';

import { AppEmptyState } from '../shared/ui';

export function CompanionSearchContent() {
  const [query, setQuery] = useState('');

  return (
    <section className="px-1 py-4">
      <label className="block">
        <span className="sr-only">Search topics</span>
        <input
          className="h-12 w-full rounded-md border border-border bg-canvas px-4 text-base text-foreground outline-none transition placeholder:text-companion-text-secondary focus:border-border-strong"
          disabled
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topics - coming soon"
          type="search"
          value={query}
        />
      </label>
      <div className="mt-6 border-t border-companion-divider py-5">
        <AppEmptyState
          className="min-h-0 items-start py-1 text-left text-companion-text-secondary"
          description="Topic search is not available on this device yet."
          title="Search is coming soon"
        />
      </div>
    </section>
  );
}
