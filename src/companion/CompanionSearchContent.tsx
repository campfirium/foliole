import { useState } from 'react';

export function CompanionSearchContent() {
  const [query, setQuery] = useState('');

  return (
    <section className="px-1 py-4">
      <label className="block">
        <span className="sr-only">Search topics</span>
        <input
          className="h-12 w-full rounded-md border border-border bg-canvas px-4 text-base text-foreground outline-none transition placeholder:text-companion-text-secondary focus:border-border-strong"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topics"
          type="search"
          value={query}
        />
      </label>
      <div className="mt-6 border-t border-companion-divider py-5">
        <h2 className="text-base font-medium text-foreground">Results</h2>
        <p className="mt-2 text-sm leading-6 text-companion-text-secondary">
          Search results are not connected on this device yet.
        </p>
      </div>
      <div className="border-t border-companion-divider py-5">
        <h2 className="text-base font-medium text-foreground">Explore later</h2>
        <p className="mt-2 text-sm leading-6 text-companion-text-secondary">
          Filters and recent searches will appear here after the search model is connected.
        </p>
      </div>
    </section>
  );
}
