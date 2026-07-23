export const DEFAULT_THEME_STYLE_CONTENT = `.topic-stream { display: grid; gap: 76px; }
.topic-title, .article-title, .page-title, .year-title, .category-link { text-wrap: balance; }
.topic-title {
  margin: 0 0 15px;
  font-size: 20px;
  font-weight: 660;
  letter-spacing: -0.026em;
  line-height: 1.34;
}
.empty-topic-stream .topic-title { margin: 0; }
.topic-title a:hover, .continuation:hover, .index-title:hover, .category-link:hover,
.tag-link:hover, .meta a:hover, .search-results a:hover {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 5px;
}
.topic-segment { color: var(--body); font-size: 17px; line-height: 1.8; text-wrap: pretty; }
.topic-segment > * { margin: 0; }
.topic-segment > :last-child { display: inline; }
.continuation { display: inline; margin-left: 0.14em; color: var(--foreground); font-weight: 620; }

.pagination {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  margin-top: 92px;
}
.pagination + .global-nav { margin-top: 46px; }
.page-arrow { display: grid; width: 44px; height: 44px; place-items: center; font-size: 25px; line-height: 1; }
.page-arrow:hover { transform: translateX(var(--arrow-shift, 0)); }
.page-arrow.is-left { --arrow-shift: -3px; }
.page-arrow.is-right { --arrow-shift: 3px; margin-left: auto; }

.article-title { margin: 0; font-size: 26px; font-weight: 680; letter-spacing: -0.034em; line-height: 1.24; }
.prose { margin-top: 38px; color: #353735; font-size: 17px; line-height: 1.8; text-wrap: pretty; }
.prose > * { margin: 0 0 1.52em; }
.prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
  margin: 2.85em 0 0.78em;
  color: var(--foreground);
  font-weight: 670;
  letter-spacing: -0.024em;
  line-height: 1.38;
}
.prose h2 { font-size: 20px; }
.prose h3 { font-size: 18px; }
.prose blockquote { margin-inline: 0; color: var(--body); font-size: 18px; line-height: 1.76; }
.prose pre { overflow-x: auto; font-family: var(--font-mono); font-size: 0.88em; }
.prose code { font-family: var(--font-mono); font-size: 0.9em; }
.prose table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.prose th, .prose td { padding: 5px 14px 5px 0; text-align: left; }
.prose img, .prose video { max-width: 100%; height: auto; }

.meta {
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: 7px;
  margin-top: 82px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
}
.meta-row { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.meta-key { min-width: 62px; color: var(--faint); }
.meta-values { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.article-footer .global-nav { margin-top: 54px; }

.page-title { margin: 0; font-size: 25px; font-weight: 680; letter-spacing: -0.034em; line-height: 1.25; }
.year-groups { display: grid; gap: 58px; }
.year-group { display: grid; gap: 22px; }
.year-title { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.3; }
.index-list, .category-list, .search-results { display: grid; gap: 17px; margin: 0; padding: 0; list-style: none; }
.index-row { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: baseline; gap: 18px; }
.index-date { color: var(--faint); font-family: var(--font-mono); font-size: 12px; font-variant-numeric: tabular-nums; }
.index-title { font-size: 16px; font-weight: 520; line-height: 1.5; }
.category-list { gap: 25px; }
.category-link { font-size: 20px; font-weight: 590; letter-spacing: -0.022em; line-height: 1.4; }
.tag-cloud { display: flex; flex-wrap: wrap; align-items: baseline; gap: 18px 25px; }
.tag-link { color: var(--body); font-size: 17px; line-height: 1.4; }
.tag-link[data-count="1"] { color: var(--muted); font-size: 15px; }
.tag-link[data-count="3"] { color: var(--foreground); font-size: 20px; font-weight: 590; }

.search-form { margin: 0 0 52px; }
.search-field {
  width: 100%;
  padding: 0 0 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 22px;
}
.search-field::placeholder { color: var(--faint); }
.search-field::-webkit-search-cancel-button { opacity: 0.45; }
.search-help, .search-empty { margin: 9px 0 0; color: var(--faint); font-size: 12px; }
.search-results { gap: 21px; }
.search-results a { font-size: 17px; font-weight: 540; line-height: 1.45; }

@media (max-width: 720px) {
  .shell { width: min(calc(100% - 32px), var(--measure)); }
  .view { padding: 48px 0 88px; }
  .home-view .page-header { margin-bottom: 72px; }
  .home-title { font-size: 25px; }
  .topic-stream { gap: 62px; }
  .topic-title { margin-bottom: 12px; font-size: 19px; }
  .topic-segment { font-size: 16.5px; line-height: 1.8; }
  .pagination { margin-top: 70px; }
  .article-title, .page-title { font-size: 24px; }
  .prose { margin-top: 32px; font-size: 16.5px; line-height: 1.8; }
  .year-groups { gap: 48px; }
  .index-row { grid-template-columns: 48px minmax(0, 1fr); gap: 13px; }
  .index-date { font-size: 11px; }
  .index-title { font-size: 15.5px; }
  .tag-cloud { gap: 16px 21px; }
  .search-field { font-size: 20px; }
  .icon-link { width: 44px; height: 44px; }
  .global-nav { gap: 0; margin-left: -13px; }
  .page-header .global-nav { margin-right: -13px; }
}`;
