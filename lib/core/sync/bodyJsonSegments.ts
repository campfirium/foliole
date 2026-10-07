/** JSON escaping with complete UTF-16 pairs and the original JSON.stringify scalar rules. */
export function* bodyJsonSegments(text: string) {
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 8192, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    yield JSON.stringify(text.slice(start, end)).slice(1, -1);
    start = end;
  }
}
