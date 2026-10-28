/** Keep the peer request boundary replaceable for deterministic sync fixtures. */
export const lanPeerHttp: { fetch: typeof fetch } = { fetch: globalThis.fetch };
