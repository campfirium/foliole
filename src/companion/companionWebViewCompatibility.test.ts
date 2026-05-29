import { afterEach, expect, it } from 'vitest';

import { installCompanionWebViewCompatibilityPolyfills } from './companionWebViewCompatibility';

const originalArrayAt = Array.prototype.at;
const originalReplaceAll = String.prototype.replaceAll;
const originalAllSettled = Promise.allSettled;
const originalPromiseFinally = Promise.prototype.finally;
const originalFromEntries = Object.fromEntries;
const originalStructuredClone = globalThis.structuredClone;

function setProperty(target: object, key: PropertyKey, value: unknown) {
  Object.defineProperty(target, key, {
    configurable: true,
    value,
    writable: true
  });
}

afterEach(() => {
  setProperty(Array.prototype, 'at', originalArrayAt);
  setProperty(String.prototype, 'replaceAll', originalReplaceAll);
  setProperty(Promise, 'allSettled', originalAllSettled);
  setProperty(Promise.prototype, 'finally', originalPromiseFinally);
  setProperty(Object, 'fromEntries', originalFromEntries);
  setProperty(globalThis, 'structuredClone', originalStructuredClone);
});

it('installs WebView 74 runtime APIs before the companion app boots', async () => {
  delete (Array.prototype as { at?: unknown }).at;
  delete (String.prototype as { replaceAll?: unknown }).replaceAll;
  delete (Promise as { allSettled?: unknown }).allSettled;
  delete (Promise.prototype as { finally?: unknown }).finally;
  delete (Object as { fromEntries?: unknown }).fromEntries;
  delete (globalThis as { structuredClone?: unknown }).structuredClone;

  installCompanionWebViewCompatibilityPolyfills();

  expect([1, 2, 3].at(-1)).toBe(3);
  expect('a.b.a'.replaceAll('.', '-')).toBe('a-b-a');
  expect(Object.fromEntries([['a', 1]])).toEqual({ a: 1 });
  await expect(Promise.allSettled([Promise.resolve('ok'), Promise.reject(new Error('fail'))])).resolves.toEqual([
    { status: 'fulfilled', value: 'ok' },
    { reason: expect.any(Error), status: 'rejected' }
  ]);
  await expect(Promise.resolve('done').finally(() => undefined)).resolves.toBe('done');
  expect(structuredClone({ nested: { value: 1 } })).toEqual({ nested: { value: 1 } });
});
