import { describe, expect, it } from 'vitest';

import { SURFACE_TAXONOMY, SURFACE_TAXONOMY_IDS, type SurfaceTaxonomyEntry } from './surfaceTaxonomy';

function findSurface(id: string): SurfaceTaxonomyEntry | undefined {
  return SURFACE_TAXONOMY.find((entry) => entry.id === id);
}

describe('surface taxonomy boundary', () => {
  it('uses specific surface names instead of an ambiguous surface layer', () => {
    expect(SURFACE_TAXONOMY_IDS).not.toContain('surface');
    expect(SURFACE_TAXONOMY_IDS).toContain('panel-surface');
  });

  it('keeps shell-less surfaces anchored to the floating menu family', () => {
    const shellless = findSurface('shellless');

    expect(shellless?.parent).toBe('floating');
    expect(shellless?.currentToken).toBe('--app-shellless-surface-bg');
    expect(shellless?.forbidden.join(' ')).toContain('header/body/footer');
    expect(shellless?.notes?.join(' ')).toContain('floating menu family');
  });

  it('does not promote review action surface to a standalone layer', () => {
    const floating = findSurface('floating');

    expect(SURFACE_TAXONOMY_IDS).not.toContain('review-action-surface');
    expect(floating?.notes?.join(' ')).toContain('Review action surface remains a floating variant');
  });

  it('keeps startup fallback as an app-shell state', () => {
    const startup = findSurface('startup-fallback');

    expect(startup?.parent).toBe('app-shell');
    expect(startup?.forbidden.join(' ')).toContain('AppButton source of truth');
  });
});
