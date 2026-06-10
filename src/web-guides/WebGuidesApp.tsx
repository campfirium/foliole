import { DEFAULT_WEB_GUIDE } from './webGuidesContent';

export function WebGuidesApp() {
  const guide = DEFAULT_WEB_GUIDE;

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <article className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col border border-border bg-canvas">
        <header className="border-b border-border px-6 py-4">
          <p className="m-0 text-ui-sm font-medium text-foreground/55">Foliole</p>
          <h1 className="m-0 mt-2 text-ui-xl font-semibold">{guide.title}</h1>
          <p className="m-0 mt-3 max-w-2xl text-ui-lg text-foreground/64">{guide.description}</p>
        </header>
        <div className="flex flex-1 flex-col gap-8 px-6 py-10">
          <p className="m-0 max-w-2xl text-reading-lg font-medium leading-relaxed">{guide.summary}</p>
          {guide.sections.map((section) => (
            <section className="max-w-3xl border-t border-border pt-6" key={section.heading}>
              <h2 className="m-0 text-ui-lg font-semibold">{section.heading}</h2>
              <div className="mt-3 flex flex-col gap-3">
                {section.body.map((paragraph) => (
                  <p className="m-0 text-ui-base leading-relaxed text-foreground/72" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
