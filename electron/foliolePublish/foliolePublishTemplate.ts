import { Liquid, LiquidError, type FS } from 'liquidjs';

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

export interface FoliolePublishTemplateTerm { name: string; slug: string }

export interface FoliolePublishTemplateCard {
  categories: FoliolePublishTemplateTerm[];
  content: string;
  fields: FoliolePublishTemplateField[];
  has_more: boolean;
  id: string;
  path: string;
  preview: string;
  published_at: string;
  tags: FoliolePublishTemplateTerm[];
  title: string;
  updated_at: string;
}

export interface FoliolePublishTemplateGroup { cards: FoliolePublishTemplateCard[]; label: string }

export interface FoliolePublishTemplateTaxonomyTerm extends FoliolePublishTemplateTerm { count: number }

export interface FoliolePublishTemplateSite {
  archive_url: string;
  cards: FoliolePublishTemplateCard[];
  categories_url: string;
  home_url: string;
  rss_url: string;
  search_url: string;
  tags_url: string;
  title: string;
  url: string;
}

export interface FoliolePublishTemplateNeighbor { title: string; url: string }

interface FoliolePublishTemplatePageBase {
  archive_url: string;
  cards: FoliolePublishTemplateCard[];
  categories_url: string;
  content: string;
  depth: '' | '../';
  fields: FoliolePublishTemplateField[];
  groups: FoliolePublishTemplateGroup[];
  has_visible_fields: boolean;
  home_url: string;
  id: string | null;
  is_home: boolean;
  newer: FoliolePublishTemplateNeighbor | null;
  newer_url: string | null;
  next_page_url: string | null;
  older: FoliolePublishTemplateNeighbor | null;
  older_url: string | null;
  previous_page_url: string | null;
  published_at: string | null;
  rss_url: string;
  search_url: string;
  tags_url: string;
  taxonomy_name: string | null;
  terms: FoliolePublishTemplateTaxonomyTerm[];
  title: string;
  updated_at: string | null;
  view: 'archive' | 'article' | 'categories' | 'category' | 'home' | 'search' | 'tag' | 'tags';
}

export type FoliolePublishTemplatePage = FoliolePublishTemplatePageBase & {
  kind: 'archive' | 'card';
};

export interface FoliolePublishTemplateScope {
  page: FoliolePublishTemplatePage;
  site: FoliolePublishTemplateSite;
}

function readableLiquidError(error: unknown, source: string) {
  if (!LiquidError.is(error)) return error;
  const [line, column] = error.token.getPosition();
  const detail = error.originalError?.message ?? error.message.replace(/, line:\d+, col:\d+$/u, '');
  return new Error(`Theme file ${source} has a Liquid error at line ${line}, column ${column}: ${detail}. Edit ${source}, then try again.`);
}

export function renderFoliolePublishTemplate(template: string, scope: FoliolePublishTemplateScope, source = 'template') {
  if (Buffer.byteLength(template, 'utf8') > FOLIOLE_TEMPLATE_MAX_BYTES) {
    throw new Error(`Theme file ${source} must be 256 KiB or smaller.`);
  }
  let output: string;
  try {
    output = String(engine.parseAndRenderSync(template, scope, {
      memoryLimit: FOLIOLE_TEMPLATE_MEMORY_LIMIT,
      renderLimit: FOLIOLE_TEMPLATE_RENDER_LIMIT_MS
    }));
  } catch (error) { throw readableLiquidError(error, source); }
  if (Buffer.byteLength(output, 'utf8') > FOLIOLE_TEMPLATE_MAX_OUTPUT_BYTES) {
    throw new Error(`Theme file ${source} rendered a page larger than 8 MiB.`);
  }
  return output;
}
