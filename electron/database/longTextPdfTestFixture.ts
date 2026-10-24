/** A plain text PDF whose parse takes long enough to show whether the main thread is held. */
export function longTextPdf(pageCount: number) {
  const objects = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pagesId = 2 + pageCount * 2;
  const kids: number[] = [];
  for (let page = 0; page < pageCount; page += 1) {
    const stream = Array.from({ length: 50 }, (_, line) =>
      `BT /F1 9 Tf 40 ${780 - line * 15} Td (Page ${page} line ${line} the quick brown fox jumps over the lazy dog) Tj ET`).join('\n');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.push(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${objects.length} 0 R `
      + '/Resources << /Font << /F1 1 0 R >> >> >>');
    kids.push(objects.length);
  }
  objects.push(`<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  objects.push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  return `${body}trailer\n<< /Size ${objects.length + 1} /Root ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
