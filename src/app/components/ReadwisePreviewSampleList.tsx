import type { NativeReadwiseDetectionSample } from '../../../lib/platform/nativeReadwiseContract';

function splitExcerpt(excerpt: string, highlightText: string) {
  if (!excerpt || !highlightText) {
    return null;
  }
  const matchIndex = excerpt.toLocaleLowerCase().indexOf(highlightText.toLocaleLowerCase());
  if (matchIndex < 0) {
    return null;
  }
  return {
    end: matchIndex + highlightText.length,
    start: matchIndex
  };
}

function HighlightedExcerpt(props: { excerpt: string; highlightText: string }) {
  const matchRange = splitExcerpt(props.excerpt, props.highlightText);
  if (!matchRange) {
    return <span>{props.excerpt || props.highlightText}</span>;
  }

  return (
    <span>
      {props.excerpt.slice(0, matchRange.start)}
      <mark className="rounded-sm bg-emerald-100 px-0.5 text-foreground">{props.excerpt.slice(matchRange.start, matchRange.end)}</mark>
      {props.excerpt.slice(matchRange.end)}
    </span>
  );
}

export function ReadwisePreviewSampleList(props: {
  hasGap: boolean;
  samples: NativeReadwiseDetectionSample[];
  sourceName: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated px-3 py-3">
      <p className="text-sm font-semibold text-foreground">{props.sourceName}</p>
      <div className="mt-3 space-y-3">
        {props.samples.map((sample, index) => (
          <div className="rounded-lg border border-border/70 bg-bg-panel px-3 py-3" key={`${sample.sourceName}-${index}`}>
            <p className="text-sm leading-6 text-foreground/80">
              {sample.matched ? (
                <HighlightedExcerpt excerpt={sample.excerpt} highlightText={sample.highlightText} />
              ) : (
                <span>{sample.highlightText}</span>
              )}
            </p>
            {!sample.matched ? (
              <p className="mt-2 text-sm text-amber-700">This highlight was not found in the article body.</p>
            ) : null}
            {props.hasGap && index === 1 ? <p className="pt-3 text-center text-sm text-foreground/45">...</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
