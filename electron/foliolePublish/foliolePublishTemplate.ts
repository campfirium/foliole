import { Liquid, type FS } from 'liquidjs';

export const FOLIOLE_TEMPLATE_MAX_BYTES = 256 * 1024;
export const FOLIOLE_TEMPLATE_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const FOLIOLE_TEMPLATE_PARSE_LIMIT = 256 * 1024;
const FOLIOLE_TEMPLATE_RENDER_LIMIT_MS = 1_000;
const FOLIOLE_TEMPLATE_MEMORY_LIMIT = 16 * 1024 * 1024;

const deniedFileSystem: FS = {
  async exists() { return false; },
  existsSync() { return false; },
  async readFile() { throw new Error('Foliole Publish templates cannot read other files.'); },
  readFileSync() { throw new Error('Foliole Publish templates cannot read other files.'); },
  resolve(_directory, file) { return file; },
  async contains() { return false; },
  containsSync() { return false; }
};

const engine = new Liquid({
  dynamicPartials: false,
  fs: deniedFileSystem,
  memoryLimit: FOLIOLE_TEMPLATE_MEMORY_LIMIT,
  outputEscape: 'escape',
  ownPropertyOnly: true,
  parseLimit: FOLIOLE_TEMPLATE_PARSE_LIMIT,
  relativeReference: false,
  renderLimit: FOLIOLE_TEMPLATE_RENDER_LIMIT_MS,
  strictFilters: true,
  strictVariables: true
});

export interface FoliolePublishTemplateField {
  key: string;
  values: string[];
}

export interface FoliolePublishTemplateSite {
  cards: Array<{
    id: string;
    path: string;
    published_at: string;
    title: string;
    updated_at: string;
  }>;
  title: string;
}

interface FoliolePublishTemplatePageBase {
  archive_url: string | null;
  content: string;
  depth: '' | '../';
  fields: FoliolePublishTemplateField[];
  has_visible_fields: boolean;
  newer_url: string | null;
  older_url: string | null;
  title: string;
}

export type FoliolePublishTemplatePage = FoliolePublishTemplatePageBase & {
  kind: 'archive' | 'card';
};

export interface FoliolePublishTemplateScope {
  page: FoliolePublishTemplatePage;
  site: FoliolePublishTemplateSite;
}

export function renderFoliolePublishTemplate(template: string, scope: FoliolePublishTemplateScope) {
  if (Buffer.byteLength(template, 'utf8') > FOLIOLE_TEMPLATE_MAX_BYTES) {
    throw new Error('Foliole Publish templates must be 256 KiB or smaller.');
  }
  const output = String(engine.parseAndRenderSync(template, scope, {
    memoryLimit: FOLIOLE_TEMPLATE_MEMORY_LIMIT,
    renderLimit: FOLIOLE_TEMPLATE_RENDER_LIMIT_MS
  }));
  if (Buffer.byteLength(output, 'utf8') > FOLIOLE_TEMPLATE_MAX_OUTPUT_BYTES) {
    throw new Error('Rendered Foliole Publish pages must be 8 MiB or smaller.');
  }
  return output;
}
