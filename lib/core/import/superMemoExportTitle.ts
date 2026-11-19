import { defaultTreeAdapter, html, type DefaultTreeAdapterTypes } from 'parse5';

type Parent = DefaultTreeAdapterTypes.ParentNode;
type Child = DefaultTreeAdapterTypes.ChildNode;

function hasClass(node: Child | undefined, name: string) {
  return node && 'tagName' in node && node.tagName === 'span' && node.attrs.some(attribute =>
    attribute.name === 'class' && attribute.value.toLowerCase().split(/\s+/u).includes(name));
}

function isWhitespace(node: Child) {
  return node.nodeName === '#comment' || ('value' in node && !node.value.trim());
}

const leadingTitleWrappers = new Set(['div', 'p', 'span', 'sr-rd-title']);

export function cleanSuperMemoExportTitle(parent: Parent, leading = true) {
  const children = parent.childNodes;
  let promoted = false;
  for (let index = 0; index < children.length; index++) {
    const node = children[index]!;
    if (!('tagName' in node)) continue;
    const atStart = leading && children.slice(0, index).every(isWhitespace);
    const label = node.childNodes[0];
    if (hasClass(node, 'headers') && label && 'value' in label && /^title\s*:\s*$/iu.test(label.value)) {
      let next = index + 1;
      while (children[next] && isWhitespace(children[next]!)) next++;
      const value = children[next];
      if (value && 'tagName' in value && hasClass(value, 'reftext')) {
        const text = value.childNodes[0];
        if (text && 'value' in text) text.value = text.value.trimStart();
        if (atStart) {
          const heading = defaultTreeAdapter.createElement('h1', html.NS.HTML, []);
          heading.parentNode = parent;
          defaultTreeAdapter.appendChild(heading, value);
          children.splice(index, next - index + 1, heading);
          promoted = true;
        } else {
          children.splice(index, next - index);
        }
        continue;
      }
    }
    const wrapper = atStart && leadingTitleWrappers.has(node.tagName);
    if (cleanSuperMemoExportTitle(node, wrapper) && wrapper) {
      const nested = node.childNodes.filter(child => !isWhitespace(child));
      const heading = nested[0];
      if (nested.length === 1 && heading && 'tagName' in heading && heading.tagName === 'h1') {
        heading.parentNode = parent;
        children[index] = heading;
        promoted = true;
      }
    }
  }
  return promoted;
}
