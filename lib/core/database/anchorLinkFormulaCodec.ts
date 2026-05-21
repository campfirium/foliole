export interface FormulaStoredAnchorLocator {
  display: 'block' | 'inline';
  fallbackRect: FormulaStoredRegionRect;
  formulaSource: string;
  kind: 'formula-region';
  occurrenceKey: string;
  selection: {
    algorithm: 'katex-dom-leaf-v1';
    fallbackRect: FormulaStoredRegionRect;
    leaves: Array<{
      path: number[];
      structureFingerprint: string;
      textFingerprint: string;
    }>;
  };
}

interface FormulaStoredRegionRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseRatioRect(value: unknown): FormulaStoredRegionRect | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !isFiniteNumber((value as { x?: unknown }).x) ||
    !isFiniteNumber((value as { y?: unknown }).y) ||
    !isFiniteNumber((value as { width?: unknown }).width) ||
    !isFiniteNumber((value as { height?: unknown }).height) ||
    (value as { width: number }).width <= 0 ||
    (value as { height: number }).height <= 0
  ) {
    return null;
  }
  return {
    height: clampRatio((value as { height: number }).height),
    width: clampRatio((value as { width: number }).width),
    x: clampRatio((value as { x: number }).x),
    y: clampRatio((value as { y: number }).y)
  };
}

function parseFormulaSelection(value: unknown): FormulaStoredAnchorLocator['selection'] | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const selection = value as { algorithm?: unknown; fallbackRect?: unknown; leaves?: unknown };
  const fallbackRect = parseRatioRect(selection.fallbackRect);
  if (selection.algorithm !== 'katex-dom-leaf-v1' || !fallbackRect || !Array.isArray(selection.leaves)) {
    return null;
  }
  const leaves = selection.leaves
    .map(parseFormulaSelectionLeaf)
    .filter((leaf): leaf is NonNullable<ReturnType<typeof parseFormulaSelectionLeaf>> => leaf !== null);
  if (leaves.length === 0 || leaves.length !== selection.leaves.length) {
    return null;
  }
  return {
    algorithm: 'katex-dom-leaf-v1',
    fallbackRect,
    leaves
  };
}

function parseFormulaSelectionLeaf(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const leaf = value as { path?: unknown; structureFingerprint?: unknown; textFingerprint?: unknown };
  if (
    !Array.isArray(leaf.path) ||
    !leaf.path.every((part) => Number.isInteger(part) && part >= 0) ||
    typeof leaf.structureFingerprint !== 'string' ||
    typeof leaf.textFingerprint !== 'string'
  ) {
    return null;
  }
  return {
    path: leaf.path,
    structureFingerprint: leaf.structureFingerprint,
    textFingerprint: leaf.textFingerprint
  };
}

export function parseFormulaLocator(
  locator:
    | {
        display?: unknown;
        fallbackRect?: unknown;
        formulaSource?: unknown;
        kind?: unknown;
        occurrenceKey?: unknown;
        selection?: unknown;
      }
    | undefined
): FormulaStoredAnchorLocator | undefined {
  if (
    !locator ||
    locator.kind !== 'formula-region' ||
    (locator.display !== 'block' && locator.display !== 'inline') ||
    typeof locator.formulaSource !== 'string' ||
    locator.formulaSource.trim().length === 0 ||
    typeof locator.occurrenceKey !== 'string' ||
    locator.occurrenceKey.trim().length === 0
  ) {
    return undefined;
  }
  const fallbackRect = parseRatioRect(locator.fallbackRect);
  const selection = parseFormulaSelection(locator.selection);
  if (!fallbackRect || !selection) {
    return undefined;
  }
  return {
    display: locator.display,
    fallbackRect,
    formulaSource: locator.formulaSource,
    kind: 'formula-region',
    occurrenceKey: locator.occurrenceKey,
    selection
  };
}
