type ReplaceAllPattern = string | RegExp;
type ReplaceAllReplacement = string | ((substring: string, ...args: unknown[]) => string);

function defineMissingProperty<T extends object, K extends PropertyKey>(target: T, key: K, value: unknown) {
  if (key in target) {
    return;
  }
  Object.defineProperty(target, key, {
    configurable: true,
    value,
    writable: true
  });
}

function normalizeRelativeIndex(index: number, length: number) {
  const integerIndex = Math.trunc(index) || 0;
  return integerIndex < 0 ? length + integerIndex : integerIndex;
}

function installArrayAtPolyfill() {
  defineMissingProperty(Array.prototype, 'at', function at<T>(this: ArrayLike<T>, index: number) {
    const length = this.length >>> 0;
    const resolvedIndex = normalizeRelativeIndex(Number(index), length);
    return resolvedIndex < 0 || resolvedIndex >= length ? undefined : this[resolvedIndex];
  });
}

function assertGlobalRegex(pattern: RegExp) {
  if (!pattern.global) {
    throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument.');
  }
}

function replaceStringPattern(source: string, pattern: string, replacement: ReplaceAllReplacement) {
  if (pattern === '') {
    return source.replace(/(?:)/gu, replacement as string);
  }
  if (typeof replacement !== 'function') {
    return source.split(pattern).join(replacement);
  }
  let result = '';
  let start = 0;
  let index = source.indexOf(pattern);
  while (index !== -1) {
    result += source.slice(start, index) + replacement(pattern, index, source);
    start = index + pattern.length;
    index = source.indexOf(pattern, start);
  }
  return result + source.slice(start);
}

function installStringReplaceAllPolyfill() {
  defineMissingProperty(String.prototype, 'replaceAll', function replaceAll(
    this: string,
    pattern: ReplaceAllPattern,
    replacement: ReplaceAllReplacement
  ) {
    const source = String(this);
    if (pattern instanceof RegExp) {
      assertGlobalRegex(pattern);
      return source.replace(pattern, replacement as string);
    }
    return replaceStringPattern(source, String(pattern), replacement);
  });
}

function installPromiseAllSettledPolyfill() {
  defineMissingProperty(Promise, 'allSettled', function allSettled<T>(values: Iterable<T | PromiseLike<T>>) {
    const wrapped = Array.from(values, (value) =>
      Promise.resolve(value).then(
        (result) => ({ status: 'fulfilled' as const, value: result }),
        (reason) => ({ reason, status: 'rejected' as const })
      )
    );
    return Promise.all(wrapped);
  });
}

function installPromiseFinallyPolyfill() {
  defineMissingProperty(Promise.prototype, 'finally', function promiseFinally<T>(
    this: Promise<T>,
    onFinally?: (() => void) | null
  ) {
    const handler = typeof onFinally === 'function' ? onFinally : () => undefined;
    return this.then(
      (value) => Promise.resolve(handler()).then(() => value),
      (reason) =>
        Promise.resolve(handler()).then(() => {
          throw reason;
        })
    );
  });
}

function installObjectFromEntriesPolyfill() {
  defineMissingProperty(Object, 'fromEntries', function fromEntries(entries: Iterable<readonly [PropertyKey, unknown]>) {
    const result: Record<PropertyKey, unknown> = {};
    for (const [key, value] of entries) {
      result[key] = value;
    }
    return result;
  });
}

function cloneFallback<T>(value: T): T {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneFallback(entry)) as T;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneFallback(entry)])) as T;
}

function installStructuredCloneFallback() {
  defineMissingProperty(globalThis, 'structuredClone', cloneFallback);
}

export function installCompanionWebViewCompatibilityPolyfills() {
  installArrayAtPolyfill();
  installStringReplaceAllPolyfill();
  installObjectFromEntriesPolyfill();
  installPromiseAllSettledPolyfill();
  installPromiseFinallyPolyfill();
  installStructuredCloneFallback();
}
