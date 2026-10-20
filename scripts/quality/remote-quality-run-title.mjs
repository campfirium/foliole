// Dev Quality Check run titles carry the tested commit in one of three shapes:
//   new, target is the trigger commit:  "Dev Quality Check (full) @ 3c2a68dfc"
//   new, target differs (replay):       "Dev Quality Check (replay) @ <40 hex> via 3c2a68dfc"
//   old, before short titles:           "Dev Quality Check (full) @ <40 hex> via <40 hex>"
// A 9-character short SHA is display only: the full commit always comes from the
// title's 40-character target or from the run's head_sha, never from the short SHA.
const TITLE_PATTERN = /^Dev Quality Check \((\w+)\) @ ([0-9a-f]{9}|[0-9a-f]{40})(?: via ([0-9a-f]{9}|[0-9a-f]{40}))?$/u;
const FULL_SHA = /^[0-9a-f]{40}$/u;
const SHORT_LENGTH = 9;

function sameCommit(label, headSha) {
  return label.length === SHORT_LENGTH ? headSha.startsWith(label) : label === headSha;
}

export function isRemoteQualityTitle(title) {
  return /^Dev Quality Check \(/u.test(title ?? '');
}

// Returns { scope, testedSha } or null when the title is unknown or disagrees
// with the run's own head_sha.
export function parseRemoteQualityRun(run) {
  const match = TITLE_PATTERN.exec(run?.display_title ?? '');
  const headSha = run?.head_sha ?? '';
  if (!match || !FULL_SHA.test(headSha)) return null;
  const [, scope, target, via] = match;
  if (via === undefined) {
    if (target.length !== SHORT_LENGTH || !sameCommit(target, headSha)) return null;
    return { scope, testedSha: headSha };
  }
  if (target.length !== 40 || !sameCommit(via, headSha)) return null;
  return { scope, testedSha: target };
}
