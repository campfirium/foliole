#!/usr/bin/env node
/* global console, process */

import { URL } from 'node:url';

export const REQUIRED_ARTIFACT_SIGNING_ENV = [
  'ARTIFACT_SIGNING_ACCOUNT_NAME',
  'ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME',
  'ARTIFACT_SIGNING_ENDPOINT',
  'ARTIFACT_SIGNING_PUBLISHER_NAME',
  'AZURE_CLIENT_ID',
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_TENANT_ID'
];
export const WINDOWS_RELEASE_PUBLISHER = 'CAMPFIRIUM LTD';

export function validateArtifactSigningEnvironment(env) {
  const missing = REQUIRED_ARTIFACT_SIGNING_ENV.filter((name) => !env[name]?.trim());
  if (missing.length) return { missing };
  if (env.ARTIFACT_SIGNING_PUBLISHER_NAME.trim() !== WINDOWS_RELEASE_PUBLISHER) {
    return { invalidPublisher: true, missing: [] };
  }
  try {
    const endpoint = new URL(env.ARTIFACT_SIGNING_ENDPOINT);
    if (endpoint.protocol !== 'https:') return { invalidEndpoint: true, missing: [] };
  } catch {
    return { invalidEndpoint: true, missing: [] };
  }
  return { missing: [] };
}

if (process.argv[1] && process.argv[1].endsWith('check-artifact-signing-config.mjs')) {
  const result = validateArtifactSigningEnvironment(process.env);
  if (result.missing.length || result.invalidEndpoint || result.invalidPublisher) {
    console.error(`[artifact-signing-config] status: FAILED missing=${result.missing.join(',')} invalid_endpoint=${Boolean(result.invalidEndpoint)} invalid_publisher=${Boolean(result.invalidPublisher)}`);
    process.exitCode = 1;
  } else {
    console.log('[artifact-signing-config] status: OK');
  }
}
