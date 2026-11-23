import { describeAideBaseTopic } from '../../lib/core/assistant/aideBaseTopic.js';
import { AIDE_READ_SEGMENT_MAX, searchAideMaterialText, sliceAideMaterialText } from '../../lib/core/assistant/aideMaterialText.js';
import { readAgentControlMaterial } from '../agentControl/agentControlMaterials.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { readCurrentPdfDocumentPage, readCurrentPdfDocumentPageTexts, searchCurrentPdfDocument } from '../database/pdfDocumentSearch.js';

import { loadAideAttachedContextSnapshot } from './aideAttachedContextLoader.js';
import { listAideBaseTopicFamily } from './aideReadScope.js';

export interface AideLocalToolResult {
  ok: boolean;
  payload: unknown;
}

export type AideLocalToolHandler = (args: Record<string, unknown>) => Promise<AideLocalToolResult>;

const PDF_EXCERPT_RADIUS = 120;

export const AIDE_LOCAL_READ_TOOLS: Record<string, AideLocalToolHandler> = {
  read_material: (args) => runWithDatabaseConnectionOwner(() => readMaterialSegment(args)),
  read_pdf_page: (args) => runWithDatabaseConnectionOwner(() => readPdfPage(args)),
  search_in_material: (args) => runWithDatabaseConnectionOwner(() => searchInMaterial(args)),
  trace_source: (args) => runWithDatabaseConnectionOwner(() => traceSource(args))
};

function readMaterialSegment(args: Record<string, unknown>): AideLocalToolResult {
  const material = readAgentControlMaterial(String(args.id), 'full');
  if (!material) return notFound();
  const offset = typeof args.offset === 'number' ? args.offset : 0;
  const segment = sliceAideMaterialText(material.content, offset, typeof args.length === 'number' ? args.length : undefined);
  const rest: Partial<typeof material> = { ...material };
  // Later segments repeat neither the children list nor the Item answer.
  if (segment.content_offset > 0) {
    delete rest.children;
    delete rest.reveal;
  }
  return { ok: true, payload: { material: { ...rest, ...segment } } };
}

function searchInMaterial(args: Record<string, unknown>): AideLocalToolResult {
  const id = String(args.id);
  const query = String(args.query);
  const limit = typeof args.limit === 'number' ? args.limit : undefined;
  const pdf = searchCurrentPdfDocument(id, query);
  if (pdf.status === 'ready') {
    const shown = pdf.matches.slice(0, limit ?? 10);
    const texts = readCurrentPdfDocumentPageTexts(id, [...new Set(shown.map((match) => match.page))]);
    return { ok: true, payload: {
      kind: 'pdf', material_id: id, query, total: pdf.matches.length,
      matches: shown.map((match) => ({
        excerpt: excerptAround(texts.get(match.page) ?? '', match.matchStart),
        match_start: match.matchStart,
        page: match.page
      }))
    } };
  }
  const material = readAgentControlMaterial(id, 'full');
  if (!material) return notFound();
  const result = searchAideMaterialText(material.content, query, limit);
  return { ok: true, payload: { kind: 'text', material_id: id, query, ...result } };
}

function traceSource(args: Record<string, unknown>): AideLocalToolResult {
  const snapshot = loadAideAttachedContextSnapshot(String(args.id));
  if (!snapshot) return notFound();
  const lookup = describeAideBaseTopic(snapshot.focus, snapshot.ancestors);
  if (!lookup.ok) return lookup;
  const baseTopic = lookup.payload.base_topic as { id: string };
  return { ok: true, payload: { ...lookup.payload, base_topic_materials: listAideBaseTopicFamily(baseTopic.id) } };
}

function readPdfPage(args: Record<string, unknown>): AideLocalToolResult {
  const result = readCurrentPdfDocumentPage(String(args.id), Number(args.page));
  if (result.status !== 'ready') return { ok: false, payload: { error: 'pdf_text_unavailable', status: result.status } };
  if (!result.page) return { ok: false, payload: { error: 'page_not_found', page_count: result.pageCount } };
  const text = result.page.text;
  return { ok: true, payload: {
    material_id: String(args.id),
    page: result.page.page,
    page_count: result.pageCount,
    text: text.slice(0, AIDE_READ_SEGMENT_MAX),
    text_char_count: text.length,
    text_truncated: text.length > AIDE_READ_SEGMENT_MAX
  } };
}

function excerptAround(text: string, start: number) {
  const from = Math.max(0, start - PDF_EXCERPT_RADIUS);
  const to = Math.min(text.length, start + PDF_EXCERPT_RADIUS);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/gu, ' ').trim()}${to < text.length ? '…' : ''}`;
}

function notFound(): AideLocalToolResult {
  return { ok: false, payload: { error: 'not_found' } };
}
