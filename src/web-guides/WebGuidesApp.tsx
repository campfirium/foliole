import { canonicalGuidePath, DEFAULT_WEB_GUIDE, WEB_GUIDES, type WebGuideSeed } from './webGuidesContent';

export function resolveWebGuideFromPath(pathname: string, guides: WebGuideSeed[] = WEB_GUIDES) {
  return requireWebGuide(guides.find((guide) => canonicalGuidePath(guide.slug) === pathname) ?? guides[0] ?? DEFAULT_WEB_GUIDE);
}

function requireWebGuide(guide: WebGuideSeed | undefined) {
  if (!guide) {
    throw new Error('Web guides require at least one guide.');
  }
  return guide;
}

export function WebGuidesApp() {
  const defaultGuide = requireWebGuide(DEFAULT_WEB_GUIDE);
  const pathname = typeof window === 'undefined' ? canonicalGuidePath(defaultGuide.slug) : window.location.pathname;
  const guide = resolveWebGuideFromPath(pathname);

  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl grid-cols-1 overflow-hidden border border-border bg-canvas lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-border bg-bg-panel px-5 py-5 lg:border-b-0 lg:border-r">
          <p className="m-0 text-ui-sm font-medium text-foreground/55">Foliole Guides</p>
          <nav aria-label="Guides" className="mt-5 flex flex-col gap-2">
            {WEB_GUIDES.map((item) => {
              const selected = item.slug === guide.slug;
              return (
                <a
                  aria-current={selected ? 'page' : undefined}
                  className={[
                    'block rounded-md border px-3 py-3 text-left no-underline transition-colors',
                    selected
                      ? 'border-border-strong bg-canvas text-foreground'
                      : 'border-transparent text-foreground/70 hover:border-border hover:bg-bg-subtle hover:text-foreground'
                  ].join(' ')}
                  href={canonicalGuidePath(item.slug)}
                  key={item.slug}
                >
                  <span className="block text-ui-md font-medium">{item.title}</span>
                  <span className="mt-1 block text-ui-sm leading-5 text-foreground/56">{item.description}</span>
                </a>
              );
            })}
          </nav>
        </aside>
        <article className="flex min-w-0 flex-col">
          <header className="border-b border-border px-6 py-6 sm:px-8">
            <p className="m-0 text-ui-sm font-medium text-foreground/55">Guide</p>
            <h1 className="m-0 mt-2 text-ui-xl font-semibold">{guide.title}</h1>
            <p className="m-0 mt-3 max-w-2xl text-ui-lg text-foreground/64">{guide.description}</p>
          </header>
          <div className="flex flex-1 flex-col gap-8 px-6 py-8 sm:px-8 sm:py-10">
            <p className="m-0 max-w-2xl text-reading-lg font-medium leading-relaxed">{guide.summary}</p>
            {guide.sections.map((section) => (
              <section className="max-w-3xl border-t border-border pt-6" key={section.heading}>
                <h2 className="m-0 text-ui-lg font-semibold">{section.heading}</h2>
                <div className="mt-3 flex flex-col gap-3">
                  {section.body.map((paragraph) => (
                    <p className="m-0 text-reading-base leading-relaxed text-foreground/72" key={paragraph}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
