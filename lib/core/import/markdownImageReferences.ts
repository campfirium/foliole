export interface ParsedMarkdownImageReference {
  altText: string;
  end: number;
  fullMatch: string;
  rawTarget: string;
  start: number;
}

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let current = index - 1; current >= 0 && text[current] === '\\'; current -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findMarkdownImageAltEnd(text: string, altStart: number) {
  for (let index = altStart; index < text.length - 1; index += 1) {
    if (text[index] === ']' && text[index + 1] === '(' && !isEscaped(text, index)) {
      return index;
    }
    if (text[index] === '\n') {
      return -1;
    }
  }
  return -1;
}

function findMarkdownImageTargetEnd(text: string, targetStart: number) {
  let nestedParenthesisDepth = 0;
  let inAngleWrappedTarget = false;

  for (let index = targetStart; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\n') {
      return -1;
    }
    if (isEscaped(text, index)) {
      continue;
    }
    if (!inAngleWrappedTarget && nestedParenthesisDepth === 0 && character === '<') {
      inAngleWrappedTarget = true;
      continue;
    }
    if (inAngleWrappedTarget) {
      if (character === '>') {
        inAngleWrappedTarget = false;
      }
      continue;
    }
    if (character === '(') {
      nestedParenthesisDepth += 1;
      continue;
    }
    if (character !== ')') {
      continue;
    }
    if (nestedParenthesisDepth === 0) {
      return index;
    }
    nestedParenthesisDepth -= 1;
  }

  return -1;
}

export function collectMarkdownImageReferences(text: string): ParsedMarkdownImageReference[] {
  const matches: ParsedMarkdownImageReference[] = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] !== '!' || text[index + 1] !== '[') {
      continue;
    }

    const altStart = index + 2;
    const altEnd = findMarkdownImageAltEnd(text, altStart);
    if (altEnd < 0) {
      continue;
    }

    const targetStart = altEnd + 2;
    const targetEnd = findMarkdownImageTargetEnd(text, targetStart);
    if (targetEnd < 0) {
      continue;
    }

    matches.push({
      altText: text.slice(altStart, altEnd),
      end: targetEnd + 1,
      fullMatch: text.slice(index, targetEnd + 1),
      rawTarget: text.slice(targetStart, targetEnd),
      start: index
    });
    index = targetEnd;
  }

  return matches;
}

export function parseMarkdownImageTarget(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return null;
  }

  if (trimmedTarget.startsWith('<')) {
    const closingIndex = trimmedTarget.indexOf('>');
    if (closingIndex > 0) {
      const destination = trimmedTarget.slice(1, closingIndex).trim();
      if (!destination) {
        return null;
      }
      return {
        destination,
        suffix: trimmedTarget.slice(closingIndex + 1).trim()
      };
    }
  }

  const suffixMatch = /^(.*?)(?:\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))$/.exec(trimmedTarget);
  const destination = (suffixMatch?.[1] ?? trimmedTarget).trim();
  if (!destination) {
    return null;
  }

  return {
    destination,
    suffix: suffixMatch?.[2]?.trim() ?? ''
  };
}
