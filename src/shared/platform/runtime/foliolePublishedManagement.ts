interface PublishedDeleteRequest {
  nodeIds: string[];
  onAllowed?: () => void;
}

type PublishedDeleteHandler = (request: PublishedDeleteRequest) => void;

let deleteHandler: PublishedDeleteHandler | null = null;
const changeListeners = new Set<() => void>();

export function registerFoliolePublishedDeleteHandler(handler: PublishedDeleteHandler) {
  deleteHandler = handler;
  return () => {
    if (deleteHandler === handler) deleteHandler = null;
  };
}

export function requestFoliolePublishedDelete(request: PublishedDeleteRequest) {
  if (deleteHandler) {
    deleteHandler(request);
    return;
  }
  request.onAllowed?.();
}

export function notifyFoliolePublishedTopicsChanged() {
  changeListeners.forEach((listener) => listener());
}

export function subscribeFoliolePublishedTopicsChanged(listener: () => void) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}
