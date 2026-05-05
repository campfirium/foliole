export function clampEditorPosition(position: number, documentLength: number) {
  return Math.max(0, Math.min(position, documentLength));
}
