export type ImportSourceAction = 'delete' | 'keep';

export const importActionOptions = [
  { label: 'Keep', value: 'keep' },
  { label: 'Delete', value: 'delete' }
] as const;

export function normalizeImportSourceAction(value: unknown, fallback: ImportSourceAction) {
  return value === 'delete' || value === 'keep' ? value : fallback;
}
