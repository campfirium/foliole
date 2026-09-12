import type { PreparedReadwiseApiDocument } from './readwiseApiImport.js';

export interface ReadwiseApiEpubBookNode {
  attachmentIds: string[];
  content: string;
  key: string;
  parentKey: string | null;
  title: string;
}

export function buildReadwiseApiEpubBookNodes(
  sections: Array<NonNullable<PreparedReadwiseApiDocument['epubStructure']>['sections'][number] & {
    attachmentIds?: string[];
  }>
) {
  const stack: Array<{ key: string; level: number }> = [];
  const nodes: ReadwiseApiEpubBookNode[] = [];
  for (const section of sections) {
    if (section.naturalLevel === undefined && section.headingLevel === null) {
      nodes.push(toNode(section, null));
      continue;
    }
    const level = section.naturalLevel ?? section.headingLevel ?? 1;
    if (level > 3) {
      const carrier = nodes.find((node) => node.key === stack.at(-1)?.key);
      if (!carrier) continue;
      carrier.content = joinContent(carrier.content, section.content);
      carrier.attachmentIds = [...new Set([...carrier.attachmentIds, ...(section.attachmentIds ?? [])])];
      continue;
    }
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    nodes.push(toNode(section, stack.at(-1)?.key ?? null));
    stack.push({ key: section.markerKey, level });
  }
  return nodes;
}

function toNode(
  section: Parameters<typeof buildReadwiseApiEpubBookNodes>[0][number],
  parentKey: string | null
): ReadwiseApiEpubBookNode {
  return {
    attachmentIds: section.attachmentIds ?? [], content: section.content,
    key: section.markerKey, parentKey, title: section.title
  };
}

function joinContent(left: string, right: string) {
  return [left.trim(), right.trim()].filter(Boolean).join('\n\n');
}
