import { collectAnchorRecordsByKind } from './anchorRecords';

export interface DocumentHighlightItem {
  id: string;
  text: string;
}

export function collectDocumentHighlights(content: string): DocumentHighlightItem[] {
  return collectAnchorRecordsByKind(content, 'highlight')
    .map((record) => ({
      id: record.id,
      text: record.text
    }))
    .filter((item) => item.text.length > 0);
}
