export function AnnotationToolbarButton(props: {
  children: JSX.Element;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      className="flex size-8 items-center justify-center rounded-sm text-foreground/72 transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-selection-blue/40"
      onClick={props.onClick}
      onPointerDown={(event) => event.preventDefault()}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}
