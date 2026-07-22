export const DEFAULT_PAGE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>{% if page.is_home %}{{ site.title }}{% else %}{{ page.title }} — {{ site.title }}{% endif %}</title>
  <link rel="alternate" type="application/rss+xml" title="{{ site.title }} RSS" href="{{ page.rss_url }}">
  <link rel="stylesheet" href="{{ page.depth }}style.css">
</head>
<body data-foliole-publish-site data-page-kind="{{ page.kind }}">
  <header class="site-header">
    <a class="site-name" href="{{ page.home_url }}">{{ site.title }}</a>
    <nav class="site-nav" aria-label="Site">
      <a{% if page.is_home %} aria-current="page"{% endif %} href="{{ page.home_url }}">Topics</a>
      <a href="{{ page.rss_url }}">RSS</a>
    </nav>
  </header>
  {% if page.is_home %}
  <main class="page-shell topics-shell">
    <header class="topics-header">
      <h1>Topics</h1>
      <p>{{ site.cards.size }} published, newest first.</p>
    </header>
    <ol class="topic-list">
      {% for card in site.cards %}
      <li><a href="{{ card.path }}"><span>{{ card.title }}</span><time datetime="{{ card.published_at }}">{{ card.published_at | date: "%b %d, %Y" }}</time></a></li>
      {% endfor %}
    </ol>
  </main>
  {% else %}
  <main class="page-shell article-shell">
    <article class="article">
      <header class="article-header">
        <time datetime="{{ page.published_at }}">{{ page.published_at | date: "%B %d, %Y" }}</time>
        <h1>{{ page.title }}</h1>
        {% if page.has_visible_fields %}
        <dl class="fields">
          {% for field in page.fields %}{% if field.values.size > 0 %}
          <div class="field"><dt>{{ field.key }}</dt><dd>{% for value in field.values %}<span>{{ value }}</span>{% endfor %}</dd></div>
          {% endif %}{% endfor %}
        </dl>
        {% endif %}
      </header>
      <div class="prose">{{ page.content | raw }}</div>
    </article>
    <a aria-label="All topics" class="back-link" href="{{ page.home_url }}"><span aria-hidden="true">←</span>All topics</a>
  </main>
  {% endif %}
  <footer class="site-footer"><span>Published with Foliole</span><a href="{{ page.rss_url }}">RSS</a></footer>
  <script src="{{ page.depth }}site.js"></script>
</body>
</html>`;

export const DEFAULT_ARCHIVE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Topics — {{ site.title }}</title>
  <link rel="alternate" type="application/rss+xml" title="{{ site.title }} RSS" href="{{ page.rss_url }}">
  <link rel="stylesheet" href="{{ page.depth }}style.css">
</head>
<body data-foliole-publish-site data-page-kind="archive">
  <header class="site-header">
    <a class="site-name" href="{{ page.home_url }}">{{ site.title }}</a>
    <nav class="site-nav" aria-label="Site"><a aria-current="page" href="{{ page.home_url }}">Topics</a><a href="{{ page.rss_url }}">RSS</a></nav>
  </header>
  <main class="page-shell topics-shell">
    <header class="topics-header"><h1>Topics</h1><p>{{ site.cards.size }} published, newest first.</p></header>
    <ol class="topic-list">
      {% for card in site.cards %}
      <li><a href="{{ page.depth }}{{ card.path }}"><span>{{ card.title }}</span><time datetime="{{ card.published_at }}">{{ card.published_at | date: "%b %d, %Y" }}</time></a></li>
      {% endfor %}
    </ol>
  </main>
  <footer class="site-footer"><span>Published with Foliole</span><a href="{{ page.rss_url }}">RSS</a></footer>
</body>
</html>`;
