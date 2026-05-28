export type ReviewActionSurface = 'panel' | 'overlay';

export function overlayDividerClass(surface: ReviewActionSurface) {
  return surface === 'overlay'
    ? 'gap-0 border-0 [&_button]:!rounded-none [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!shadow-none'
    : '';
}
