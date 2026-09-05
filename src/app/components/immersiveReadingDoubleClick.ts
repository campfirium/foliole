export function resolveImmersiveDoubleClickEditHandler<T>(
  handler: T | undefined,
  enabled: boolean
) {
  return enabled ? handler : undefined;
}
