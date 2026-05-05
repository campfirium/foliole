export async function isViteServerReady(viteUrl, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(viteUrl, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
