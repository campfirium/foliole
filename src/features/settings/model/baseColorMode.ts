import { parseLiteralUnion } from '../../../shared/lib/parseLiteralUnion';

const BASE_COLOR_OPTIONS = ['light', 'dark', 'system'] as const;
export type BaseColorMode = (typeof BASE_COLOR_OPTIONS)[number];
export type ResolvedBaseColorMode = Exclude<BaseColorMode, 'system'>;

export function isBaseColorMode(value: string): value is BaseColorMode {
  return parseLiteralUnion(value, BASE_COLOR_OPTIONS) !== null;
}

export function resolveBaseColorMode(value: BaseColorMode): ResolvedBaseColorMode {
  if (value !== 'system') {
    return value;
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
