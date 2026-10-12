const fs = require('node:fs');
const { channel } = require('node:diagnostics_channel');
const { setInterval, clearInterval } = require('node:timers');

exports.install = function (emit) {
  let sequence = 0;
  const owners = new WeakMap();
  const connections = new WeakMap();
  const pending = new Map();
  const subscriptions = [];
  for (const method of ['mkdir', 'rename', 'rm', 'readdir']) {
    const original = fs.promises[method];
    fs.promises[method] = async function (...args) {
      const id = ++sequence;
      emit({ event: 'file_start', id, method, path: String(args[0]) });
      try {
        const result = await Reflect.apply(original, this, args);
        emit({ event: 'file_end', id, method, ...(method === 'mkdir' ? { firstCreated: result ?? null } : {}) });
        return result;
      } catch (error) { emit({ event: 'file_error', id, method, code: error.code }); throw error; }
    };
    subscriptions.push(() => { fs.promises[method] = original; });
  }
  const subscribe = (name, listener) => {
    const source = channel(name);
    source.subscribe(listener);
    subscriptions.push(() => source.unsubscribe(listener));
  };
  const describe = owner => {
    if (!owner) return null;
    if (!owners.has(owner)) owners.set(owner, { id: ++sequence, canClose: owner.canClose,
      enteredAt: new Date().toISOString(), stack: new Error('coordinator owner entry').stack });
    return owners.get(owner);
  };
  subscribe('foliole.sqlite.coordinator', state => {
    if (!connections.has(state.coordinator)) connections.set(state.coordinator, ++sequence);
    describe(state.owner);
    emit({ event: 'coordinator_state', transition: state.event, connectionId: connections.get(state.coordinator),
      database: state.database, active: describe(state.active), waiting: state.waiting.map(describe) });
  });
  subscribe('undici:request:create', ({ request }) => {
    const record = { id: ++sequence, startedAt: new Date().toISOString(), method: request.method,
      origin: String(request.origin), path: request.path.split('?')[0], headersReceived: false };
    pending.set(request, record);
    emit({ event: 'http_start', ...record });
  });
  subscribe('undici:request:headers', ({ request, response }) => {
    const record = pending.get(request);
    if (record) { record.headersReceived = true; emit({ event: 'http_headers', id: record.id, status: response.statusCode }); }
  });
  for (const name of ['trailers', 'error']) subscribe(`undici:request:${name}`, ({ request, error }) => {
    const record = pending.get(request);
    if (record) emit({ event: 'http_end', id: record.id, result: name, errorCode: error?.code ?? null });
    pending.delete(request);
  });
  const timer = setInterval(() => { if (pending.size) emit({ event: 'http_pending', requests: [...pending.values()] }); }, 5000);
  timer.unref();
  return () => { clearInterval(timer); for (const unsubscribe of subscriptions) unsubscribe(); };
};
