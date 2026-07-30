/* global Event, HTMLInputElement, MutationObserver, clearTimeout, devicePixelRatio, document, fetch, setTimeout, window */

export async function runA5SecondarySearchAcceptance(config, helpers, leafTitle) {
  const { click, firstVisible, record, visible, waitFor } = helpers;

  function setSearchQuery(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function runSearchQuery(input, surface, value, finalStatus) {
    return new Promise((resolve, reject) => {
      let sawLoading = false;
      const observer = new MutationObserver(() => {
        const status = surface.getAttribute('data-search-status');
        if (status === 'loading') sawLoading = true;
        if (!sawLoading || status !== finalStatus) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Search did not transition through loading to ${finalStatus}`));
      }, 10_000);
      observer.observe(surface, { attributes: true, attributeFilter: ['data-search-status'] });
      setSearchQuery(input, value);
    });
  }

  await click(firstVisible('[data-testid="companion-tab-search"]'), 'Search tab');
  const surface = await waitFor(
    () => firstVisible('[data-search-status="idle"]'), 'Search idle state'
  );
  const input = firstVisible('[data-testid="companion-search-input"]', surface);
  const rect = input.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const x = Math.round((rect.left + rect.width / 2) * dpr);
  const y = Math.round((rect.top + rect.height / 2) * dpr);
  await fetch(`${config.inputPath}?identity=${encodeURIComponent(config.identity)}&x=${x}&y=${y}`);
  await waitFor(() => document.activeElement === input, 'focused Search input');
  if (!visible(input) || !visible(surface)) {
    throw new Error('Search input or status surface is obstructed after the Android keyboard opens');
  }

  await runSearchQuery(input, surface, leafTitle, 'ready');
  const results = surface.querySelectorAll('button').length;
  if (results < 1) throw new Error('Search did not return the accepted Topic sample');

  await runSearchQuery(input, surface, `foliole-a5-empty-${config.identity}`, 'ready');
  if (surface.querySelectorAll('button').length !== 0) {
    throw new Error('Search empty sample returned results');
  }

  const capacitor = window.Capacitor;
  const originalNativePromise = capacitor && capacitor.nativePromise;
  if (typeof originalNativePromise !== 'function') {
    throw new Error('Capacitor search error seam is unavailable');
  }
  capacitor.nativePromise = function(pluginName, methodName, options) {
    if (pluginName === 'FolioleCompanionSync' && methodName === 'searchTopics') {
      return Promise.reject(new Error('A5 DEV acceptance search failure'));
    }
    return originalNativePromise.call(this, pluginName, methodName, options);
  };
  try {
    await runSearchQuery(input, surface, `foliole-a5-error-${config.identity}`, 'error');
  } finally { capacitor.nativePromise = originalNativePromise; }
  record('search', {
    empty: true, error: true, errorMode: 'bounded-dev-rejection',
    keyboard: true, keyboardEvidence: 'android-ime-state', loading: true, results
  });
}
