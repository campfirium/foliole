import { buildReadwiseApiEpubBookNodes } from '../../lib/core/readwise/readwiseApiEpubBookTree.js';
import { prepareReadwiseApiEpubStructure } from '../../lib/core/readwise/readwiseApiEpubStructure.js';

export interface ReadwiseEpubSourceSnapshot {
  html: string;
  title: string;
}

export function auditReadwiseEpubCorpus(
  sources: ReadonlyMap<string, ReadwiseEpubSourceSnapshot>
) {
  const books = [...sources.entries()].map(([documentId, source]) => auditBook(documentId, source));
  return {
    books,
    counts: {
      acceptedCandidates: books.reduce((total, book) => total + book.acceptedCandidateCount, 0),
      books: books.length,
      nodes: books.reduce((total, book) => total + book.nodeCount, 0),
      rejectedCandidates: books.reduce((total, book) => total + book.rejectedCandidateCount, 0)
    }
  };
}

function auditBook(documentId: string, source: ReadwiseEpubSourceSnapshot) {
  const structure = prepareReadwiseApiEpubStructure(source.html);
  const nodes = buildReadwiseApiEpubBookNodes(structure.sections);
  const candidates = structure.candidates ?? [];
  const depthByKey = new Map<string, number>();
  nodes.forEach((node) => depthByKey.set(node.key, node.parentKey ? (depthByKey.get(node.parentKey) ?? 0) + 1 : 1));
  const leafKeys = new Set(nodes.map((node) => node.key));
  nodes.forEach((node) => {
    if (node.parentKey) leafKeys.delete(node.parentKey);
  });
  const leafLengths = nodes.filter((node) => leafKeys.has(node.key)).map((node) => readableLength(node.content));
  return {
    acceptedCandidateCount: candidates.filter((candidate) => candidate.accepted).length,
    candidates,
    documentId,
    legacyMarkerCount: structure.legacyMarkerKeys?.length ?? 0,
    levelCounts: countLevels(structure.sections.map((section) => section.naturalLevel ?? 1)),
    longLeafCount: leafLengths.filter((length) => length > 12_000).length,
    maxDepth: Math.max(0, ...depthByKey.values()),
    nodeCount: nodes.length,
    outline: nodes.map((node) => ({ depth: depthByKey.get(node.key) ?? 1, key: node.key, title: node.title })),
    rejectedCandidateCount: candidates.filter((candidate) => !candidate.accepted).length,
    shortLeafCount: leafLengths.filter((length) => length < 80).length,
    title: source.title
  };
}

function countLevels(levels: number[]) {
  return Object.fromEntries([...new Set(levels)].sort((left, right) => left - right)
    .map((level) => [String(level), levels.filter((value) => value === level).length]));
}

function readableLength(content: string) {
  return content.replace(/!\[[^\]]*\]\([^)]*\)/gu, '').replace(/\s+/gu, ' ').trim().length;
}
