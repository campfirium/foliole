/* global AbortController, clearTimeout, setTimeout */

function controllerFailure(stage, missingFact, lastSuccessfulAction, message) {
  return Object.assign(new Error(message), { failureOwner: 'controller', host: stage.host,
    lastSuccessfulAction, missingFact, status: 'failed' });
}

function productStall(stage, lastSuccessfulAction) {
  return Object.assign(new Error(`Stage ${stage.name} made no semantic progress before its deadline.`), {
    failureOwner: 'product', host: stage.host, lastSuccessfulAction,
    missingFact: 'declared_semantic_progress', status: 'stalled'
  });
}

export async function runBoundedStageAction({ action, run, stage }) {
  const controller = new AbortController();
  const progress = [];
  let terminal = null;
  let hardTimer; let progressTimer;
  const armProgress = () => {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      if (terminal) return;
      terminal = productStall(stage, progress.at(-1) || 'stage_started'); controller.abort();
    }, stage.progressDeadlineMs);
  };
  const reportProgress = (milestone) => {
    if (terminal) return;
    const expected = stage.milestones[progress.length];
    if (milestone !== expected) {
      terminal = controllerFailure(stage, 'milestone_order_invalid', progress.at(-1) || 'stage_started',
        `Stage ${stage.name} expected ${expected || 'no further milestone'}, received ${milestone}.`);
      controller.abort(); return;
    }
    progress.push(milestone); armProgress();
  };
  hardTimer = setTimeout(() => {
    if (terminal) return;
    terminal = controllerFailure(stage, 'stage_hard_deadline', progress.at(-1) || 'stage_started',
      `Stage ${stage.name} exceeded its hard deadline.`); controller.abort();
  }, stage.hardDeadlineMs);
  armProgress();
  try {
    const result = await action({ reportProgress, run, signal: controller.signal, stage });
    if (terminal) throw terminal;
    if (progress.length === 0 && Array.isArray(result?.progress)) {
      result.progress.forEach(reportProgress);
    }
    if (terminal) throw terminal;
    if (progress.length !== stage.milestones.length) {
      throw controllerFailure(stage, 'milestone_sequence_incomplete',
        progress.at(-1) || 'stage_started', `Stage ${stage.name} completed without all milestones.`);
    }
    return { ...result, lastProgressAt: new Date().toISOString(), progress };
  } catch (error) {
    throw terminal || Object.assign(error, { progress });
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
  if (first.status === 'rejected') cancel(first.name);
  if (first.status === 'fulfilled' && cancelOnSuccess.includes(first.name)) cancel(first.name);
  const settled = await Promise.all(wrapped);
  const failure = settled.find(({ status }) => status === 'rejected');
  if (failure) {
    failure.reason.siblingOutcomes = settled.map(({ name, status }) => ({ name, status }));
    throw failure.reason;
  }
  return Object.fromEntries(settled.map(({ name, value }) => [name, value]));
}
