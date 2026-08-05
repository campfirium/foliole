/* global URL, window */
(function () {
  var cap = window.Capacitor;
  var subtle = window.crypto && window.crypto.subtle;
  if (!cap || typeof cap.nativePromise !== 'function' || !subtle) return JSON.stringify({ ok: false });
  var proto = Object.getPrototypeOf(subtle);
  if (!proto || typeof proto.generateKey !== 'function') return JSON.stringify({ ok: false });
  var state = {
    keyState: 'not-started', requestState: 'not-started', completion: 'not_started',
    credentials: 'not_saved', initialSync: 'not_started'
  };
  window.__foliolePairSyncObserver = state;
  var originalGenerateKey = proto.generateKey;
  proto.generateKey = function () {
    var algorithm = arguments[0];
    if (state.keyState === 'not-started' && algorithm && algorithm.name === 'ECDH') {
      state.keyState = 'started';
      try {
        return Promise.resolve(originalGenerateKey.apply(this, arguments)).then(function (value) {
          state.keyState = 'completed'; return value;
        }, function (error) { state.keyState = 'failed'; throw error; });
      } catch (error) { state.keyState = 'failed'; throw error; }
    }
    return originalGenerateKey.apply(this, arguments);
  };
  var originalNativePromise = cap.nativePromise;
  cap.nativePromise = function (pluginName, methodName, args) {
    var call = function () {
      try { return Promise.resolve(originalNativePromise.call(cap, pluginName, methodName, args)); }
      catch (error) { return Promise.reject(error); }
    };
    if (pluginName !== 'FolioleCompanionSync') return call();
    if (methodName === 'desktopHttpRequest') return observeHttp(state, args, call);
    if (methodName === 'savePairingCredentials' && state.completion === 'http_200') {
      return call().then(function (value) { state.credentials = 'saved_not_signable'; return value; },
        function (error) { state.credentials = 'save_failed'; throw error; });
    }
    if (methodName === 'signCompanionSyncRequest' && state.credentials === 'saved_not_signable') {
      return call().then(function (value) { state.credentials = 'saved_signable'; return value; });
    }
    if (methodName === 'recordWorkspaceSyncEvent' &&
        (state.credentials === 'saved_signable' || state.completion === 'existing_pairing')) {
      return observeSync(state, args, call);
    }
    return call();
  };
  function isPairRequest(args) {
    if (!args || args.method !== 'POST' || typeof args.url !== 'string') return false;
    try { return new URL(args.url).pathname === '/companion/pair-requests'; }
    catch { return false; }
  }
  function observeHttp(state, args, call) {
    if (state.requestState === 'not-started' && isPairRequest(args)) {
      state.requestState = 'dispatched';
      return call().then(function (value) {
        state.requestState = value && value.status === 202 ? 'accepted' : 'rejected'; return value;
      }, function (error) { state.requestState = 'failed'; throw error; });
    }
    if (state.requestState === 'accepted' && state.completion !== 'http_200') {
      state.completion = 'dispatched';
      return call().then(function (value) {
        state.completion = value && value.status === 200 ? 'http_200' : 'http_rejected'; return value;
      }, function (error) { state.completion = 'transport_failed'; throw error; });
    }
    return call();
  }
  function observeSync(state, args, call) {
    var status = args && args.status;
    var kind = args && args.kind;
    if (status === 'started' && state.initialSync === 'not_started') {
      return call().then(function (value) { state.initialSync = 'started'; return value; },
        function (error) { state.initialSync = 'failed'; throw error; });
    }
    if (kind === 'run_finished' && state.initialSync === 'started') {
      return call().then(function (value) {
        state.initialSync = status === 'failed' ? 'failed' : 'completed'; return value;
      }, function (error) { state.initialSync = 'failed'; throw error; });
    }
    return call();
  }
  return JSON.stringify({ ok: true });
})()
