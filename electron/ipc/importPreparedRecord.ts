import type {
  ImportHighlightPolicy,
  ImportSourceKind,
  ImportSourceTrackingMode,
  PreparedImportRecord
} from '../../lib/core/import/contract.js';
import type {
  ImportContextPolicy,
  ImportSidecarHighlight,
  ImportSourceProfile
} from '../../lib/core/import/controlledContext.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import type { ImportNodeTitleStrategy } from '../../lib/core/import/importManagerSettings.js';

export function buildPreparedImportRecord(
  source: { filePath: string; kind: ImportSourceKind; sourceName: string },
  input: {
    content: string;
    contextPolicy?: ImportContextPolicy;
    degradedReason?: string | null;
    highlightSidecar?: ImportSidecarHighlight[];
    highlightPolicy?: ImportHighlightPolicy;
    hideTitleHeadingOverride?: boolean;
    importedAt: string;
    nodeTitleOverride?: string;
    sourceIdentity?: string;
    sourceLocator?: string;
    sourceProfile?: ImportSourceProfile;
    sourceTrackingMode?: ImportSourceTrackingMode;
    titleStrategy?: ImportNodeTitleStrategy;
  }
): PreparedImportRecord {
  return createPreparedDesktopTextImport({
    content: input.content,
    ...(input.contextPolicy === undefined ? {} : { contextPolicy: input.contextPolicy }),
    ...(input.degradedReason === undefined ? {} : { degradedReason: input.degradedReason }),
    fileName: source.sourceName,
    filePath: source.filePath,
    ...(input.highlightSidecar === undefined ? {} : { highlightSidecar: input.highlightSidecar }),
    ...(input.highlightPolicy === undefined ? {} : { highlightPolicy: input.highlightPolicy }),
    ...(input.hideTitleHeadingOverride === undefined ? {} : { hideTitleHeadingOverride: input.hideTitleHeadingOverride }),
    importedAt: input.importedAt,
    kind: source.kind,
    ...(input.nodeTitleOverride === undefined ? {} : { nodeTitleOverride: input.nodeTitleOverride }),
    ...(input.sourceIdentity === undefined ? {} : { sourceIdentity: input.sourceIdentity }),
    ...(input.sourceLocator === undefined ? {} : { sourceLocator: input.sourceLocator }),
    ...(input.sourceProfile === undefined ? {} : { sourceProfile: input.sourceProfile }),
    ...(input.sourceTrackingMode === undefined ? {} : { sourceTrackingMode: input.sourceTrackingMode }),
    ...(input.titleStrategy === undefined ? {} : { titleStrategy: input.titleStrategy })
  });
}

export interface LoadPreparedImportOptions {
  contextPolicy?: ImportContextPolicy;
  highlightSidecar?: ImportSidecarHighlight[];
  highlightPolicy?: ImportHighlightPolicy;
  importedAt: string;
  sourceProfile?: ImportSourceProfile;
  sourceTrackingMode?: ImportSourceTrackingMode;
  titleStrategy?: ImportNodeTitleStrategy;
}
