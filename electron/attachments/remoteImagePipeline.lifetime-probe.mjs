import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { setImmediate } from 'node:timers';
import vm from 'node:vm';

import ts from 'typescript';

function loadPipeline(download) {
  const dependencies = {
    '../database/connection.js': {},
    '../database/nodeImageSources.js': {},
    './importImageAttachmentBytes.js': {},
    './remoteImageCache.js': {
      readRemoteImageCache: async () => null,
      writeRemoteImageCache: async () => {}
    },
    './remoteImageDiagnostics.js': {},
    './remoteImageDownload.js': {
      resolveRemoteImageCacheKey: (url) => url,
      resolveRemoteImageFetchKey: (key) => key,
      downloadRemoteImageBytes: download
    },
    './remoteImageLearnedSources.js': {},
    './remoteImageTransport.js': {}
  };
  const source = readFileSync(new URL('./remoteImagePipeline.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  });
  return exports;
}

async function assertReleasedResources() {
  const references = [];
  const pipeline = loadPipeline(async (sourceUrl, cacheKey) => {
    const bytes = new Uint8Array(1024 * 1024);
    references.push(new WeakRef(bytes));
    return {
      status: 'ready', strategy: 'direct',
      resource: { bytes, cacheKey, sourceUrl, intrinsicSize: null }
    };
  });
  for (let index = 0; index < 32; index += 1) {
    await pipeline.fetchRemoteImageResource(`https://example.com/${index}.png`);
  }
  // Cross job boundaries so WeakRef keep-alive semantics cannot mask collection.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise(setImmediate);
    globalThis.gc();
  }
  assert.equal(references.filter((reference) => reference.deref()).length, 0);
  // Keep the production module alive through collection, without resetting it.
  assert.equal(typeof pipeline.fetchRemoteImageResource, 'function');
}

await assertReleasedResources();
