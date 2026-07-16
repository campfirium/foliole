#!/usr/bin/env node
/* global console, process */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { validateArtifactSigningEnvironment } from './check-artifact-signing-config.mjs';

export const ARTIFACT_SIGNING_BUILDER_CONFIG = '.tmp/electron-builder-artifact-signing.json';

export function createArtifactSigningBuilderConfig(base, env) {
  const validation = validateArtifactSigningEnvironment(env);
  if (validation.missing.length || validation.invalidEndpoint) {
    throw new Error('Artifact Signing environment is incomplete');
  }
  return {
    ...base,
    forceCodeSigning: true,
    win: {
      ...base.win,
      azureSignOptions: {
        certificateProfileName: env.ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME,
        codeSigningAccountName: env.ARTIFACT_SIGNING_ACCOUNT_NAME,
        endpoint: env.ARTIFACT_SIGNING_ENDPOINT,
        fileDigest: 'SHA256',
        publisherName: env.ARTIFACT_SIGNING_PUBLISHER_NAME,
        timestampDigest: 'SHA256',
        timestampRfc3161: 'http://timestamp.acs.microsoft.com'
      },
      verifyUpdateCodeSignature: true
    }
  };
}

function main() {
  const outputPath = path.resolve(ARTIFACT_SIGNING_BUILDER_CONFIG);
  const base = JSON.parse(readFileSync(path.resolve('electron/builder.json'), 'utf8'));
  const config = createArtifactSigningBuilderConfig(base, process.env);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`[artifact-signing-builder-config] status: OK path=${ARTIFACT_SIGNING_BUILDER_CONFIG}`);
}

if (process.argv[1] && process.argv[1].endsWith('write-artifact-signing-builder-config.mjs')) {
  try {
    main();
  } catch (error) {
    console.error(`[artifact-signing-builder-config] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
