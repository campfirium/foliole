import type { NativeReadwiseDetectionSample } from '../../../lib/platform/nativeReadwiseContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

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
      <mark className="rounded-md bg-[var(--app-highlight-surface-color)] px-0.5 text-foreground">{props.excerpt.slice(matchRange.start, matchRange.end)}</mark>
      {props.excerpt.slice(matchRange.end)}
    </span>
  );
}

export function ReadwisePreviewSampleList(props: {
  hasGap: boolean;
  maxSamples?: number;
  samples: NativeReadwiseDetectionSample[];
  showGap?: boolean;
  showSourceName?: boolean;
  sourceName: string;
}) {
  const t = useTranslation();
  const maxSamples = props.maxSamples ?? props.samples.length;
  const visibleSamples = props.samples.slice(0, maxSamples);
  const showSourceName = props.showSourceName ?? true;
  const showGap = props.showGap ?? true;

  return (
    <section className="mt-3">
      {showSourceName ? <p className="text-sm font-semibold text-foreground">{props.sourceName}</p> : null}
      <div className="mt-3 space-y-3">
        {visibleSamples.map((sample, index) => (
          <blockquote className="border-l border-border/80 pl-4" key={`${sample.sourceName}-${index}`}>
            <p className="text-sm leading-6 text-foreground/80">
              {sample.matched ? (
                <HighlightedExcerpt excerpt={sample.excerpt} highlightText={sample.highlightText} />
              ) : (
                <span>{sample.highlightText}</span>
              )}
            </p>
            {!sample.matched ? (
              <p className="mt-2 text-sm text-amber-700">{t('desktop.readwise.previewSample.highlightMissing')}</p>
            ) : null}
            {showGap && props.hasGap && index === 1 ? <p className="pt-3 text-center text-sm text-foreground/45">...</p> : null}
          </blockquote>
        ))}
      </div>
    </section>
  );
}
