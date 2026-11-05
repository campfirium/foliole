import { allPages, readPlayRegistration } from '../mobile/mobile-candidate-read.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';

export async function readPrebuiltPlayCandidate(github, row) {
  const reservation = await readPlayPreparation(github, row);
  if (reservation.phase !== 'cleared' || !reservation.versionCode) throw new Error('Prepared Play version is not durably reserved');
  const artifacts = await allPages(github, `actions/runs/${row.payload.runId}/artifacts`, 'artifacts');
  const signed = artifacts.filter(item => new RegExp(`^android-play-${row.payload.runId}-[1-9]\\d*-signed$`, 'u').test(item.name))
    .sort((a, b) => Number(b.name.split('-').at(-2)) - Number(a.name.split('-').at(-2)))[0];
  const payload = await readPlayRegistration(github, { runId: row.payload.runId,
    artifactName: signed?.name, registrarSha: row.payload.registrarSha });
  if (payload.candidate.schemaVersion !== 2 || payload.candidate.editId !== undefined ||
      payload.sourceSha !== row.payload.sourceSha || payload.candidate.version !== row.payload.version ||
      payload.candidate.versionCode !== reservation.versionCode ||
      payload.qualityArtifact.digest !== row.payload.qualityArtifact.digest) throw new Error('Prebuilt candidate differs from its reserved source');
  return payload;
}
