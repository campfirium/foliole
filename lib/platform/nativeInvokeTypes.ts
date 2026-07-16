type NativeCommandShape<T> = { [K in keyof T]: { args: unknown } };

export type NativeInvokeTuple<T extends NativeCommandShape<T>, K extends keyof T> = T[K]['args'] extends undefined
  ? []
  : [args: T[K]['args']];

export type NativeInvokeRequest<T extends NativeCommandShape<T>, K extends keyof T = keyof T> = K extends keyof T
  ? T[K]['args'] extends undefined
    ? { command: K; args?: undefined }
    : { command: K; args: T[K]['args'] }
  : never;
