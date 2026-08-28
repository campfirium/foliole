// @vitest-environment node

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  copyPdfJsResources,
  PDFJS_RESOURCE_GROUPS,
  PDFJS_RESOURCE_PUBLIC_PATH,
  pdfJsResourcesPlugin
} from './vite/pdfJsResources.ts';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('PDF.js resource packaging', () => {
  it('copies every external resource family required by the reader', () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-pdfjs-resources-'));
    temporaryDirectories.push(outputDirectory);

    copyPdfJsResources(process.cwd(), outputDirectory);

    expect(PDFJS_RESOURCE_GROUPS).toEqual(['cmaps', 'iccs', 'standard_fonts', 'wasm']);
    expect(fs.existsSync(path.join(outputDirectory, PDFJS_RESOURCE_PUBLIC_PATH, 'wasm', 'openjpeg.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(outputDirectory, PDFJS_RESOURCE_PUBLIC_PATH, 'wasm', 'qcms_bg.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(outputDirectory, PDFJS_RESOURCE_PUBLIC_PATH, 'cmaps', 'Adobe-CNS1-0.bcmap'))).toBe(true);
    expect(fs.existsSync(path.join(outputDirectory, PDFJS_RESOURCE_PUBLIC_PATH, 'standard_fonts', 'LiberationSans-Regular.ttf'))).toBe(true);
    expect(fs.existsSync(path.join(outputDirectory, PDFJS_RESOURCE_PUBLIC_PATH, 'iccs', 'CGATS001Compat-v2-micro.icc'))).toBe(true);
  }, 15_000);

  it('serves decoder resources through the Vite development server', () => {
    const plugin = pdfJsResourcesPlugin(process.cwd());
    let middleware;
    plugin.configureServer({
      middlewares: {
        use(handler) {
          middleware = handler;
        }
      }
    });
    const response = {
      body: null,
      end(body) {
        this.body = body;
      },
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      statusCode: 0
    };

    middleware({ method: 'GET', url: '/pdfjs-resources/wasm/openjpeg.wasm' }, response, () => {
      throw new Error('Known PDF.js resource unexpectedly reached the next middleware.');
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/wasm');
    expect(response.body).toBeInstanceOf(Buffer);
  });
});
