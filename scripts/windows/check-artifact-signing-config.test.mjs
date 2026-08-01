// @vitest-environment node

import { expect, it } from 'vitest';

import {
  REQUIRED_ARTIFACT_SIGNING_ENV,
  WINDOWS_RELEASE_PUBLISHER,
  validateArtifactSigningEnvironment
} from './check-artifact-signing-config.mjs';

function completeEnvironment() {
  const env = Object.fromEntries(REQUIRED_ARTIFACT_SIGNING_ENV.map((name) => [name, 'configured']));
  env.ARTIFACT_SIGNING_ENDPOINT = 'https://eus.codesigning.azure.net/';
  env.ARTIFACT_SIGNING_PUBLISHER_NAME = WINDOWS_RELEASE_PUBLISHER;
  return env;
}

it('accepts a complete Artifact Signing OIDC configuration without exposing values', () => {
  expect(validateArtifactSigningEnvironment(completeEnvironment())).toEqual({ missing: [] });
});

it('reports missing values and rejects a non-HTTPS endpoint', () => {
  expect(validateArtifactSigningEnvironment({})).toEqual({ missing: REQUIRED_ARTIFACT_SIGNING_ENV });
  const env = completeEnvironment();
  env.ARTIFACT_SIGNING_ENDPOINT = 'http://codesigning.example.test/';
  expect(validateArtifactSigningEnvironment(env)).toEqual({ invalidEndpoint: true, missing: [] });
});

it('rejects a release publisher identity change', () => {
  const env = completeEnvironment();
  env.ARTIFACT_SIGNING_PUBLISHER_NAME = 'Different Publisher';
  expect(validateArtifactSigningEnvironment(env)).toEqual({ invalidPublisher: true, missing: [] });
});
