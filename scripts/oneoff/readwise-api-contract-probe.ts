import fs from 'node:fs';
import path from 'node:path';

import { resolveReaderBodyAncestor } from '../../lib/core/readwise/readwiseApiContract.js';

import {
  fetchReadwiseContract,
  probeRawSourceRefresh,
  summarizeFetchedContract
} from './readwise-api-contract-fetch.js';
import { auditLocalIdentity } from './readwise-api-local-identity.js';
import { readHiddenToken } from './readwise-api-secret.js';

interface ProbeArgs {
  database: string;
  output: string;
  sourceRoot: string;
  waitForExpiry: boolean;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = await readHiddenToken();
  if (!token) throw new Error('readwise_probe_token_required');
  console.error('Token accepted. Fetching paginated Reader and Export contracts...');
  const startedAt = Date.now();
  const contract = await fetchReadwiseContract(token);
  console.error(`Fetched ${contract.readerDocuments.length} Reader records in ${contract.requestCount} requests.`);
  const fetched = summarizeFetchedContract(contract);
  const ancestry = summarizeAncestry(contract.readerDocuments);
  console.error('Auditing local identity candidates with the read-only database...');
  const identity = auditLocalIdentity(args.database, args.sourceRoot, contract.readerDocuments);
  if (args.waitForExpiry) console.error('Checking raw sources; signed URL expiry may take up to one hour...');
  const rawSources = await probeRawSourceRefresh(token, contract.readerDocuments, {
    waitForExpiry: args.waitForExpiry
  });
  const report = {
    ancestry,
    contractVersion: 1,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    fetched,
    generatedAt: new Date().toISOString(),
    identity,
    minimumConditions: {
      idempotentIdentity: identity.remoteResolution.resolved > 0,
      ordinaryReadableBody: ordinaryBodyIsReadable(fetched.bodyByCategory),
      unmatchedHighlightCanBeRetained: true
    },
    rawSources
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({
    minimumConditions: report.minimumConditions,
    output: args.output,
    remoteResolution: identity.remoteResolution
  }));
}

function summarizeAncestry(documents: Awaited<ReturnType<typeof fetchReadwiseContract>>['readerDocuments']) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const counts: Record<string, number> = {};
  for (const document of documents) {
    if (document.category !== 'highlight' && document.category !== 'note') continue;
    const result = resolveReaderBodyAncestor(document.id, byId);
    const key = `${document.category}:${result.reason}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function ordinaryBodyIsReadable(body: Record<string, { readable: number; total: number }>) {
  const categories = ['article', 'rss'];
  return categories.some((category) => (body[category]?.readable ?? 0) > 0);
}

function parseArgs(argv: string[]): ProbeArgs {
  const values = new Map<string, string>();
  let waitForExpiry = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skip-expiry-wait') {
      waitForExpiry = false;
      continue;
    }
    if (!arg?.startsWith('--')) throw new Error(`readwise_probe_unknown_argument:${arg ?? ''}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`readwise_probe_missing_value:${arg}`);
    values.set(arg, value);
    index += 1;
  }
  const database = values.get('--database');
  const output = values.get('--output');
  const sourceRoot = values.get('--source-root');
  if (!database || !output || !sourceRoot) {
    throw new Error('usage: --database <foliole.db> --source-root <readwise-root> --output <report.json>');
  }
  return { database, output, sourceRoot, waitForExpiry };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'readwise_probe_failed');
  process.exitCode = 1;
});
