import { MapMode, type Transaction } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';

interface ChangedRange { from: number; to: number; target: number; removed: string; inserted: string }
interface Relocation { from: number; to: number; target: number }

function lineWithoutBoundary(text: string, leading: boolean) {
  if (!(leading ? text.startsWith('\n') : text.endsWith('\n'))) return null;
  const line = leading ? text.slice(1) : text.slice(0, -1);
  return line.includes('\n') ? null : line;
}

function matchRelocation(deletion: ChangedRange, insertion: ChangedRange): Relocation | null {
  const leading = deletion.removed.startsWith('\n');
  const line = lineWithoutBoundary(deletion.removed, leading);
  if (line === null || line !== lineWithoutBoundary(insertion.inserted, !leading)) return null;
  const normalizedReplacement = insertion.from === deletion.to && insertion.target === deletion.target;
  if (deletion !== insertion && !normalizedReplacement
    && (leading ? insertion.from > deletion.from : insertion.from < deletion.to)) return null;
  return {
    from: deletion.from + (leading ? 1 : 0),
    to: deletion.to - (leading ? 0 : 1),
    target: insertion.target + (leading ? 0 : 1)
  };
}

function lineRelocations(transaction: Transaction) {
  // CodeMirror's line move swaps a selected block with one neighboring line.
  if (!transaction.isUserEvent('move.line')) return [];
  const ranges: ChangedRange[] = [];
  transaction.changes.iterChanges((from, to, target, _end, inserted) => {
    ranges.push({ from, to, target, removed: transaction.startState.doc.sliceString(from, to), inserted: inserted.toString() });
  }, true);
  const relocations: Relocation[] = [];
  for (let index = 0; index < ranges.length; index++) {
    const current = ranges[index]!, next = ranges[index + 1];
    let relocation = current.removed && current.inserted ? matchRelocation(current, current) : null;
    if (!relocation && next) {
      const deletion = current.removed && !current.inserted ? current : next.removed && !next.inserted ? next : null;
      const insertion = current.inserted && !current.removed ? current : next.inserted && !next.removed ? next : null;
      if (deletion && insertion) relocation = matchRelocation(deletion, insertion);
      if (relocation) index++;
    }
    if (relocation) relocations.push(relocation);
  }
  return relocations;
}

export function createOutlinePositionMapper(update: ViewUpdate) {
  let descriptions: Array<{ transaction: Transaction; relocations: Relocation[] }> | undefined;
  return (position: number): number | null => {
    descriptions ??= update.transactions.map(transaction => ({ transaction, relocations: lineRelocations(transaction) }));
    for (const { transaction, relocations } of descriptions) {
      const mapped = transaction.changes.mapPos(position, 1, MapMode.TrackAfter);
      if (mapped !== null) position = mapped;
      else {
        const relocation = relocations.find(range => position >= range.from && position < range.to);
        if (!relocation) return null;
        position = relocation.target + position - relocation.from;
      }
    }
    return position;
  };
}
