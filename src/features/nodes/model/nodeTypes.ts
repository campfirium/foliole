import type { PdfAnchorLocator, PdfMultiPageAnchorLocator } from '../../../../lib/core/anchors/pdfAnchorLocator';
export { getPdfAnchorLocators } from '../../../../lib/core/anchors/pdfAnchorLocator';
export type { PdfAnchorLocator, PdfSelectionLocator } from '../../../../lib/core/anchors/pdfAnchorLocator';
import type { NodeResourceReference } from '../../../../lib/core/database/nodeResourceReferences';
import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';
import type { VirtualNodeFilter } from '../../../../lib/core/nodes/virtualNodeFilter';
import type { ReadingState } from '../../../../lib/core/review/readingState';

export interface NodeReviewProfile {
  due: string;
  lastReviewAt: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

export interface NodeReadingProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: ReadingState;
}

export interface ImageAnchorLocator {
  attachmentId: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FormulaRegionRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FormulaDomSelectionLeaf {
  path: number[];
  structureFingerprint: string;
  textFingerprint: string;
}

export interface FormulaDomSelectionDescriptor {
  algorithm: 'katex-dom-leaf-v1';
  fallbackRect: FormulaRegionRect;
  leaves: FormulaDomSelectionLeaf[];
}

export interface FormulaAnchorLocator {
  display: 'block' | 'inline';
  fallbackRect: FormulaRegionRect;
  formulaSource: string;
  kind: 'formula-region';
  occurrenceKey: string;
  selection: FormulaDomSelectionDescriptor;
}

export interface TextAnchorLocator {
  from: number;
  originalText: string;
  to: number;
}

interface TextAnchorLocatorGroup {
  ranges: TextAnchorLocator[];
}

interface NodeImageRegion {
  id: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface NodeImageRegionGroup {
  attachmentId: string;
  regions: NodeImageRegion[];
}

export interface NodeAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze' | 'image-excerpt';
  locator?: PdfMultiPageAnchorLocator | PdfAnchorLocator | ImageAnchorLocator | FormulaAnchorLocator | TextAnchorLocator | TextAnchorLocatorGroup;
}

export type NodeSpecialKind = 'home' | 'inbox' | 'trash' | 'virtual-root' | 'virtual';

interface NodeAttachment {
  attachmentId: string;
  mimeType: string | null;
  originalName: string | null;
  role: string;
}

export interface Node {
  authorText?: string | null;
  id: string;
  parentNodeId: string | null;
  kind: NodeKind;
  priority?: number | null;
  desiredRetention?: number | null;
  enableShortTerm?: boolean | null;
  sequentialReadingEnabled?: boolean | null;
  shelvedAt?: string | null;
  initialReviewDue?: string | null;
  specialKind?: NodeSpecialKind;
  title: string;
  isTitleManual?: boolean;
  hideTitleHeading?: boolean;
  manualChildOrder?: string[] | null;
  collections?: string[];
  attachments?: NodeAttachment[];
  bodyBlobHash?: string | null;
  hasContent?: boolean;
  hasReveal?: boolean;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  openingText?: string | null;
  content: string;
  currentVersionId?: string | null;
  virtualFilter?: VirtualNodeFilter | null;
  anchorLink?: NodeAnchorLink | null;
  imageRegions?: NodeImageRegionGroup[] | null;
  imageSources?: Record<string, string> | null;
  resourceReferences?: NodeResourceReference[];
  contentEditBaseContent?: string;
  pendingImageReferences?: readonly import('../../../../lib/core/sync/localContentEditResources').ContentImageReference[];
  reveal: string | null;
  reading?: NodeReadingProfile | null;
  review: NodeReviewProfile | null;
  createdAt: string;
  deletedAt?: string | null;
  updatedAt: string;
}

export function isTextAnchorLocator(locator: unknown): locator is TextAnchorLocator {
  return Boolean(
    locator && typeof locator === 'object' &&
      !('ranges' in locator) &&
      'from' in locator &&
      'to' in locator &&
      typeof locator.from === 'number' &&
      Number.isInteger(locator.from) &&
      locator.from >= 0 &&
      typeof locator.to === 'number' &&
      Number.isInteger(locator.to) &&
      locator.to >= locator.from &&
      'originalText' in locator && typeof locator.originalText === 'string'
  );
}

function isTextAnchorLocatorGroup(locator: unknown): locator is TextAnchorLocatorGroup {
  return Boolean(
    locator && typeof locator === 'object' &&
      'ranges' in locator &&
      Array.isArray(locator.ranges) &&
      locator.ranges.length > 1 &&
      locator.ranges.every((range) =>
        Boolean(
          range &&
            typeof range.from === 'number' &&
            Number.isInteger(range.from) &&
            range.from >= 0 &&
            typeof range.to === 'number' &&
            Number.isInteger(range.to) &&
            range.to >= range.from &&
            typeof range.originalText === 'string'
        )
      )
  );
}

export function isFormulaAnchorLocator(locator: NodeAnchorLink['locator'] | null | undefined): locator is FormulaAnchorLocator {
  return Boolean(
    locator &&
      'kind' in locator &&
      locator.kind === 'formula-region' &&
      'occurrenceKey' in locator &&
      typeof locator.occurrenceKey === 'string' &&
      locator.occurrenceKey.trim().length > 0
  );
}

export function getTextAnchorLocators(locator: unknown): TextAnchorLocator[] {
  if (isTextAnchorLocator(locator)) {
    return [locator];
  }
  if (isTextAnchorLocatorGroup(locator)) {
    return locator.ranges;
  }
  return [];
}

export { hasNodeContent, hasNodeReveal } from '../../../../lib/core/nodes/nodeContentFlags';
