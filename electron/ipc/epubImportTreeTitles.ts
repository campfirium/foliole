function stripChapterPrefix(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return '';
  const strippedChinese = trimmed.replace(
    /^\s*第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[章节回部卷篇]\s*[:：、.\-)]?\s*/u,
    ''
  );
  return strippedChinese
    .replace(/^\s*chapter\s+(?:\d+|[ivxlcdm]+)\s*[:：.\-)]?\s*/iu, '')
    .trim();
}

export function resolveChapterBodyTitle(primaryTitle: string, fallbackTitle: string) {
  return stripChapterPrefix(primaryTitle)
    || stripChapterPrefix(fallbackTitle)
    || primaryTitle.trim()
    || fallbackTitle.trim();
}
