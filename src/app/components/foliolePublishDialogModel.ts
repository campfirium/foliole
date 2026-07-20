import { readFolioleWebBinding, readFolioleWebYamlCandidates } from '../../../lib/core/foliolePublish/folioleWebPublishFrontmatter';
import type { NativeFoliolePublishField, NativeFoliolePublishSettings } from '../../../lib/platform/nativeFoliolePublishContract';

export function readFoliolePublishForm(content: string) {
  return readFolioleWebBinding(content)?.fields ?? [];
}

export function buildFolioleFieldChoices(content: string, settings: NativeFoliolePublishSettings) {
  const yaml = readFolioleWebYamlCandidates(content);
  const byKey = new Map<string, NativeFoliolePublishField>();
  for (const entry of settings.field_catalog) {
    byKey.set(entry.key, { key: entry.key, value: entry.recent_values[0] ?? (entry.multiple ? [] : '') });
  }
  for (const entry of yaml) byKey.set(entry.key, entry);
  return [...byKey.values()];
}

export function addFoliolePublishField(fields: NativeFoliolePublishField[], field: NativeFoliolePublishField) {
  return fields.some((entry) => entry.key === field.key) ? fields : [...fields, field];
}

export function parseMultipleValue(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
