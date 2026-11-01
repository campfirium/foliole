const ENDPOINT = 'https://api.osv.dev/v1/querybatch';
const coordinatePart = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+$/u.test(value);

function supported(module) {
  return coordinatePart(module.group) && coordinatePart(module.name)
    && typeof module.version === 'string' && /^[0-9][A-Za-z0-9_.-]*$/u.test(module.version)
    && !module.version.endsWith('-SNAPSHOT');
}

function parsePage(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || Object.keys(row).some(key => !['vulns', 'next_page_token'].includes(key))
    || (row.vulns !== undefined && !Array.isArray(row.vulns))
    || (row.next_page_token !== undefined && typeof row.next_page_token !== 'string')) {
    throw new Error('Malformed OSV result');
  }
  const advisories = (row.vulns ?? []).map(vulnerability => {
    if (!vulnerability || typeof vulnerability.id !== 'string' || !vulnerability.id.trim()) {
      throw new Error('OSV result omitted an advisory identity');
    }
    return { id: vulnerability.id, modified: vulnerability.modified ?? null };
  });
  return { advisories, token: row.next_page_token || null };
}

async function queryChunk(states, fetchImpl) {
  let pending = states;
  for (let page = 0; pending.length && page < 20; page += 1) {
    try {
      const queries = pending.map(({ module, token }) => ({
        package: { ecosystem: 'Maven', name: `${module.group}:${module.name}` },
        version: module.version, ...(token ? { page_token: token } : {})
      }));
      const response = await fetchImpl(ENDPOINT, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }),
        signal: globalThis.AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`OSV HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body?.results) || body.results.length !== pending.length) {
        throw new Error('OSV result count does not match the requested packages');
      }
      pending = applyPages(pending, body.results);
    } catch (error) {
      for (const state of pending) {
        state.status = 'error';
        state.error = error.message;
      }
      return;
    }
  }
  for (const state of pending) {
    state.status = 'error';
    state.error = 'OSV pagination exceeded the bounded query limit';
  }
}

function applyPages(states, rows) {
  return states.filter((state, index) => {
    try {
      const { advisories, token } = parsePage(rows[index]);
      for (const advisory of advisories) state.advisories.set(advisory.id, advisory);
      if (token && state.seenTokens.has(token)) throw new Error('OSV repeated a page token');
      if (token) state.seenTokens.add(token);
      state.token = token;
      state.status = token ? 'pending' : state.advisories.size ? 'findings' : 'clean';
      return Boolean(token);
    } catch (error) {
      state.status = 'error';
      state.error = error.message;
      return false;
    }
  });
}

export async function queryAndroidMavenAdvisories(modules, { fetchImpl = globalThis.fetch } = {}) {
  const states = modules.map(module => ({ module, advisories: new Map(), token: null,
    seenTokens: new Set(), status: supported(module) ? 'pending' : 'unsupported',
    ...(!supported(module) ? { error: 'No exact supported Maven coordinate/version' } : {}) }));
  const eligible = states.filter(state => state.status === 'pending');
  for (let offset = 0; offset < eligible.length; offset += 100) {
    await queryChunk(eligible.slice(offset, offset + 100), fetchImpl);
  }
  return { source: ENDPOINT, checkedAt: new Date().toISOString(),
    results: states.map(({ module, status, error, advisories }) => ({ module, status,
      ...(error ? { error } : {}), advisories: [...advisories.values()] })) };
}
