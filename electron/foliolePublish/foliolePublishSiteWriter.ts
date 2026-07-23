import fs from 'node:fs';
import path from 'node:path';

import type { FoliolePublishIndex } from './foliolePublishModel.js';
import {
  groupTopicsByUpdatedYear,
  projectPublishedTopics,
  searchIndexScript,
  taxonomyIndex,
  topicsForTerm,
  type FoliolePublishProjectedTopic,
  type FoliolePublishTopicSource
} from './foliolePublishSiteProjection.js';
import {
  renderFoliolePublishTemplate,
  type FoliolePublishTemplatePage,
  type FoliolePublishTemplateSite,
  type FoliolePublishTemplateTaxonomyTerm
} from './foliolePublishTemplate.js';

type Theme = Record<'archive.html' | 'page.html' | 'site.js' | 'style.css', string>;

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function siteScope(index: FoliolePublishIndex, topics: FoliolePublishProjectedTopic[], url: string): FoliolePublishTemplateSite {
  return {
    archive_url: 'archive/', categories_url: 'categories/', home_url: './',
    rss_url: 'rss.xml', search_url: 'search/', tags_url: 'tags/',
    title: index.site.title, topics, url
  };
}

function pageScope(args: {
  depth?: '' | '../' | '../../'; featured?: FoliolePublishProjectedTopic | undefined;
  groups?: ReturnType<typeof groupTopicsByUpdatedYear>; next?: string | undefined; previous?: string | undefined;
  site: FoliolePublishTemplateSite; taxonomyName?: string; terms?: FoliolePublishTemplateTaxonomyTerm[];
  title: string; topics?: FoliolePublishProjectedTopic[]; view: FoliolePublishTemplatePage['view'];
}): FoliolePublishTemplatePage {
  const depth = args.depth ?? '';
  const featured = args.featured;
  return {
    archive_url: `${depth}archive/`, categories_url: `${depth}categories/`,
    content: featured?.content ?? '', depth, fields: featured?.fields ?? [], groups: args.groups ?? [],
    has_visible_fields: Boolean(featured?.fields.some((field) => field.values.length > 0)),
    home_url: depth || './', id: featured?.id ?? null,
    is_home: args.view === 'home', kind: args.view === 'article' || args.view === 'home' ? 'topic' : 'archive',
    newer: null, newer_url: null, next_page_url: args.next ?? null, older: null, older_url: null,
    previous_page_url: args.previous ?? null, published_at: featured?.published_at ?? null,
    rss_url: `${depth}rss.xml`, search_url: `${depth}search/`, tags_url: `${depth}tags/`,
    taxonomy_name: args.taxonomyName ?? null, terms: args.terms ?? [], title: args.title, topics: args.topics ?? [],
    updated_at: featured?.updated_at ?? null, view: args.view
  };
}

function render(template: string, page: FoliolePublishTemplatePage, site: FoliolePublishTemplateSite, source: string) {
  return renderFoliolePublishTemplate(template, { page, site }, source);
}

