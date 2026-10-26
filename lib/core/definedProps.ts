type DefinedProps<T extends Record<string, unknown>> = {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
} & {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
};

export function definedProps<T extends Record<string, unknown>>(props: T): DefinedProps<T> {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined)
  ) as DefinedProps<T>;
}
