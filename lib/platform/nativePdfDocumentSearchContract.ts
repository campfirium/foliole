import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativePdfDocumentSearchMatch {
  fragments: Array<{ end: number; page: number; start: number }>;
  id: string;
  match_start: number;
  page: number;
}

export interface NativePdfDocumentSearchResult {
  matches: NativePdfDocumentSearchMatch[];
  status: 'failed' | 'indexing' | 'pending' | 'ready' | 'unavailable';
}

export interface NativePdfDocumentSearchCommandMap {
  [NATIVE_COMMANDS.searchPdfDocument]: {
    args: { node_id: string; query: string };
    result: NativePdfDocumentSearchResult;
  };
}
