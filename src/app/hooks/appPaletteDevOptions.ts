export function resolveDevPaletteOptions() {
  return {
    canToggleDevTools: import.meta.env.DEV,
    canToggleDevReviewStatusBarPersistence: import.meta.env.DEV
  };
}
