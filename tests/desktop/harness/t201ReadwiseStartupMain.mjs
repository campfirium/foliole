/* global Response, URL */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Install the failed remote boundary before the real main-process startup services run.
globalThis.__t201FailedRequest = false;
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname !== 'readwise.io' || !url.pathname.startsWith('/api/')) {
    throw new Error(`unexpected_startup_request:${url.origin}${url.pathname}`);
  }
  globalThis.__t201FailedRequest = true;
  return new Response(null, { status: 400 });
};
await import(pathToFileURL(path.resolve('dist/electron/main.js')).href);
