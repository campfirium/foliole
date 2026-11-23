import { renderAideContextUnit, type AideAllocatedContextItem } from './aideAttachedContextAllocation.js';
import type { AideAttachedContextItemKey } from './aideAttachedContextSettings.js';

const SECTION_TITLES: Record<AideAttachedContextItemKey, string> = {
  annotations: 'Related notes, excerpts and Items',
  location: 'Folder path, indexes and Dives',
  metadata: 'Metadata',
  outline: 'Outline',
  selection: 'Selected content',
  surrounding: 'Surrounding source text'
};

export const AIDE_ATTACHED_CONTEXT_MORE_MARKER = '[… more follows]';

export function formatAideAttachedContext(input: {
  items: AideAllocatedContextItem[];
  materialId: string;
  title: string;
}) {
  if (!input.items.length) return '';
  const lines = [
    `Attached Foliole context for ${JSON.stringify(input.title)} (id=${input.materialId}).`,
    'It is attached once when the material is linked; read the material with tools when more is needed.'
  ];
  for (const item of input.items) {
    lines.push('', `[${SECTION_TITLES[item.key]}]`, ...item.units.map(renderAideContextUnit));
    if (item.truncated) lines.push(AIDE_ATTACHED_CONTEXT_MORE_MARKER);
  }
  return lines.join('\n');
}
