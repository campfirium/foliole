import type { EditorView } from '@codemirror/view';

import { parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { loadRuntimeLibraryPathSettings } from '../../../shared/platform/libraryPathsRuntimeRepository';
import {
  createClipboardExportPayload as createClipboardExportPayloadInModel,
  type ClipboardExportPayload
} from '../model/anchorClipboardExport';
import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';
import { renderExternalMarkdownWithAnchorRanges } from '../model/anchorExternalMarkdown';
import { collectInlineLinkMatches } from '../model/inlineMarkdownMatches';

import { getTextAnchorDecorations } from './liveMarkdownState';

export const FOLIOLE_CLIPBOARD_MIME = 'application/x-foliole';

let cachedAssetsDir: string | null | undefined;
let pendingAssetsDirLoad: Promise<string | null> | null = null;

interface SelectedSlice {
  from: number;
  text: string;
  to: number;
}

function collectSelectedSlices(view: EditorView, expandLinks: boolean): SelectedSlice[] {
  return view.state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => {
      if (!expandLinks) {
        return {
          from: range.from,
          text: view.state.doc.sliceString(range.from, range.to),
          to: range.to
        };
      }
      let from = range.from;
      let to = range.to;
      const startLine = view.state.doc.lineAt(from).number;
      const endLine = view.state.doc.lineAt(Math.max(from, to - 1)).number;

      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
        const line = view.state.doc.line(lineNumber);
        const linkMatches = collectInlineLinkMatches(line.from, line.text, []);
        for (const linkMatch of linkMatches) {
          if (!rangeOverlaps(from, to, linkMatch.labelFrom, linkMatch.labelTo)) continue;
          from = Math.min(from, linkMatch.from);
          to = Math.max(to, linkMatch.to);
        }
      }

      return {
        from,
        text: view.state.doc.sliceString(from, to),
        to
      };
    });
}

function rangeOverlaps(leftFrom: number, leftTo: number, rightFrom: number, rightTo: number) {
  return leftFrom < rightTo && leftTo > rightFrom;
}

function joinSelectedText(slices: ReadonlyArray<SelectedSlice>) {
  return slices.map((slice) => slice.text).join('\n');
}

function buildExternalTextFromSlices(view: EditorView, slices: ReadonlyArray<SelectedSlice>) {
  const decorations = getTextAnchorDecorations(view);
  if (slices.length === 0) {
    return null;
  }

  const pieces = slices.map((slice) => {
    const relativeAnchors = decorations
      .map((decoration) => ({
        from: Math.max(decoration.from, slice.from),
        kind: decoration.kind,
        to: Math.min(decoration.to, slice.to)
      }))
      .filter((anchor) => anchor.from < anchor.to)
      .map((anchor) => ({
        from: anchor.from - slice.from,
        kind: anchor.kind,
        to: anchor.to - slice.from
      }));

    return renderExternalMarkdownWithAnchorRanges(slice.text, relativeAnchors);
  });

  const externalText = pieces.join('\n');
  return externalText === joinSelectedText(slices) ? null : externalText;
}

function buildInternalAnchorRanges(view: EditorView, slices: ReadonlyArray<SelectedSlice>) {
  const decorations = getTextAnchorDecorations(view);
  if (slices.length === 0 || decorations.length === 0) {
    return [] satisfies ClipboardAnchorRange[];
  }

  let offset = 0;
  const anchors: ClipboardAnchorRange[] = [];
  slices.forEach((slice, index) => {
    decorations
      .map((decoration) => ({
        from: Math.max(decoration.from, slice.from),
        kind: decoration.kind,
        to: Math.min(decoration.to, slice.to)
      }))
      .filter((anchor) => anchor.from < anchor.to)
      .forEach((anchor) => {
        anchors.push({
          from: offset + anchor.from - slice.from,
          kind: anchor.kind,
          to: offset + anchor.to - slice.from
        });
      });
    offset += slice.text.length;
    if (index < slices.length - 1) {
      offset += 1;
    }
  });
  return anchors;
}

export function createClipboardExportPayload(
  internalText: string,
  externalTextBase: string | null,
  assetsDir: string | null,
  internalAnchors: ClipboardAnchorRange[] = []
): ClipboardExportPayload | null {
  return createClipboardExportPayloadInModel({
    assetsDir,
    externalTextBase,
    internalAnchors,
    internalText,
    parseAssetUrl: parseAssetMarkdownUrl
  });
}

async function ensureClipboardAssetsDirLoaded() {
  if (cachedAssetsDir !== undefined) {
    return cachedAssetsDir;
  }
  if (!pendingAssetsDirLoad) {
    pendingAssetsDirLoad = loadRuntimeLibraryPathSettings()
      .then((settings) => settings?.assetsDir ?? null)
      .catch(() => null)
      .then((assetsDir) => {
        cachedAssetsDir = assetsDir;
        pendingAssetsDirLoad = null;
        return assetsDir;
      });
  }
  return pendingAssetsDirLoad;
}

export function createClipboardExportFromView(view: EditorView) {
  const internalSlices = collectSelectedSlices(view, false);
  const internalText = joinSelectedText(internalSlices);
  if (!internalText) {
    return null;
  }

  const externalSlices = collectSelectedSlices(view, true);
  const externalSliceText = joinSelectedText(externalSlices);
  const expandedExternalText =
    buildExternalTextFromSlices(view, externalSlices) ?? (externalSliceText !== internalText ? externalSliceText : null);
  return createClipboardExportPayload(
    internalText,
    expandedExternalText,
    cachedAssetsDir ?? null,
    buildInternalAnchorRanges(view, internalSlices)
  );
}

export function resetClipboardInteropStateForTests() {
  cachedAssetsDir = undefined;
  pendingAssetsDirLoad = null;
}

void ensureClipboardAssetsDirLoaded();
