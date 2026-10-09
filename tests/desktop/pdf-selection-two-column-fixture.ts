import fs from 'node:fs';
import path from 'node:path';

export function createTwoColumnPdf(filePath: string) {
  const content = [
    'BT /F1 12 Tf 40 440 Td (Left column heading) Tj ET',
    'BT /F1 12 Tf 40 80 Td (Boundary phrase begins ) Tj ET',
    'BT /F1 12 Tf 40 60 Td (Sentence.) Tj ET',
    'BT /F2 12 Tf 97 60 Td (x) Tj ET',
    'BT /F1 12 Tf 106 60 Td (The continuation) Tj ET',
    'BT /F1 12 Tf 330 408 Td (Right column lead-in) Tj ET',
    'BT /F1 12 Tf 330 400 Td (and continues across columns) Tj ET',
    'BT /F1 12 Tf 330 370 Td (Right column remainder) Tj ET'
  ].join('\n');
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 500] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let offset = parts[0]?.length ?? 0;
  bodies.forEach((body, index) => {
    offsets.push(offset);
    const object = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`);
    parts.push(object);
    offset += object.length;
  });
  parts.push(Buffer.from(['xref', `0 ${bodies.length + 1}`, '0000000000 65535 f ',
    ...offsets.map(value => `${String(value).padStart(10, '0')} 00000 n `),
    'trailer', `<< /Size ${bodies.length + 1} /Root 1 0 R >>`, 'startxref', String(offset), '%%EOF'].join('\n')));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat(parts));
}
