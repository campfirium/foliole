export type ImportSourceAction = 'delete' | 'keep' | 'move';

export const importActionOptions = [
  { label: 'Keep', value: 'keep' },
  { label: 'Delete', value: 'delete' },
  { label: 'Move', value: 'move' }
] as const;

export function normalizeImportSourceAction(value: unknown, fallback: ImportSourceAction) {
  return value === 'delete' || value === 'move' || value === 'keep' ? value : fallback;
}
