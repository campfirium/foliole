export const DEFAULT_PAGE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>{{ page.title }} — {{ site.title }}</title>
  <link rel="alternate" type="application/rss+xml" title="{{ site.title }} RSS" href="{{ page.rss_url }}">
  <link rel="stylesheet" href="{{ page.depth }}style.css">
</head>
<body data-foliole-publish-site data-page-kind="{{ page.kind }}"{% if page.archive_url %} data-archive-url="{{ page.archive_url }}"{% endif %}{% if page.newer_url %} data-newer-url="{{ page.newer_url }}"{% endif %}{% if page.older_url %} data-older-url="{{ page.older_url }}"{% endif %}>
  <header class="site-header">
    <a class="site-name" href="{{ page.home_url }}">{{ site.title }}</a>
    <nav class="site-nav" aria-label="Site">
      <a href="{{ page.archive_url }}">Archive</a>
      <a href="{{ page.rss_url }}">RSS</a>
    </nav>
  </header>
  <main class="page-shell">
    <article class="article">
      <header class="article-header">
        <div class="article-kicker">
          {% if page.is_home %}<span>Latest topic</span>{% endif %}
          <time datetime="{{ page.published_at }}">{{ page.published_at | date: "%B %d, %Y" }}</time>
        </div>
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
    <nav class="topic-navigation" aria-label="Topics">
      {% if page.newer %}<a class="topic-link newer" href="{{ page.newer.url }}"><span>Newer</span><strong>{{ page.newer.title }}</strong></a>{% else %}<span></span>{% endif %}
      {% if page.older %}<a class="topic-link older" href="{{ page.older.url }}"><span>Older</span><strong>{{ page.older.title }}</strong></a>{% endif %}
    </nav>
  </main>
  <footer class="site-footer">
    <span>Published with Foliole</span>
    <span class="keyboard-hint"><kbd>Space</kbd> older · <kbd>Shift</kbd> + <kbd>Space</kbd> newer · <kbd>Esc</kbd> archive</span>
  </footer>
  <script src="{{ page.depth }}site.js"></script>
</body>
</html>`;

export const DEFAULT_ARCHIVE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Archive — {{ site.title }}</title>
  <link rel="alternate" type="application/rss+xml" title="{{ site.title }} RSS" href="{{ page.rss_url }}">
  <link rel="stylesheet" href="{{ page.depth }}style.css">
</head>
<body data-foliole-publish-site data-page-kind="archive">
  <header class="site-header">
    <a class="site-name" href="{{ page.home_url }}">{{ site.title }}</a>
    <nav class="site-nav" aria-label="Site"><a aria-current="page" href="{{ page.archive_url }}">Archive</a><a href="{{ page.rss_url }}">RSS</a></nav>
  </header>
  <main class="page-shell archive-shell">
    <header class="archive-header"><p>Published topics</p><h1>Archive</h1><span>{{ site.cards.size }} topics, newest first.</span></header>
    <ol class="archive-list">
      {% for card in site.cards %}
      <li><a href="{{ page.depth }}{{ card.path }}"><span>{{ card.title }}</span><time datetime="{{ card.published_at }}">{{ card.published_at | date: "%B %d, %Y" }}</time></a></li>
      {% endfor %}
    </ol>
  </main>
  <footer class="site-footer"><span>Published with Foliole</span><a href="{{ page.rss_url }}">Follow via RSS</a></footer>
</body>
</html>`;
