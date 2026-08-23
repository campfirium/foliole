/* global AbortController, clearTimeout, setTimeout */

function controllerFailure(stage, missingFact, lastSuccessfulAction, message) {
  return Object.assign(new Error(message), { executionOwner: 'controller',
    failureAxis: 'execution', host: stage.host, lastSuccessfulAction, missingFact,
    status: 'failed' });
}

function progressDeadline(stage, lastSuccessfulAction) {
  return controllerFailure(stage, 'stage_progress_deadline', lastSuccessfulAction,
    `Stage ${stage.name} emitted no new observation before its deadline.`);
}

export async function runBoundedStageAction({ action, run, stage }) {
  const controller = new AbortController();
  const activityCounts = new Map();
  const progress = [];
  let lastProgressAt = new Date().toISOString();
  let terminal = null;
  let hardTimer; let progressTimer;
  const armProgress = () => {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      if (terminal) return;
      terminal = progressDeadline(stage, progress.at(-1) || 'stage_started'); controller.abort();
    }, stage.progressDeadlineMs);
  };
  const reportProgress = (milestone) => {
    if (terminal) return;
    progress.push(milestone); lastProgressAt = new Date().toISOString(); armProgress();
  };
  const reportActivity = (activity) => {
    if (terminal) return;
    activityCounts.set(activity, (activityCounts.get(activity) ?? 0) + 1);
    lastProgressAt = new Date().toISOString(); armProgress();
  };
  hardTimer = setTimeout(() => {
    if (terminal) return;
    terminal = controllerFailure(stage, 'stage_hard_deadline', progress.at(-1) || 'stage_started',
      `Stage ${stage.name} exceeded its hard deadline.`); controller.abort();
  }, stage.hardDeadlineMs);
  armProgress();
  try {
    const result = await action({ reportActivity, reportProgress, run, signal: controller.signal, stage });
    if (terminal) throw terminal;
    if (progress.length === 0 && Array.isArray(result?.progress)) {
      result.progress.forEach(reportProgress);
    }
    if (terminal) throw terminal;
    const activities = [...activityCounts].map(([name, count]) => ({ count, name }));
    return { ...result, activities, lastProgressAt, progress };
  } catch (error) {
    const activities = [...activityCounts].map(([name, count]) => ({ count, name }));
    throw Object.assign(terminal || error, { activities, lastProgressAt, progress: [...progress] });
  } finally {
    clearTimeout(hardTimer); clearTimeout(progressTimer);
  }
}

export async function settleSiblingActions(entries, cancel = () => {}, cancelOnSuccess = []) {
  const wrapped = entries.map(({ name, work }) => Promise.resolve(work).then(
    (value) => ({ name, status: 'fulfilled', value }),
    (reason) => ({ name, reason, status: 'rejected' })
  ));
  const first = await Promise.race(wrapped);
  if (first.status === 'rejected') cancel(first.name, first.status);
  if (first.status === 'fulfilled' && cancelOnSuccess.includes(first.name)) {
    cancel(first.name, first.status);
  }
  const settled = await Promise.all(wrapped);
  const failure = first.status === 'rejected'
    ? first
    : settled.find(({ status }) => status === 'rejected');
  if (failure) {
    failure.reason.siblingOutcomes = settled.map(({ name, status }) => ({ name, status }));
    throw failure.reason;
  }
  return Object.fromEntries(settled.map(({ name, value }) => [name, value]));
}
