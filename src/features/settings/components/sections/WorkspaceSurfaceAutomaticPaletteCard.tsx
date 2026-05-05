import { cn } from '@/shared/lib/utils';

function AutomaticPalettePreview(props: { palette: string[] }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className="block h-9 w-9 rounded-sm border border-border/40"
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function WorkspaceSurfaceAutomaticPaletteCard(props: {
  activeMode: string | null;
  onClick: () => void;
  palette: string[];
}) {
  return (
    <button
      aria-label="Apply automatic palette"
      className={cn(
        'min-w-0 rounded-sm border p-1 transition-colors',
        props.activeMode === 'automatic'
          ? 'border-border-strong/75 bg-foreground/[0.04]'
          : 'border-transparent hover:border-border/45 hover:bg-foreground/[0.02]'
      )}
      onClick={props.onClick}
      type="button"
    >
      <AutomaticPalettePreview palette={props.palette} />
    </button>
  );
}
