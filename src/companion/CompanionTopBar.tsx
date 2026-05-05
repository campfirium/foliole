import { ChevronLeft } from 'lucide-react';

export function CompanionTopBar(props: {
  backLabel?: string;
  onBack?: () => void;
  title: string;
  visible: boolean;
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 -mx-6 bg-companion-base/95 px-6 pb-3 pt-4 backdrop-blur sm:-mx-7 sm:px-7">
      {props.onBack ? (
        <button
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-companion-text-secondary transition hover:text-foreground"
          onClick={props.onBack}
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
          {props.backLabel ?? 'Back'}
        </button>
      ) : null}
      <h1 className="text-2xl font-semibold leading-tight text-foreground">{props.title}</h1>
    </header>
  );
}
