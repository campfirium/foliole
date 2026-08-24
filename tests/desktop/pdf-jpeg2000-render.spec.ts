import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const FIXTURE_PATH = path.resolve('.tmp/artifacts/pdf-jpeg2000-render-fixture.pdf');
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/pdf-jpeg2000-hidden-native.png');
const JP2_IMAGE_BASE64 =
  'AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAGAAAABgAAwcHAAAAAAAPY29scgEAAAAAABAAAAMranAyY/9P/1EALwAAAAAAGAAAABgAAAAAAAAAAAAAABgAAAAYAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAQEBAAB/1wAEEBASEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS4z/5AACgAAAAACpwAB/5PPtBABv1tMz7QUCKyTdH/PtBQId3AYP8faBx9oHD7QIAwYPwv/Bwcvw+oDh9QHA+cEC2ifC2ifAX/H2gcfaBw+0CALDAcLC38Ei8/ALn4BcfgFgBem1Hr8UlrVw3lfEw2VUlBhGFlM5sYahYHM6EdRZyBwI8PqCofUEw+0JAwxdz8KFrA7a38QM7CSf6b/Nc8ZVEfMTp8jvM7PwC5+AZH4BYAYr249fiktakuPDRSXz6koMIwreVKCfxkx+5nQjnHCHh2Vx9ovH2i0H1CYGRlgmUbhMLJBTh/ea1voF0qXpEWQ7h8bu/yFkuHX/28je/90pJMtNzXOqGxvFfFdPJJm9QmNo0q0/GihvmEhH8PqFIfUKQPnIhqDSP97semzsH/kse8MHE0K/J4vIDwhUOCxDVAQf+4lCZFBKNZQcwMWnV88kmdiuHm0WrtslxgAGcfaMR9ovB9QsBhtXplG4TCyQU4f3mtb6sTtmKNlucr5vxsP+oWS4df/byN7/3Sh7IMr6TsH9Jh/Fp1fPJJm9QmNo0q0+2ARAgBbDYR3f8faOR9o7D7RMF2i3xutn55DQwUS+QZZ/HZ8V2CZfUjpT7dlo98u/WCPDiAepcz0ZF/+RlRBmqXvE4wCKX+8UxUVXynmNnvcDDM0sUoVSzwHvwRhW4jD6huH1DcH1CReTuEbrZ78mYmAo1+ZZG2ErgKVmWFgbo5rb8cuPrAeHEApOkXejIwM2pl29hvfIWG2lB1NYe8pKc10IDzzeS28okRVRbWloD/H2jsfaOw+0TBeTuEbrZ+eQ0MFEvkGWfx2fFdgYxNg74/fBdH/fy4+sB4cQD1LmejIv/yMqIM1S93+oGQbBR49OQRDKSnNdCA883ktZtJBIociAZT13//Z';

function buildPdfObject(objectNumber: number, body: Buffer | string) {
  return Buffer.concat([
    Buffer.from(`${objectNumber} 0 obj\n`),
    typeof body === 'string' ? Buffer.from(body) : body,
    Buffer.from('\nendobj\n')
  ]);
}

function createJpeg2000PdfFixture() {
  const image = Buffer.from(JP2_IMAGE_BASE64, 'base64');
  const content = Buffer.from('q\n100 0 0 100 0 0 cm\n/Im0 Do\nQ\n');
  const objects = [
    buildPdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    buildPdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    buildPdfObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    buildPdfObject(4, Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 24 /Height 24 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /JPXDecode /Length ${image.length} >>\nstream\n`),
      image,
      Buffer.from('\nendstream')
    ])),
    buildPdfObject(5, Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from('endstream')
    ]))
  ];
  const header = Buffer.from('%PDF-1.7\n%\xFF\xFF\xFF\xFF\n', 'binary');
  const offsets: number[] = [];
  let byteOffset = header.length;
  for (const object of objects) {
    offsets.push(byteOffset);
    byteOffset += object.length;
  }
  const xref = Buffer.from([
    'xref',
    '0 6',
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    '<< /Size 6 /Root 1 0 R >>',
    'startxref',
    String(byteOffset),
    '%%EOF',
    ''
  ].join('\n'));
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, Buffer.concat([header, ...objects, xref]));
}

async function importFixture(desktopApp: ElectronApplication, desktopWindow: Page) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
  }, FIXTURE_PATH);
  const result = await desktopWindow.evaluate(() => window.electronAPI?.invoke('run_text_file_import', {}));
  if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
    throw new Error(`JPEG 2000 PDF import failed: ${JSON.stringify(result)}`);
  }
  return result.node_id;
}

test('JPEG 2000 scan PDF renders non-blank pixels @pdf', async ({ desktopApp, desktopWindow }) => {
  createJpeg2000PdfFixture();
  const nodeId = await importFixture(desktopApp, desktopWindow);
  const opened = await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id) ?? false, nodeId);
  expect(opened).toBe(true);
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();

  const readyPage = desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first();
  await expect(readyPage).toBeVisible();
  await expect.poll(() => readyPage.locator('canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let coloredPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index]! < 245 || pixels[index + 1]! < 245 || pixels[index + 2]! < 245) coloredPixels += 1;
    }
    return coloredPixels;
  })).toBeGreaterThan(100);
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});
