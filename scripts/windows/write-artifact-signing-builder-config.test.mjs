// @vitest-environment node

import { expect, it } from 'vitest';

import { REQUIRED_ARTIFACT_SIGNING_ENV } from './check-artifact-signing-config.mjs';
import { createArtifactSigningBuilderConfig } from './write-artifact-signing-builder-config.mjs';

it('adds Artifact Signing without persisting Azure credentials', () => {
  const env = Object.fromEntries(REQUIRED_ARTIFACT_SIGNING_ENV.map((name) => [name, `configured-${name}`]));
  env.ARTIFACT_SIGNING_ENDPOINT = 'https://eus.codesigning.azure.net/';
  const artifactName = '${productName}-Windows-${arch}-${version}.${ext}';
  const config = createArtifactSigningBuilderConfig({ win: { artifactName, target: ['nsis'] } }, env);

  expect(config.forceCodeSigning).toBe(true);
  expect(config.win).toMatchObject({
    artifactName,
    azureSignOptions: {
      certificateProfileName: env.ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME,
      codeSigningAccountName: env.ARTIFACT_SIGNING_ACCOUNT_NAME,
      endpoint: env.ARTIFACT_SIGNING_ENDPOINT,
      publisherName: env.ARTIFACT_SIGNING_PUBLISHER_NAME
    },
    verifyUpdateCodeSignature: true
  });
  expect(JSON.stringify(config)).not.toContain('AZURE_CLIENT_ID');
  expect(JSON.stringify(config)).not.toContain(env.AZURE_CLIENT_ID);
});
