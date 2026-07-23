export const DEFAULT_THEME_SCRIPT = `document.documentElement.dataset.foliolePublish = 'ready';

const form = document.querySelector('[data-search-form]');
const input = form?.querySelector('input[type="search"]');
const results = document.querySelector('[data-search-results]');
const empty = document.querySelector('[data-search-empty]');
const index = Array.isArray(window.__FOLIOLE_SEARCH_INDEX__) ? window.__FOLIOLE_SEARCH_INDEX__ : [];

function normalized(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().trim();
}

function clearResults() {
  results?.replaceChildren();
  if (empty) empty.hidden = true;
}

function renderResults(query) {
  clearResults();
  const needle = normalized(query);
  if (!needle || !results) return;
  const matches = index.filter((item) => normalized(item.text).includes(needle));
  matches.forEach((item) => {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    row.append(link);
    results.append(row);
  });
  if (empty) empty.hidden = matches.length > 0;
}

if (form && input) {
  const initial = new URLSearchParams(window.location.search).get('q') ?? '';
  input.value = initial;
  renderResults(initial);
  input.addEventListener('input', () => renderResults(input.value));
  form.addEventListener('submit', (event) => { event.preventDefault(); renderResults(input.value); });
}`;
