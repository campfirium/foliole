import type { AideAttachedContextItemKey, AideAttachedContextSettings } from './aideAttachedContextSettings.js';
import { estimateAideTokens, splitAideSentences, truncateAideTextAtSentence } from './aideTokenEstimate.js';

export interface AideContextUnit {
  // Atomic units (outline lines, paths) are never cut; other units are cut at a sentence end.
  atomic?: boolean;
  // Dedupe units are dropped or trimmed when their sentences are already attached elsewhere.
  dedupe?: boolean;
  label?: string;
  partial?: boolean;
  // Display order; units are taken in array order (priority) but shown by rank when given.
  rank?: number;
  text: string;
}

export type AideContextCandidates = Partial<Record<AideAttachedContextItemKey, AideContextUnit[]>>;

export interface AideAllocatedContextItem {
  key: AideAttachedContextItemKey;
  tokens: number;
  truncated: boolean;
  units: AideContextUnit[];
}

interface Take {
  tokens: number;
  truncated: boolean;
  units: AideContextUnit[];
}

interface Slot {
  allowance: number;
  key: AideAttachedContextItemKey;
  taken: Take;
  units: AideContextUnit[];
}

const MIN_DEDUPE_SENTENCE_LENGTH = 12;

export function allocateAideAttachedContext(
  candidates: AideContextCandidates,
  settings: AideAttachedContextSettings
): AideAllocatedContextItem[] {
  const total = settings.totalBudget;
  const slots: Slot[] = settings.items.flatMap((item) => {
    const units = candidates[item.key]?.filter((unit) => unit.text.trim()) ?? [];
    return item.enabled && units.length
      ? [{ allowance: item.limit, key: item.key, taken: { tokens: 0, truncated: false, units: [] }, units }]
      : [];
  });
  let remaining = total;
  for (const slot of slots) {
    slot.allowance = Math.min(slot.allowance, remaining);
    slot.taken = takeUnits(slot.units, slot.allowance);
    remaining -= slot.taken.tokens;
  }
  fillRemaining(slots, total);
  dedupeSlots(slots);
  fillRemaining(slots, total);
  return slots.filter((slot) => slot.taken.units.length).map((slot) => ({
    key: slot.key,
    tokens: slot.taken.tokens,
    truncated: slot.taken.truncated,
    units: sortForDisplay(slot.taken.units)
  }));
}

export function renderAideContextUnit(unit: AideContextUnit) {
  return `${unit.label ?? ''}${unit.text}`;
}

function fillRemaining(slots: Slot[], total: number) {
  for (const slot of slots) {
    if (!slot.taken.truncated) continue;
    const remaining = total - slots.reduce((sum, item) => sum + item.taken.tokens, 0);
    if (remaining <= 0) return;
    slot.allowance = slot.taken.tokens + remaining;
    slot.taken = takeUnits(slot.units, slot.allowance);
  }
}

function takeUnits(units: AideContextUnit[], allowance: number): Take {
  const taken: AideContextUnit[] = [];
  let tokens = 0;
  for (const unit of units) {
    const cost = estimateAideTokens(renderAideContextUnit(unit));
    if (tokens + cost <= allowance) {
      taken.push(unit);
      tokens += cost;
      continue;
    }
    if (!unit.atomic) {
      const labelCost = unit.label ? estimateAideTokens(unit.label) : 0;
      const text = truncateAideTextAtSentence(unit.text, allowance - tokens - labelCost);
      if (text) {
        const part = { ...unit, partial: true, text };
        taken.push(part);
        tokens += estimateAideTokens(renderAideContextUnit(part));
      }
    }
    return { tokens, truncated: true, units: taken };
  }
  return { tokens, truncated: false, units: taken };
}

function dedupeSlots(slots: Slot[]) {
  let corpus = slots
    .flatMap((slot) => slot.taken.units.filter((unit) => !unit.dedupe).map((unit) => normalize(unit.text)))
    .join('\n');
  for (const slot of slots) {
    if (!slot.units.some((unit) => unit.dedupe)) continue;
    const units: AideContextUnit[] = [];
    for (const unit of slot.units) {
      if (!unit.dedupe) {
        units.push(unit);
        continue;
      }
      const kept = splitAideSentences(unit.text).filter((sentence) => !isAttached(sentence, corpus));
      if (!kept.length) continue;
      const text = kept.join('').trim();
      units.push({ ...unit, text });
      corpus += `\n${normalize(text)}`;
    }
    slot.units = units;
    slot.taken = takeUnits(units, slot.allowance);
  }
}

function isAttached(sentence: string, corpus: string) {
  const value = normalize(sentence);
  return value.length >= MIN_DEDUPE_SENTENCE_LENGTH && corpus.includes(value);
}

function normalize(text: string) {
  return text.toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function sortForDisplay(units: AideContextUnit[]) {
  if (!units.some((unit) => typeof unit.rank === 'number')) return units;
  return [...units].sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
}
