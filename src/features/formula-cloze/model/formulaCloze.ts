import type { FormulaAnchorLocator, FormulaDomSelectionDescriptor, Node, NodeAnchorLink } from '../../nodes/model/nodeTypes';
import { isFormulaAnchorLocator } from '../../nodes/model/nodeTypes';

export interface FormulaClozeCreatePayload {
  display: 'block' | 'inline';
  formulaRange: {
    from: number;
    to: number;
  };
  formulaSource: string;
  occurrenceKey: string;
  selection: FormulaDomSelectionDescriptor;
}

export interface FormulaClozeSourcePayload {
  promptContent: string;
  revealContent: string;
}

export interface FormulaClozePresentationRegion {
  display: 'block' | 'inline';
  fallbackRect: FormulaAnchorLocator['fallbackRect'];
  formulaSource: string;
  id: string;
  occurrenceKey: string;
  selection: FormulaDomSelectionDescriptor;
}

/** Desktop nodes and mobile snapshot nodes store anchor links with differently typed locators; only the shape is checked. */
type FormulaClozeAnchorSource = { id: string; kind: string; locator?: unknown } | null | undefined;

function isFormulaClozeAnchorLink(
  anchorLink: FormulaClozeAnchorSource
): anchorLink is { id: string; kind: 'cloze'; locator: FormulaAnchorLocator } {
  return anchorLink?.kind === 'cloze' && isFormulaAnchorLocator(anchorLink.locator as NodeAnchorLink['locator']);
}

export function getFormulaClozeLocator(anchorLink: FormulaClozeAnchorSource): FormulaAnchorLocator | null {
  return isFormulaClozeAnchorLink(anchorLink) ? anchorLink.locator : null;
}

export function isFormulaClozeNode(node: Pick<Node, 'anchorLink'> | null | undefined) {
  return Boolean(node && isFormulaClozeAnchorLink(node.anchorLink));
}

/** Identifies one formula in its source document; desktop and mobile creation must agree on it. */
export function buildFormulaOccurrenceKey(range: { display: 'block' | 'inline'; from: number; tex: string; to: number }) {
  return `${range.display}:${range.from}:${range.to}:${range.tex}`;
}

export function deriveFormulaClozeSelectionLabel(selection: FormulaDomSelectionDescriptor) {
  return selection.leaves
    .map((leaf) => leaf.textFingerprint.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function buildFormulaClozeSourcePayload(
  source: string,
  range: { from: number; to: number }
): FormulaClozeSourcePayload | null {
  if (range.from < 0 || range.to <= range.from || range.to > source.length) {
    return null;
  }
  const formulaSource = source.slice(range.from, range.to).trim();
  if (!formulaSource) {
    return null;
  }
  return {
    promptContent: formulaSource,
    revealContent: formulaSource
  };
}

export function createFormulaClozePresentationRegion(anchorLink: FormulaClozeAnchorSource): FormulaClozePresentationRegion | null {
  if (!isFormulaClozeAnchorLink(anchorLink)) return null;
  const locator = anchorLink.locator;
  return {
    display: locator.display,
    fallbackRect: locator.fallbackRect,
    formulaSource: locator.formulaSource,
    id: anchorLink.id,
    occurrenceKey: locator.occurrenceKey,
    selection: locator.selection
  };
}

export function deriveFormulaClozeRegionsFromChildren(args: {
  nodeId: string;
  nodesById: Record<string, { anchorLink?: FormulaClozeAnchorSource; id: string; parentNodeId?: string | null }>;
  trashedNodeIds: string[];
}) {
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return Object.values(args.nodesById)
    .filter((node) => node.parentNodeId === args.nodeId && !trashedNodeIds.has(node.id))
    .map((node) => node.anchorLink ? createFormulaClozePresentationRegion(node.anchorLink) : null)
    .filter((region): region is FormulaClozePresentationRegion => region !== null);
}