function write(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function writeHomePages(root: string, topics: FoliolePublishProjectedTopic[], site: FoliolePublishTemplateSite, template: string) {
  const pageSize = 5;
  const count = Math.max(1, Math.ceil(topics.length / pageSize));
  for (let index = 0; index < count; index += 1) {
    const pageTopics = topics.slice(index * pageSize, (index + 1) * pageSize);
    const filename = index === 0 ? 'index.html' : `page-${index + 1}.html`;
    const previous = index === 0 ? undefined : index === 1 ? 'index.html' : `page-${index}.html`;
    const next = index + 1 < count ? `page-${index + 2}.html` : undefined;
    const page = pageScope({ featured: pageTopics[0] ?? topics[0], next, previous, site, title: site.title, topics: pageTopics, view: 'home' });
    if (index === 0 && topics[1]) {
      page.older = { title: topics[1].title, url: topics[1].path };
      page.older_url = page.older.url;
    }
    write(path.join(root, filename), render(template, page, site, 'page.html'));
  }
}

function writeTopics(root: string, topics: FoliolePublishProjectedTopic[], site: FoliolePublishTemplateSite, template: string) {
  topics.forEach((topic, index) => {
    const page = pageScope({ depth: '../../', featured: topic, site, title: topic.title, view: 'article' });
    const neighbor = (item: FoliolePublishProjectedTopic | undefined) => item
      ? { title: item.title, url: `../../${item.path}` } : null;
    page.newer = neighbor(topics[index - 1]);
    page.newer_url = page.newer?.url ?? null;
    page.older = neighbor(topics[index + 1]);
    page.older_url = page.older?.url ?? null;
    write(path.join(root, topic.path, 'index.html'), render(template, page, site, 'page.html'));
  });
}

function writeTaxonomy(root: string, topics: FoliolePublishProjectedTopic[], site: FoliolePublishTemplateSite, template: string, key: 'categories' | 'tags') {
  const terms = taxonomyIndex(topics, key);
  const view = key === 'categories' ? 'categories' : 'tags';
  const resultView = key === 'categories' ? 'category' : 'tag';
  write(path.join(root, key, 'index.html'), render(template, pageScope({ depth: '../', site, terms, title: key === 'categories' ? 'Categories' : 'Tags', view }), site, 'archive.html'));
  terms.forEach((term) => {
    const selected = topicsForTerm(topics, key, term.slug);
    const page = pageScope({ depth: '../../', groups: groupTopicsByUpdatedYear(selected), site, taxonomyName: term.name, title: term.name, topics: selected, view: resultView });
    write(path.join(root, key, term.slug, 'index.html'), render(template, page, site, 'archive.html'));
  });
}

function rss(topics: FoliolePublishProjectedTopic[], site: FoliolePublishTemplateSite) {
  const items = topics.map((topic) => {
    const url = `${site.url}/topics/${topic.id}/`;
    const description = topic.content.replaceAll(']]>', ']]]]><![CDATA[>');
    return `<item><title>${escapeHtml(topic.title)}</title><link>${escapeHtml(url)}</link><guid>${escapeHtml(url)}</guid><pubDate>${new Date(topic.updated_at).toUTCString()}</pubDate><description><![CDATA[${description}]]></description></item>`;
  }).join('');
  const lastBuildDate = topics[0] ? `<lastBuildDate>${new Date(topics[0].updated_at).toUTCString()}</lastBuildDate>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(site.title)}</title><link>${escapeHtml(`${site.url}/`)}</link><description>Topics published with Foliole.</description>${lastBuildDate}<generator>Foliole Publish</generator>${items}</channel></rss>`;
}

function notFoundPage(site: FoliolePublishTemplateSite) {
  const title = escapeHtml(site.title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="generator" content="Foliole">
  <link rel="stylesheet" href="/style.css">
  <title>Page not found — ${title}</title>
</head>
<body data-foliole-publish-site data-page-kind="not-found">
  <main class="shell"><article class="view article-view">
    <h1 class="article-title">Page not found</h1>
    <div class="prose"><p>This page is not available.</p><p><a href="/">Return home</a></p></div>
  </article></main>
</body>
</html>`;
}

export function writeFoliolePublishSite(args: {
  index: FoliolePublishIndex; publicAddress: string; root: string; sources: FoliolePublishTopicSource[]; theme: Theme;
}) {
  const topics = projectPublishedTopics(args.sources);
  const site = siteScope(args.index, topics, args.publicAddress);
  writeHomePages(args.root, topics, site, args.theme['page.html']);
  writeTopics(args.root, topics, site, args.theme['page.html']);
  const archive = pageScope({ depth: '../', groups: groupTopicsByUpdatedYear(topics), site, title: 'Archive', topics, view: 'archive' });
  write(path.join(args.root, 'archive', 'index.html'), render(args.theme['archive.html'], archive, site, 'archive.html'));
  writeTaxonomy(args.root, topics, site, args.theme['archive.html'], 'categories');
  writeTaxonomy(args.root, topics, site, args.theme['archive.html'], 'tags');
  const search = pageScope({ depth: '../', site, title: 'Search', view: 'search' });
  write(path.join(args.root, 'search', 'index.html'), render(args.theme['archive.html'], search, site, 'archive.html'));
  write(path.join(args.root, '404.html'), notFoundPage(site));
  write(path.join(args.root, 'search-index.js'), searchIndexScript(topics));
  write(path.join(args.root, 'style.css'), args.theme['style.css']);
  write(path.join(args.root, 'site.js'), args.theme['site.js']);
  write(path.join(args.root, 'rss.xml'), rss(topics, site));
}
