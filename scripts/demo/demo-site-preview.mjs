#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runDemoSitePreview } from './demo-site-preview-runtime.mjs';

export { runDemoSitePreview };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDemoSitePreview().catch((error) => {
    console.error(`[demo-site-preview] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
