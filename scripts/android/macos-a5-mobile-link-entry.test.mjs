import { describe, expect, it } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { assertMobileLinkOutput } from './macos-a5-mobile-link-entry.mjs';

const facts = { cold: true, foreground: true, missingRejected: true,
  invalidRejected: true, wrongGroupRejected: true, reopen: true, protectedDataPreserved: true };
const output = (value) => `INSTRUMENTATION_STATUS: foliole_mobile_link=${JSON.stringify(value)}\nOK (1 test)`;

describe('fixed A5 mobile URL acceptance', () => {
  it('requires real system entry assertions in the instrumentation receipt', () => {
    expect(assertMobileLinkOutput(output(facts))).toEqual(facts);
    for (const key of Object.keys(facts)) {
      expect(() => assertMobileLinkOutput(output({ ...facts, [key]: false }))).toThrow();
    }
    expect(() => assertMobileLinkOutput('OK (1 test)')).toThrow();
    expect(() => assertMobileLinkOutput(`${output(facts)}\nFAILURES!!!`)).toThrow();
  });
  it('retains the fixed device lease and frozen build boundary', () => {
    const action = assertRegisteredMacosA5Action('mobile-link');
    expect(action.deviceLeaseMode).toBe('mutation');
    expect(action.formalSourceClass).toBe('frozen-build');
    expect(action.formalEvidence).toEqual({ kind: 'run-directory', root: 'a5-mobile-link' });
  });
});
