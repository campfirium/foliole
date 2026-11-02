/* global process */
import { runRemoteQualityPreflight } from './remote-quality-preflight.mjs';

const [base, head, scope] = process.argv.slice(2);
await runRemoteQualityPreflight({ cwd: process.cwd(), base, head, scope });
