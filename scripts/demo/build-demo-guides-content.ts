import path from 'node:path';

import { buildDemoGuidesContent } from './demo-guides-content.ts';
import { buildGuidedSampleContent } from './guided-sample-content.ts';

const DEFAULT_CONTENT_ROOT = 'docs/i18n/guides';
const DEFAULT_OUTPUT_PATH = 'src/demo/generated/demoPacks.ts';
const DEFAULT_GUIDED_OUTPUT_PATH = 'src/features/guidedSample/generated/guidedSamplePacks.ts';

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`Invalid argument: ${name ?? ''}`);
    flags.set(name.slice(2), value);
    index += 1;
  }
  return {
    contentRoot: flags.get('content-root') ?? DEFAULT_CONTENT_ROOT,
    guidedOutputPath: flags.get('guided-output') ?? DEFAULT_GUIDED_OUTPUT_PATH,
    outputPath: flags.get('output') ?? DEFAULT_OUTPUT_PATH
  };
}

const args = parseArgs(process.argv.slice(2));
Promise.all([
  buildDemoGuidesContent(args),
  buildGuidedSampleContent({ contentRoot: args.contentRoot, outputPath: args.guidedOutputPath })
]).then(([packs]) => {
  const locales = Object.keys(packs).sort().join(', ');
  console.log(`[guides] generated ${path.normalize(args.outputPath)} and ${path.normalize(args.guidedOutputPath)} for ${locales}`);
}).catch((error) => {
  console.error(`[guides] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
