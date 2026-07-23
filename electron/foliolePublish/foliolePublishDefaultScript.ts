export const DEFAULT_THEME_SCRIPT = `document.documentElement.dataset.foliolePublish = 'ready';

document.addEventListener('click', (event) => {
  if (window.location.protocol !== 'file:' || event.defaultPrevented || event.button !== 0 ||
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (!link || link.target || link.hasAttribute('download')) return;
  const target = new URL(link.href);
  if (target.protocol !== 'file:' || !target.pathname.endsWith('/')) return;
  event.preventDefault();
  window.location.href = target.href + 'index.html';
});

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
}

const activity = document.querySelector('[data-empty-publish-activity]');
const activityWord = activity?.querySelector('[data-empty-publish-word]');
const activityPhrases = ['Reading', 'Thinking', 'Writing'];
let activityTimer = 0;
let activityCharacter = 0;
let activityPhraseIndex = 0;

function scheduleActivity(callback, delay) {
  window.clearTimeout(activityTimer);
  activityTimer = window.setTimeout(callback, delay);
}

function typeActivity() {
  if (!activityWord || document.hidden) return;
  const phrase = activityPhrases[activityPhraseIndex];
  activityCharacter += 1;
  const word = phrase.slice(0, activityCharacter);
  activityWord.textContent = activityCharacter === phrase.length ? word + '...' : word;
  if (activityCharacter < phrase.length) return scheduleActivity(typeActivity, 170);
  scheduleActivity(nextActivity, 2600);
}

function nextActivity() {
  if (!activityWord) return;
  activityWord.textContent = '';
  activityCharacter = 0;
  activityPhraseIndex = (activityPhraseIndex + 1) % activityPhrases.length;
  scheduleActivity(typeActivity, 700);
}

if (activityWord) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    activityWord.textContent = 'Reading...';
  } else {
    activityWord.textContent = '';
    scheduleActivity(typeActivity, 650);
    document.addEventListener('visibilitychange', () => {
      window.clearTimeout(activityTimer);
      if (!document.hidden) nextActivity();
    });
  }
}`;
