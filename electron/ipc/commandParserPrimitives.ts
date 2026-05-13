import { isNodeKind } from '../../lib/core/nodes/nodeKind.js';
import { isVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asString(value, field);
}

export function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asNullableInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asNullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asIntegerInRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asLiteralUnion<const T extends readonly (number | string)[]>(
  value: unknown,
  allowedValues: T,
  field: string
): T[number] {
  if (!(allowedValues as readonly unknown[]).includes(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value as T[number];
}

export function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asRatio(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asTimestamp(value: unknown, field: string): string {
  const timestamp = asString(value, field);
  if (!timestamp.trim()) {
    throw new Error(`invalid argument: ${field}`);
  }
  return timestamp;
}

export function asNodeKind(value: unknown, field: string) {
  if (!isNodeKind(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asVirtualNodeFilterValue(value: unknown, field: string) {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isVirtualNodeFilter(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}
