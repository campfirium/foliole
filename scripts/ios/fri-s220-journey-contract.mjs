const GROUP_PATTERN = /^group-[0-9a-f-]{36}$/u;

export function createFriS220Attempt(groupId) {
  if (!GROUP_PATTERN.test(groupId ?? '')) throw new Error('S220 isolated Sync Group identity is invalid.');
  const attemptId = groupId.slice(-12);
  return { attemptId, captureTitle: `S220 Fri capture ${attemptId}`,
    editMarker: `S220 Fri edit ${attemptId}.`, reviewTitle: 'Multi-device sync D fact',
    sourceTitle: 'Multi-device sync A fact' };
}

function nodes(snapshot) {
  return Object.values(snapshot?.nodesById ?? {});
}

function exactCount(value, needle) {
  return String(value ?? '').split(needle).length - 1;
}

export function assertFriS220ResidueFree(snapshot, attempt, sourceContent = '') {
  const values = nodes(snapshot);
  if (values.some((node) => node.title === attempt.captureTitle
      || String(node.content ?? '').includes(attempt.editMarker))
      || String(sourceContent).includes(attempt.editMarker)) {
    throw new Error(`S220 attempt ${attempt.attemptId} already has isolated fixture residue.`);
  }
  const source = values.filter((node) => node.title === attempt.sourceTitle);
  const review = values.filter((node) => node.title === attempt.reviewTitle);
  if (source.length !== 1 || review.length !== 1) {
    throw new Error('S220 source and review facts must each resolve exactly once.');
  }
  return { reviewId: review[0].id, sourceId: source[0].id };
}

export function assertFriS220Converged(snapshot, attempt, sourceContent) {
  const values = nodes(snapshot);
  const captures = values.filter((node) => node.title === attempt.captureTitle);
  const sources = values.filter((node) => node.title === attempt.sourceTitle);
  const reviews = values.filter((node) => node.title === attempt.reviewTitle);
  if (captures.length !== 1 || sources.length !== 1 || reviews.length !== 1
      || exactCount(sourceContent, attempt.editMarker) !== 1
      || reviews[0].review?.reps !== 1) {
    throw new Error('S220 Mac/Fri content or review state did not converge exactly once.');
  }
  return { captureId: captures[0].id, reviewId: reviews[0].id,
    sourceId: sources[0].id, sourceVersionId: sources[0].currentVersionId };
}

const STAGES = ['prepared', 'offline_ready', 'offline_verified', 'offline_complete',
  'network_restored', 'online_complete'];

export function advanceFriS220Stage(current, next) {
  const index = STAGES.indexOf(current);
  if (index < 0 || STAGES[index + 1] !== next) {
    throw new Error(`S220 stage transition is not single-pass: ${current} -> ${next}.`);
  }
  return next;
}
