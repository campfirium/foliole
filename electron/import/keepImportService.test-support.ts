export function parseAnchorLink(value: string) {
  return JSON.parse(value) as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
}

export function mapChildRowsWithAnchorLink<T extends { anchor_link: string | null; content: string; title: string }>(childRows: T[]) {
  return childRows.map((child) => ({
    anchorLink: parseAnchorLink(child.anchor_link!),
    content: child.content,
    title: child.title
  }));
}

export function createGenericKeepImportConfig(directoryPath: string, ruleId: string, highlightPolicy: 'adopt' | 'reference_only' = 'reference_only') {
  return {
    directoryPath,
    highlightPolicy,
    ruleId
  } as const;
}
