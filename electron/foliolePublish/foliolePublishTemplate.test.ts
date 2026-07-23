import { expect, it } from 'vitest';

import {
  FOLIOLE_TEMPLATE_MAX_BYTES,
  FOLIOLE_TEMPLATE_MAX_OUTPUT_BYTES,
  renderFoliolePublishTemplate,
  type FoliolePublishTemplateScope
} from './foliolePublishTemplate.js';

function scope(): FoliolePublishTemplateScope {
  return {
    page: {
      archive_url: 'archive.html',
      cards: [],
      categories_url: 'categories.html',
      content: '<p>Safe body</p>',
      depth: '',
      fields: [{ key: '<author>', values: ['Roamer', '<Guest>'] }],
      groups: [],
      has_visible_fields: true,
      home_url: 'index.html',
      id: 'card',
      is_home: true,
      kind: 'card',
      newer: null,
      newer_url: null,
      next_page_url: null,
      older: { title: 'Older', url: 'cards/older.html' },
      older_url: 'cards/older.html',
      previous_page_url: null,
      published_at: '2026-07-21T00:00:00.000Z',
      rss_url: 'rss.xml',
      search_url: 'search.html',
      tags_url: 'tags.html',
      taxonomy_name: null,
      terms: [],
      title: '<Title>',
      updated_at: '2026-07-21T00:00:00.000Z',
      view: 'home'
    },
    site: {
      archive_url: 'archive.html',
      cards: [{
        categories: [], content: '<p>Card</p>', fields: [], has_more: false,
        id: 'card', path: 'cards/card.html', preview: '<p>Card</p>',
        published_at: '2026-07-21T00:00:00.000Z', tags: [], title: '<Card>', updated_at: '2026-07-21T00:00:00.000Z'
      }],
      categories_url: 'categories.html',
      home_url: 'index.html',
      rss_url: 'rss.xml',
      search_url: 'search.html',
      tags_url: 'tags.html',
      title: '<Site>',
      url: 'https://example.com'
    }
  };
}

it('renders Liquid loops and conditions while escaping ordinary output', () => {
  const template = '{% if page.has_visible_fields %}{% for field in page.fields %}{{ field.key }}={{ field.values | join: "," }}{% endfor %}{% endif %}|{{ page.title }}|{{ page.content | raw }}';
  expect(renderFoliolePublishTemplate(template, scope())).toBe(
    '&lt;author&gt;=Roamer,&lt;Guest&gt;|&lt;Title&gt;|<p>Safe body</p>'
  );
});

it.each([
  ['unknown variable', '{{ missing }}'],
  ['unknown filter', '{{ page.title | missing_filter }}'],
  ['prototype property', '{{ page.constructor }}'],
  ['include', '{% include "partial.html" %}'],
  ['render', '{% render "partial.html" %}'],
  ['layout', '{% layout "partial.html" %}']
])('rejects %s access', (_label, template) => {
  expect(() => renderFoliolePublishTemplate(template, scope())).toThrow();
});

it('identifies the editable file and exact location for Liquid errors', () => {
  expect(() => renderFoliolePublishTemplate('before\n{{ missing }}', scope(), 'page.html')).toThrow(
    'Theme file page.html has a Liquid error at line 2, column 4: undefined variable: missing. Edit page.html, then try again.'
  );
});

it('rejects templates beyond the file-size and output budgets', () => {
  expect(() => renderFoliolePublishTemplate('x'.repeat(FOLIOLE_TEMPLATE_MAX_BYTES + 1), scope()))
    .toThrow('Theme file template must be 256 KiB or smaller');
  const oversized = scope();
  oversized.page.content = 'x'.repeat(FOLIOLE_TEMPLATE_MAX_OUTPUT_BYTES + 1);
  expect(() => renderFoliolePublishTemplate('{{ page.content | raw }}', oversized))
    .toThrow('Theme file template rendered a page larger than 8 MiB');
});
