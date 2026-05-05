export function extractArrayBody(source, name) {
  const start = source.indexOf(`${name} = [`);
  if (start === -1) {
    throw new Error(`Cannot find schema array ${name}`);
  }
  const bodyStart = source.indexOf('[', start) + 1;
  let depth = 1;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '`' || char === '\'' || char === '"') {
      index = readQuoted(source, index).end;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index);
      }
    }
  }
  throw new Error(`Cannot parse schema array ${name}`);
}

export function extractStatementsFromBody(body, arrays) {
  const statements = [];
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '`' || char === '\'' || char === '"') {
      const token = readQuoted(body, index);
      if (/^CREATE /i.test(token.value.trim())) {
        statements.push(token.value.trim());
      }
      index = token.end;
    } else if (body.startsWith('...', index)) {
      const match = body.slice(index + 3).match(/^([A-Z_]+)(?:\.slice\((\d+)(?:,\s*(\d+))?\))?/);
      if (match) {
        const source = arrays[match[1]] ?? [];
        const spread = match[2] === undefined
          ? source
          : source.slice(Number(match[2]), match[3] === undefined ? undefined : Number(match[3]));
        statements.push(...spread);
        index += match[0].length + 2;
      }
    }
  }
  return statements;
}

export function extractJavaExecSqlArguments(source) {
  const statements = [];
  const pattern = /execSQL\(([\s\S]*?)\);/g;
  for (const match of source.matchAll(pattern)) {
    const fragments = [...match[1].matchAll(/"((?:\\"|[^"])*)"/g)].map((fragment) => fragment[1]);
    if (fragments.length > 0) {
      statements.push(fragments.join(''));
    }
  }
  return statements;
}

export function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function readQuoted(source, start) {
  const quote = source[start];
  let value = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      value += source[index + 1] ?? '';
      index += 1;
    } else if (char === quote) {
      return { end: index, value };
    } else {
      value += char;
    }
  }
  throw new Error(`Unterminated quoted string starting at ${start}`);
}
