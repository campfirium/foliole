import {
  createDesktopAnchorTopologyState,
  type DesktopAnchorTopologyState
} from '../../lib/platform/syncAnchorTopologyStateMachine.js';

let state = createDesktopAnchorTopologyState();

export function loadDesktopAnchorTopologyState() {
  return state;
}

export function saveDesktopAnchorTopologyState(next: DesktopAnchorTopologyState) {
  state = next;
  return state;
}

export function resetDesktopAnchorTopologyState() {
  state = createDesktopAnchorTopologyState();
  return state;
}
