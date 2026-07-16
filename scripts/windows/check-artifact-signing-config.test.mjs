// @vitest-environment node

import { expect, it } from 'vitest';

import { REQUIRED_ARTIFACT_SIGNING_ENV, validateArtifactSigningEnvironment } from './check-artifact-signing-config.mjs';

it('accepts a complete Artifact Signing OIDC configuration without exposing values', () => {
  const env = Object.fromEntries(REQUIRED_ARTIFACT_SIGNING_ENV.map((name) => [name, 'configured']));
  env.ARTIFACT_SIGNING_ENDPOINT = 'https://eus.codesigning.azure.net/';

  expect(validateArtifactSigningEnvironment(env)).toEqual({ missing: [] });
});

it('reports missing values and rejects a non-HTTPS endpoint', () => {
  expect(validateArtifactSigningEnvironment({})).toEqual({ missing: REQUIRED_ARTIFACT_SIGNING_ENV });
  const env = Object.fromEntries(REQUIRED_ARTIFACT_SIGNING_ENV.map((name) => [name, 'configured']));
  env.ARTIFACT_SIGNING_ENDPOINT = 'http://codesigning.example.test/';
  expect(validateArtifactSigningEnvironment(env)).toEqual({ invalidEndpoint: true, missing: [] });
});
