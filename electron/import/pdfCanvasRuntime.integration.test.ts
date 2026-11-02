// @vitest-environment node
import process from 'node:process';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect, it } from 'vitest';

import { longTextPdf } from '../database/longTextPdfTestFixture.js';

it('loads system fonts and encodes PDF helper text in the shipped Electron runtime', async () => {
  expect(process.versions.electron, 'Exercise native Canvas inside Electron, not ordinary Node').toBeDefined();
  const loading = getDocument({ data: new Uint8Array(Buffer.from(longTextPdf(1), 'latin1')) });
  const document = await loading.promise;
  const factory = document.canvasFactory as {
    create(width: number, height: number): {
      canvas: { encode(format: 'png'): Promise<Buffer> };
      context: CanvasRenderingContext2D;
    };
  };
  try {
    const { canvas, context } = factory.create(96, 32);
    context.font = '16px sans-serif';
    expect(context.measureText('Foliole').width).toBeGreaterThan(0);
    context.fillText('Foliole', 2, 22);
    const image = await canvas.encode('png');
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.length).toBeGreaterThan(8);
  } finally {
    await loading.destroy();
  }
}, 30_000);
