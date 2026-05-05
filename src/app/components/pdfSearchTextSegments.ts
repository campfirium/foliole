export interface TextSpanSegment {
  element: HTMLElement;
  end: number;
  node: Text;
  start: number;
  text: string;
}

function resolveTextNode(element: HTMLElement) {
  const firstChild = element.firstChild;
  if (firstChild instanceof Text) {
    return firstChild;
  }
  return element.childNodes[0] instanceof Text ? element.childNodes[0] : null;
}

export function collectTextItemNodes(pageBounds: HTMLElement) {
  const textLayer = pageBounds.querySelector<HTMLElement>('.textLayer');
  if (!textLayer) return [];
  const directItems = Array.from(textLayer.querySelectorAll<HTMLElement>('span[role="presentation"], div[role="presentation"]'));
  if (directItems.length > 0) {
    return directItems;
  }
  return Array.from(textLayer.querySelectorAll<HTMLElement>('span, div')).filter((node) => {
    if (node.children.length > 0) {
      return false;
    }
    return (node.textContent ?? '').trim().length > 0;
  });
}

function collectSegmentsFromItemNodes(itemNodes: HTMLElement[]) {
  const segments: TextSpanSegment[] = [];
  let cursor = 0;
  for (const itemNode of itemNodes) {
    const textValue = itemNode.textContent ?? '';
    if (!textValue) {
      continue;
    }
    const textNode = resolveTextNode(itemNode) ?? new Text(textValue);
    const start = cursor;
    const end = start + textValue.length;
    segments.push({ element: itemNode, end, node: textNode, start, text: textValue });
    cursor = end;
  }
  return segments;
}

export function collectTextSegments(shell: HTMLDivElement): TextSpanSegment[] {
  const pageBounds = shell.querySelector<HTMLElement>('.react-pdf__Page') ?? shell;
  const itemNodes = collectTextItemNodes(pageBounds);
  if (itemNodes.length > 0) {
    return collectSegmentsFromItemNodes(itemNodes);
  }
  const textRoot = shell.querySelector<HTMLElement>('.textLayer') ?? pageBounds;
  if (typeof document.createTreeWalker !== 'function') {
    return [];
  }
  const segments: TextSpanSegment[] = [];
  const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let node = walker.nextNode();

  while (node) {
    if (!(node instanceof Text)) {
      node = walker.nextNode();
      continue;
    }
    const textValue = node.textContent ?? '';
    if (textValue.length > 0) {
      const container = node.parentElement?.closest<HTMLElement>('span, div') ?? null;
      if (container) {
        const start = cursor;
        const end = start + textValue.length;
        segments.push({ element: container, end, node, start, text: textValue });
        cursor = end;
      }
    }
    node = walker.nextNode();
  }

  if (segments.length > 0) {
    return segments;
  }

  const leafNodes = Array.from(textRoot.querySelectorAll<HTMLElement>('*')).filter((element) => {
    if (element.children.length > 0) {
      return false;
    }
    return (element.textContent ?? '').trim().length > 0;
  });
  for (const leaf of leafNodes) {
    const textValue = leaf.textContent ?? '';
    if (!textValue) continue;
    const start = cursor;
    const end = start + textValue.length;
    const textNode = leaf.firstChild instanceof Text ? leaf.firstChild : new Text(textValue);
    segments.push({ element: leaf, end, node: textNode, start, text: textValue });
    cursor = end;
  }
  return segments;
}
