import fs from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

export const PDFJS_RESOURCE_PUBLIC_PATH = 'pdfjs-resources';
export const PDFJS_RESOURCE_GROUPS = ['cmaps', 'iccs', 'standard_fonts', 'wasm'] as const;

type PdfJsResourceGroup = (typeof PDFJS_RESOURCE_GROUPS)[number];

const PDFJS_RESOURCE_GROUP_SET = new Set<string>(PDFJS_RESOURCE_GROUPS);

function resourceContentType(filePath: string) {
  const extension = path.extname(filePath);
  if (extension === '.wasm') return 'application/wasm';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.ttf') return 'font/ttf';
  if (extension === '.icc') return 'application/vnd.iccprofile';
  return 'application/octet-stream';
}

export function resolvePdfJsResourceSource(projectRoot: string, group: PdfJsResourceGroup) {
  return path.resolve(projectRoot, 'node_modules', 'pdfjs-dist', group);
}

export function copyPdfJsResources(projectRoot: string, outputDirectory: string) {
  for (const group of PDFJS_RESOURCE_GROUPS) {
    fs.cpSync(
      resolvePdfJsResourceSource(projectRoot, group),
      path.resolve(outputDirectory, PDFJS_RESOURCE_PUBLIC_PATH, group),
      { recursive: true }
    );
  }
}

function resolveRequestedResource(projectRoot: string, requestUrl: string) {
  let pathname = '';
  try {
    pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;
  } catch {
    return null;
  }
  const prefix = `/${PDFJS_RESOURCE_PUBLIC_PATH}/`;
  if (!pathname.startsWith(prefix)) return null;
  let parts: string[];
  try {
    parts = pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
  const [group, fileName] = parts;
  if (parts.length !== 2 || !group || !fileName || !PDFJS_RESOURCE_GROUP_SET.has(group)) return null;
  if (path.basename(fileName) !== fileName) return null;
  return path.join(resolvePdfJsResourceSource(projectRoot, group as PdfJsResourceGroup), fileName);
}

export function pdfJsResourcesPlugin(projectRoot: string): Plugin {
  let outputDirectory = '';
  return {
    name: 'pdfjs-resources',
    configResolved(config) {
      outputDirectory = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next();
          return;
        }
        const resourcePath = resolveRequestedResource(projectRoot, request.url ?? '/');
        if (!resourcePath || !fs.existsSync(resourcePath) || !fs.statSync(resourcePath).isFile()) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', resourceContentType(resourcePath));
        response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(resourcePath));
      });
    },
    writeBundle() {
      copyPdfJsResources(projectRoot, outputDirectory);
    }
  };
}
