export function installPromiseWithResolvers() {
  if ('withResolvers' in Promise) return;
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>(this: PromiseConstructor) {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new this<T>((accept, decline) => { resolve = accept; reject = decline; });
      return { promise, resolve, reject };
    }
  });
}
