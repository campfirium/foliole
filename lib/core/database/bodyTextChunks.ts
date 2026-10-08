const encoder = new TextEncoder();

/** TextEncoder scalar replacement is preserved, including lone UTF-16 surrogates. */
export function* utf8BodyTextChunks(content: string) {
  for (let start = 0; start < content.length;) {
    let end = Math.min(start + 16 * 1024, content.length);
    const last = content.charCodeAt(end - 1);
    if (end < content.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    yield encoder.encode(content.slice(start, end));
    start = end;
  }
}
