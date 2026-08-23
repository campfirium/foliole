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
    syncPackApplied: false, syncPackDownloaded: false,
    autoSyncResult: null, autoSyncRunId: null, autoSyncStarted: false,
    baselineTerminalRunId: null, observerInitialized: false,
    manualSyncMode: null, manualSyncResult: null, manualSyncRunId: null,
    preExistingAttention: false, syncFailure: null, syncPackUrl: null
  };
  window.__foliolePairSyncObserver = state;
  observeManualSync(state);
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
        state.credentials = 'saved_not_signable'; return value;
      },
        function (error) { state.credentials = 'save_failed'; throw error; });
    }
    if (methodName === 'bindSyncGroupPeerRoute' && state.completion === 'http_200') {
      return call().then(function (value) {
        state.credentials = 'saved_not_signable'; return value;
      },
        function (error) { state.credentials = 'save_failed'; throw error; });
    }
    if (methodName === 'signCompanionSyncRequest' && state.credentials === 'saved_not_signable') {
      return call().then(function (value) { state.credentials = 'saved_signable'; return value; });
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
        state.completion = value && value.status === 200 ? 'http_200' : 'http_rejected';
        state.syncFailure = state.completion === 'http_200' ? null : pairCompletionFailure(value);
        return value;
      }, function (error) {
        state.completion = 'transport_failed'; state.syncFailure = 'pair-completion-transport-failed';
        throw error;
      });
    }
    if (isSyncPush(args) && pairingCanSync(state)) {
      state.initialSync = 'started';
      return call().then(function (value) {
        if (!value || value.status < 200 || value.status >= 300) {
          state.initialSync = 'failed'; state.syncFailure = syncPushFailure(value);
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
  function observeManualSync(state) {
    if (!window.document || !window.MutationObserver) return;
    var record = function () {
      var target = window.document.querySelector('[data-testid="companion-sync-now"]');
      if (!target) return;
      var mode = target.getAttribute('data-sync-action-mode');
      var runId = target.getAttribute('data-sync-run-id');
      var terminalRunId = target.getAttribute('data-sync-terminal-run-id');
      var terminalResult = target.getAttribute('data-sync-terminal-result');
      if (!state.observerInitialized) {
        state.baselineTerminalRunId = terminalRunId;
        state.preExistingAttention = !!window.document.querySelector(
          '[data-testid="companion-sync-inline-attention"]'
        );
        state.observerInitialized = true;
      }
      if (!mode && target.getAttribute('aria-busy') === 'true') state.autoSyncStarted = true;
      if (state.autoSyncStarted && terminalRunId && terminalResult
        && terminalRunId !== state.baselineTerminalRunId) {
        state.autoSyncRunId = terminalRunId; state.autoSyncResult = terminalResult;
      }
      if ((mode === 'owned' || mode === 'joined') && runId) {
        state.manualSyncMode = mode; state.manualSyncRunId = runId;
      }
      if (state.manualSyncRunId && terminalRunId === state.manualSyncRunId) {
        state.manualSyncResult = terminalResult;
      }
    };
    new window.MutationObserver(record).observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['aria-busy', 'data-sync-action-mode', 'data-sync-run-id',
        'data-sync-terminal-run-id', 'data-sync-terminal-result'],
      childList: true,
      subtree: true
    });
    record();
  }
  function syncPushFailure(value) {
    var allowed = /^(expired_timestamp|invalid_signature|missing_headers|sync_group_member_not_authorized|sync_group_workgroup_key_missing|workgroup_aead_invalid)$/;
    var detail = null;
    try { detail = JSON.parse(value && value.body || '{}').error; } catch { /* bounded below */ }
    return 'sync-push-http-' + (value && value.status) + (allowed.test(detail) ? '-' + detail : '');
  }
  function pairCompletionFailure(value) {
    var allowed = /^(invalid_pair_request|pair_request_not_found|pair_request_pending|pair_request_rejected|protocol_incompatible|pair_completion_rate_limited|sync_group_member_not_authorized|sync_group_workgroup_key_missing|sync_group_provider_pairing_invalid|sync_group_local_authorization_missing)$/;
    var detail = null;
    try { detail = JSON.parse(value && value.body || '{}').error; } catch { /* bounded below */ }
    return 'pair-completion-http-' + (value && value.status) + (allowed.test(detail) ? '-' + detail : '');
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
