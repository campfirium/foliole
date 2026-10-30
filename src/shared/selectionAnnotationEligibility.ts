export function canCreateSelectionAnnotation(node: { kind: string } | null | undefined) {
  return Boolean(node) && node?.kind !== 'item';
}
