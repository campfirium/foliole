import { expect, it } from 'vitest';

import type { CanonicalValue } from './framedSyncCanonicalManifest.js';
import { projectNodeRetention, readNodeRetention } from './framedSyncNodeRetentionValue.js';

it('preserves fractional retention without rounding and permits explicit clearing', () => {
  for (const value of [0.91, 0.875, 0.9999999999999999, 0, 1, null]) {
    expect(readNodeRetention(projectNodeRetention(value))).toBe(value);
  }
});

it('rejects non-finite and ambiguous retention representations', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(() => projectNodeRetention(value)).toThrow('node_version_fact_retention_invalid');
  }
  const invalid: CanonicalValue[] = ['NaN', 'Infinity', '', ' 0.91', '0.910', '1', 'nope']
    .map(value => ({ kind: 'string', value }));
  invalid.push({ kind: 'bool', value: true });
  for (const value of invalid) {
    expect(() => readNodeRetention(value)).toThrow('node_version_fact_retention_invalid');
  }
});
