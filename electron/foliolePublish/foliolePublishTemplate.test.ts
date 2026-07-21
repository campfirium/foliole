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
      content: '<p>Safe body</p>',
      depth: '',
      fields: [{ key: '<author>', values: ['Roamer', '<Guest>'] }],
      has_visible_fields: true,
      kind: 'card',
      newer_url: null,
      older_url: 'cards/older.html',
      title: '<Title>'
    },
    site: {
      cards: [{
        id: 'card', path: 'cards/card.html',
        published_at: '2026-07-21T00:00:00.000Z', title: '<Card>', updated_at: '2026-07-21T00:00:00.000Z'
      }],
      title: '<Site>'
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

it('rejects templates beyond the file-size and output budgets', () => {
  expect(() => renderFoliolePublishTemplate('x'.repeat(FOLIOLE_TEMPLATE_MAX_BYTES + 1), scope()))
    .toThrow('256 KiB or smaller');
  const oversized = scope();
  oversized.page.content = 'x'.repeat(FOLIOLE_TEMPLATE_MAX_OUTPUT_BYTES + 1);
  expect(() => renderFoliolePublishTemplate('{{ page.content | raw }}', oversized))
    .toThrow('8 MiB or smaller');
});
