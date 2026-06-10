import { appFloatingStateSurfaceClassName } from '../../../shared/ui';

export function renderDeleteStatusOverlay(deleteStatusLabel: string | null) {
  if (!deleteStatusLabel) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-auto absolute inset-0 z-surface flex items-start bg-[var(--app-floating-overlay-bg)] p-3 backdrop-blur-[1px]"
    >
      <div className={appFloatingStateSurfaceClassName('px-3 py-2 text-ui-md font-medium text-foreground')}>
        {deleteStatusLabel}
      </div>
    </div>
  );
}
