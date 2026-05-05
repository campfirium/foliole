const FLAG_CLEAR_CODE_CACHE_ONLY = 0x20;

function parseBracketPayload(line) {
  const match = String(line).match(/\[([^\]]+)]\s*$/);
  if (!match) return [];
  return match[1].split(',').map((entry) => entry.trim());
}

export function parseInstallerClearAppDataEvent(line) {
  if (!/installer_clear_app_data/i.test(String(line))) return null;
  const fields = parseBracketPayload(line);
  const flags = Number.parseInt(fields.at(-1) ?? '', 10);
  const hasKnownFlags = Number.isInteger(flags);
  const codeCacheOnly = hasKnownFlags && (flags & FLAG_CLEAR_CODE_CACHE_ONLY) !== 0;
  return {
    codeCacheOnly,
    flags: hasKnownFlags ? flags : null,
    line,
    potentialDataClear: !codeCacheOnly
  };
}

export function classifyInstallerClearAppDataEvents(events) {
  const parsed = events.map(parseInstallerClearAppDataEvent).filter(Boolean);
  return {
    codeCacheOnly: parsed.filter((event) => event.codeCacheOnly),
    potentialDataClear: parsed.filter((event) => event.potentialDataClear)
  };
}
