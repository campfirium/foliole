import type { FlowGradeStage, SupportRecordingEntry } from '../../../lib/platform/supportRecordingEntry';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import {
  getDesktopSupportRecordingStart,
  recordDesktopSupportEntry,
  subscribeDesktopSupportRecording
} from '../../shared/platform/supportLog/desktopSupportLog';
import type { WorkspaceReviewGradeObserver } from '../../store/workspaceReviewGradeObserver';

const cards = new Map<string, number>();
let attempts = 0;
let displayedNodeId: string | null = null;
let observeDisplay: (() => void) | undefined;

export function publishFlowGradeDisplay(nodeId: string | null) {
  displayedNodeId = nodeId;
  const observation = observeDisplay;
  if (observation) requestAnimationFrame(() => { if (observeDisplay === observation) observation(); });
}

function alias(id: string | null) {
  if (id === null) return null;
  let value = cards.get(id);
  if (value === undefined) {
    value = cards.size + 1;
    cards.set(id, value);
  }
  return value;
}

function resetFlowGradeTrace() {
  cards.clear();
  displayedNodeId = null;
  attempts = 0;
  observeDisplay = undefined;
}

subscribeDesktopSupportRecording(resetFlowGradeTrace);

export function beginFlowGradeTrace(grade: ReviewGrade, nodeId: string | null) {
  const startedAt = getDesktopSupportRecordingStart();
  if (startedAt === undefined) return;
  const attempt = ++attempts;
  let stage: FlowGradeStage | null = null;
  let displayed: number | null | undefined;
  observeDisplay = undefined;
  const current = () => getDesktopSupportRecordingStart() === startedAt;
  const send = (entry: SupportRecordingEntry) => recordDesktopSupportEntry(startedAt, entry);
  send({ event: 'flow.grade.selected', attempt, grade, card: alias(nodeId) });

  const observer: WorkspaceReviewGradeObserver = {
    stage: value => { stage = value; },
    saved: (grade, cardId, due, reviewedAt, nextId) => {
      if (!current()) return;
      send({ event: 'flow.grade.saved', attempt, grade, card: alias(cardId)!,
        dueAtMs: due === null ? null : Date.parse(due), reviewedAtMs: Date.parse(reviewedAt), nextCard: alias(nextId) });
    }
  };
  return {
    observer,
    finish(accepted: boolean) {
      send({ event: 'flow.grade.finished', attempt, accepted, stage });
      if (!current() || attempt !== attempts) return;
      observeDisplay = () => {
        if (!current()) return;
        const card = alias(displayedNodeId);
        if (displayed === card) return;
        displayed = card;
        send({ event: 'flow.grade.displayed', attempt, card });
        if (card !== null) observeDisplay = undefined;
      };
      const observation = observeDisplay;
      requestAnimationFrame(() => { if (observeDisplay === observation) observation(); });
    }
  };
}
