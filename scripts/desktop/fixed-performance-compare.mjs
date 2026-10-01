import process from 'node:process';
import console from 'node:console';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compareBenchmarkReports, createBenchmarkReport } from './fixed-performance-report.mjs';

if (process.argv.length !== 4) throw new Error('Usage: npm run benchmark:desktop:compare -- <previous-output> <current-output>');
const [previous, current] = await Promise.all(process.argv.slice(2).map(createBenchmarkReport));
const report = compareBenchmarkReports(previous, current);
const output = path.resolve(process.argv[3], `comparison-${Date.now()}.json`);
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report }, null, 2));
process.exitCode = report.comparable ? 0 : 1;
