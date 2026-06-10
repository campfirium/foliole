import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('workspace right sidebar surface boundary', () => {
  it('keeps inspector sections token-driven instead of hard-coded as cards', () => {
    const inspectorSection = readWorkspaceFile('src/shared/ui/InspectorSection.tsx');

    expect(inspectorSection).toContain('rounded-[var(--app-inspector-section-radius,var(--radius-lg))]');
    expect(inspectorSection).toContain('[border-width:var(--app-inspector-section-border-width,1px)]');
    expect(inspectorSection).toContain('p-[var(--app-inspector-section-padding,1rem)]');
    expect(inspectorSection).not.toContain('rounded-lg border border-border');
  });

  it('keeps right sidebar inspector sections on local flat sidebar tokens', () => {
    const rightSidebar = readWorkspaceFile('src/app/components/WorkspaceRightSidebar.tsx');

    expect(rightSidebar).toContain('[--app-inspector-section-bg:transparent]');
    expect(rightSidebar).toContain('[--app-inspector-section-border-width:0]');
    expect(rightSidebar).toContain('[--app-inspector-section-radius:0]');
    expect(rightSidebar).toContain('[--app-inspector-section-shadow-color:transparent]');
  });
});
