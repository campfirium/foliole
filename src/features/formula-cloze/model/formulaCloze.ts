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

export function isFormulaClozeAnchorLink(
  anchorLink: NodeAnchorLink | null | undefined
): anchorLink is NodeAnchorLink & { locator: FormulaAnchorLocator } {
  return anchorLink?.kind === 'cloze' && isFormulaAnchorLocator(anchorLink.locator);
}

export function getFormulaClozeLocator(anchorLink: NodeAnchorLink | null | undefined): FormulaAnchorLocator | null {
  return isFormulaClozeAnchorLink(anchorLink) ? anchorLink.locator : null;
}

export function isFormulaClozeNode(node: Node | null | undefined) {
  return Boolean(node && isFormulaClozeAnchorLink(node.anchorLink));
}

export function buildFormulaClozeSourcePayload(source: string, range: { from: number; to: number }): FormulaClozeSourcePayload | null {
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

export function createFormulaClozePresentationRegion(anchorLink: NodeAnchorLink): FormulaClozePresentationRegion | null {
  const locator = getFormulaClozeLocator(anchorLink);
  if (!locator) return null;
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
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return Object.values(args.nodesById)
    .filter((node) => node.parentNodeId === args.nodeId && !trashedNodeIds.has(node.id))
    .map((node) => node.anchorLink ? createFormulaClozePresentationRegion(node.anchorLink) : null)
    .filter((region): region is FormulaClozePresentationRegion => region !== null);
}
