// Run after the observed event dispatch, including handlers which stop propagation.
// This task boundary does not guess how long a command or composition needs.
export function afterEditorEventDispatch(callback: () => void) {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    channel.port2.close();
    callback();
  };
  channel.port2.postMessage(null);
}
