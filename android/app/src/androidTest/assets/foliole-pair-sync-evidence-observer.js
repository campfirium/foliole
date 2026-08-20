/* global URL, window */
(function () {
  var cap = window.Capacitor;
  var subtle = window.crypto && window.crypto.subtle;
  if (!cap || typeof cap.nativePromise !== 'function' || !subtle) return JSON.stringify({ ok: false });
  var proto = Object.getPrototypeOf(subtle);
  if (!proto || typeof proto.generateKey !== 'function') return JSON.stringify({ ok: false });
  var state = {
    keyState: 'not-started', requestState: 'not-started', completion: 'not_started',
    credentials: 'not_saved', initialSync: 'not_started',
    credentialTarget: null,
    syncPackApplied: false, syncPackDownloaded: false,
    syncFailure: null, syncPackUrl: null
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
    if (pluginName === 'FolioleCompanionSyncPackTransfer') {
      return observeSyncPack(state, methodName, call, args);
    }
    if (pluginName !== 'FolioleCompanionSync') return call();
    if (methodName === 'desktopHttpRequest') return observeHttp(state, args, call);
    if (methodName === 'savePairingCredentials' && state.completion === 'http_200') {
      return call().then(function (value) {
        if (args && args.endpoint_url && args.sync_group_id) {
          state.credentialTarget = {
            endpointUrl: args.endpoint_url, syncGroupId: args.sync_group_id
          };
        }
        state.credentials = 'saved_not_signable'; return value;
      },
        function (error) { state.credentials = 'save_failed'; throw error; });
    }
    if (methodName === 'bindSyncGroupPeerRoute' && state.completion === 'http_200') {
      return call().then(function (value) {
        state.credentialTarget = {
          endpointUrl: args && args.endpoint_url, syncGroupId: args && args.sync_group_id
        };
        state.credentials = 'saved_not_signable'; return value;
      },
        function (error) { state.credentials = 'save_failed'; throw error; });
    }
    if (methodName === 'signCompanionSyncRequest' && state.credentials === 'saved_not_signable') {
      return call().then(function (value) { state.credentials = 'saved_signable'; return value; });
    }
    return call();
  };
  window.__folioleVerifyPairSyncCredentials = function () {
    var target = state.credentialTarget;
    if (!target || !target.endpointUrl || !target.syncGroupId) {
      return JSON.stringify({ ok: false, code: 'credential_target_missing' });
    }
    cap.nativePromise('FolioleCompanionSync', 'signCompanionSyncRequest', {
      body_hash: new Array(65).join('0'), endpoint_url: target.endpointUrl,
      method: 'GET', nonce: 'credential-evidence-probe',
      path_with_query: '/companion/sync-pack?after_state_seq=0',
      sync_group_id: target.syncGroupId, timestamp: new Date().toISOString()
    }).catch(function (error) {
      state.credentials = 'save_failed'; state.syncFailure = String(error);
    });
    return JSON.stringify({ ok: true });
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
    if (isSyncPush(args) && pairingCanSync(state)) {
      state.initialSync = 'started';
      return call().then(function (value) {
        if (!value || value.status < 200 || value.status >= 300) {
          state.initialSync = 'failed'; state.syncFailure = 'sync-push-http-' + (value && value.status);
        }
        return value;
      }, function (error) { state.initialSync = 'failed'; state.syncFailure = String(error); throw error; });
    }
    return call();
  }
  function isSyncPush(args) {
    if (!args || args.method !== 'POST' || typeof args.url !== 'string') return false;
    try { return new URL(args.url).pathname === '/companion/sync-push'; }
    catch { return false; }
  }
  function pairingCanSync(state) {
    return state.credentials === 'saved_signable' || state.completion === 'existing_pairing';
  }
  function observeSyncPack(state, methodName, call, args) {
    if (!pairingCanSync(state)) return call();
    if (methodName === 'downloadDesktopSyncPack') {
      state.syncPackUrl = args && args.url || null;
      if (state.initialSync === 'not_started') state.initialSync = 'started';
      return call().then(function (value) {
        state.syncPackDownloaded = true; return value;
      }, function (error) { state.initialSync = 'failed'; state.syncFailure = String(error); throw error; });
    }
    if (methodName === 'deleteDownloadedSyncPack' && state.syncPackDownloaded) {
      return call().then(function (value) {
        state.syncPackApplied = true; return value;
      }, function (error) { state.initialSync = 'failed'; throw error; });
    }
    return call();
  }
  return JSON.stringify({ ok: true });
})()
