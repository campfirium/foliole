const SITE_NAV = `<nav class="global-nav" aria-label="Site navigation">
  <a class="icon-link" href="{{ page.home_url }}"{% if page.view == "home" %} aria-current="page"{% endif %} aria-label="Home" title="Home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9H5v-9"></path><path d="M9.5 19v-5h5v5"></path></svg></a>
  <a class="icon-link" href="{{ page.search_url }}"{% if page.view == "search" %} aria-current="page"{% endif %} aria-label="Search" title="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8"></circle><path d="m15.2 15.2 4.3 4.3"></path></svg></a>
  <a class="icon-link" href="{{ page.archive_url }}"{% if page.view == "archive" %} aria-current="page"{% endif %} aria-label="Archive" title="Archive"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16"></path><path d="M5.5 7.5v11h13v-11"></path><path d="M8.5 11.5h7"></path><path d="M4 4.5h16v3H4z"></path></svg></a>
  <a class="icon-link" href="{{ page.categories_url }}"{% if page.view == "categories" or page.view == "category" %} aria-current="page"{% endif %} aria-label="Categories" title="Categories"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7h6l2 2h9v9.5h-17z"></path></svg></a>
  <a class="icon-link" href="{{ page.tags_url }}"{% if page.view == "tags" or page.view == "tag" %} aria-current="page"{% endif %} aria-label="Tags" title="Tags"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7l9 9-6 6-9-9z"></path><circle cx="8.5" cy="9.5" r="1"></circle></svg></a>
  <a class="icon-link" href="{{ page.rss_url }}" aria-label="RSS feed" title="RSS feed"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="18.5" r="1"></circle><path d="M5 11a8 8 0 0 1 8 8"></path><path d="M5 5a14 14 0 0 1 14 14"></path></svg></a>
</nav>`;

const HEAD = `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="generator" content="Foliole">
  <link rel="alternate" type="application/rss+xml" title="{{ site.title }} RSS" href="{{ page.rss_url }}">
  <link rel="stylesheet" href="{{ page.depth }}style.css">`;

export const DEFAULT_PAGE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  ${HEAD}
  <title>{% if page.view == "home" %}{{ site.title }}{% else %}{{ page.title }} — {{ site.title }}{% endif %}</title>
</head>
<body data-foliole-publish-site data-page-kind="{{ page.view }}">
  <main class="shell" id="main">
    {% if page.view == "home" %}
    <section class="view home-view">
      <header class="page-header"><h1 class="home-title">{{ site.title }}</h1>${SITE_NAV}</header>
      {% if page.cards.size > 0 %}
      <div class="topic-stream">
        {% for card in page.cards %}
        <article class="topic-card">
          <h2 class="topic-title"><a href="{{ page.depth }}{{ card.path }}">{{ card.title }}</a></h2>
          {% if card.preview != "" %}<div class="topic-segment">{{ card.preview | raw }}{% if card.has_more %}<a class="continuation" href="{{ page.depth }}{{ card.path }}" aria-label="Read {{ card.title }}">…</a>{% endif %}</div>{% endif %}
        </article>
        {% endfor %}
      </div>
      {% else %}
      <p class="sr-only">No published topics.</p>
      <div class="topic-stream empty-topic-stream" aria-hidden="true">
        <h2 class="topic-title">Writing</h2>
        <h2 class="topic-title">Thinking</h2>
        <h2 class="topic-title">Reading</h2>
      </div>
      {% endif %}
      {% if page.previous_page_url or page.next_page_url %}
      <nav class="pagination" aria-label="Pagination">
        {% if page.previous_page_url %}<a class="page-arrow is-left" href="{{ page.previous_page_url }}" rel="prev" aria-label="Newer page">←</a>{% endif %}
        {% if page.next_page_url %}<a class="page-arrow is-right" href="{{ page.next_page_url }}" rel="next" aria-label="Earlier page">→</a>{% endif %}
      </nav>
      {% endif %}
    </section>
    {% else %}
    <article class="view article-view">
      <h1 class="article-title">{{ page.title }}</h1>
      <div class="prose">{{ page.content | raw }}</div>
      <footer class="article-footer">
        <div class="meta" aria-label="Topic information">
          <div class="meta-row"><span class="meta-key">Updated</span><time datetime="{{ page.updated_at }}">{{ page.updated_at | date: "%Y-%m-%d" }}</time></div>
          {% if page.id %}{% for card in site.cards %}{% if card.id == page.id %}
          {% if card.categories.size > 0 %}<div class="meta-row"><span class="meta-key">Category</span><span class="meta-values">{% for category in card.categories %}<a href="{{ page.depth }}categories/{{ category.slug }}.html">{{ category.name }}</a>{% endfor %}</span></div>{% endif %}
          {% if card.tags.size > 0 %}<div class="meta-row"><span class="meta-key">Tags</span><span class="meta-values">{% for tag in card.tags %}<a href="{{ page.depth }}tags/{{ tag.slug }}.html">#{{ tag.name }}</a>{% endfor %}</span></div>{% endif %}
          {% endif %}{% endfor %}{% endif %}
        </div>
        ${SITE_NAV}
      </footer>
    </article>
    {% endif %}
  </main>
  <script src="{{ page.depth }}site.js"></script>
</body>
</html>`;

export const DEFAULT_ARCHIVE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  ${HEAD}
  <title>{{ page.title }} — {{ site.title }}</title>
</head>
<body data-foliole-publish-site data-page-kind="{{ page.view }}">
  <main class="shell" id="main">
    <section class="view index-view">
      <header class="page-header"><h1 class="page-title">{{ page.title }}</h1>${SITE_NAV}</header>
      {% if page.view == "archive" or page.view == "category" or page.view == "tag" %}
      <div class="year-groups">
        {% for group in page.groups %}<section class="year-group"><h2 class="year-title">{{ group.label }}</h2><ol class="index-list">
          {% for card in group.cards %}<li class="index-row"><time class="index-date" datetime="{{ card.updated_at }}">{{ card.updated_at | date: "%m-%d" }}</time><a class="index-title" href="{{ page.depth }}{{ card.path }}">{{ card.title }}</a></li>{% endfor %}
        </ol></section>{% endfor %}
      </div>
      {% elsif page.view == "categories" %}
      <ul class="category-list">{% for term in page.terms %}<li><a class="category-link" href="categories/{{ term.slug }}.html">{{ term.name }}</a></li>{% endfor %}</ul>
      {% elsif page.view == "tags" %}
      <div class="tag-cloud">{% for term in page.terms %}<a class="tag-link" data-count="{{ term.count }}" href="tags/{{ term.slug }}.html">#{{ term.name }}</a>{% endfor %}</div>
      {% elsif page.view == "search" %}
      <form class="search-form" data-search-form role="search"><label class="sr-only" for="site-search">Search published topics</label><input class="search-field" id="site-search" name="q" type="search" autocomplete="off" placeholder="Search published topics"><p class="search-help">Search titles, content, categories, and tags.</p></form>
      <ol class="search-results" data-search-results aria-live="polite"></ol><p class="search-empty" data-search-empty hidden>No topics found.</p>
      {% endif %}
    </section>
  </main>
  {% if page.view == "search" %}<script src="{{ page.depth }}search-index.js"></script>{% endif %}
  <script src="{{ page.depth }}site.js"></script>
</body>
</html>`;
