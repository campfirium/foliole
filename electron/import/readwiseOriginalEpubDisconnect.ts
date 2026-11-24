let connection = new AbortController();

export function readReadwiseOriginalEpubDisconnectSignal() {
  return connection.signal;
}

export function cancelReadwiseOriginalEpubDownloads() {
  const previous = connection;
  connection = new AbortController();
  previous.abort();
}
