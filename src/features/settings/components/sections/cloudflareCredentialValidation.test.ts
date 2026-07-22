import { describe, expect, it } from 'vitest';

import { isCloudflareAccountId, isCloudflareApiToken } from './cloudflareCredentialValidation';

describe('Cloudflare credential validation', () => {
  it('accepts a 32-character hexadecimal Account ID', () => {
    expect(isCloudflareAccountId('023e105f4ecef8ad9ca31a8372d0c353')).toBe(true);
    expect(isCloudflareAccountId('023e105f4ecef8ad9ca31a8372d0c35/')).toBe(false);
    expect(isCloudflareAccountId('023e105f4ecef8ad9ca31a8372d0c35')).toBe(false);
  });

  it('accepts supported legacy and scannable API Token shapes', () => {
    expect(isCloudflareApiToken('Sn3lZJTBX6kkg7OdcBUAxOO963GEIyGQqnFTOFYY')).toBe(true);
    expect(isCloudflareApiToken(`cfut_${'a'.repeat(40)}_check`)).toBe(true);
    expect(isCloudflareApiToken('Sn3lZJTBX6kkg7OdcBUAxOO963GEIyGQqnFTOFY/')).toBe(false);
    expect(isCloudflareApiToken('short-token')).toBe(false);
  });
});
