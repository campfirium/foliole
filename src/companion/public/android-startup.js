/* global document, location, navigator, window */
(function () {
  var ua = navigator.userAgent;
  if (!/Android/i.test(ua) || (!/;\s*wv\b/i.test(ua) && !window.androidBridge)) return;

  var startup = document.getElementById('android-startup');
  var heading = document.getElementById('android-startup-title');
  var description = document.getElementById('android-startup-description');
  var details = document.getElementById('android-startup-help');
  var version = document.getElementById('android-startup-version');
  var chinese = /^zh(?:-|$)/i.test(navigator.language || '');
  var chromium = /(?:Chrome|Chromium)\/([\d.]+)/.exec(ua);

  function text(english, simplifiedChinese) {
    return chinese ? simplifiedChinese : english;
  }

  startup.lang = text('en', 'zh-Hans');
  heading.textContent = text('Opening Foliole…', '正在打开 Foliole…');
  details.querySelector('summary').textContent = text('Having trouble opening Foliole?', '打不开？');
  version.textContent = chromium
    ? text('Current web engine: Chromium ', '当前网页内核：Chromium ') + chromium[1]
    : text('The current web component version could not be determined.', '无法确认当前网页组件版本。');
  var minimum = startup.getAttribute('data-chromium-minimum');
  if (/^\d+$/.test(minimum || '')) {
    version.textContent += text('. Foliole requires Chromium ', '。Foliole 要求 Chromium ') + minimum + '+';
  }
  document.getElementById('android-startup-update').textContent = text(
    'In Google Play, update Android System WebView, or update Chrome if Android uses Chrome for WebView. For a device maker’s component or a device without Google Play, check Settings → System update or contact your device maker.',
    '如果系统使用 Android System WebView，请在 Google Play 更新该组件。如果系统使用 Chrome，请更新 Chrome。使用厂商组件或没有 Google Play 时，请查看「设置 → 系统更新」或联系设备厂商。'
  );
  document.getElementById('android-startup-reopen').textContent = text(
    'If the installer reports insufficient space, free up internal storage and try again. After updating, close and reopen Foliole.',
    '安装器提示空间不足时，请释放内部存储空间后重试。更新后，请关闭并重新打开 Foliole。'
  );

  function showComponent() {
    var capacitor = window.Capacitor;
    if (!capacitor || !capacitor.nativePromise) return;
    capacitor.nativePromise('FolioleCompanionBootstrap', 'getWebViewVersion', {}).then(function (info) {
      if (!info.version) return;
      version.textContent = text('Current component: ', '当前组件：') + info.component + ' ' + info.version
        + text('. Foliole version requirement for this component: ', '。Foliole 对该组件的版本要求：') + info.minimum + '+';
    }, function () { /* The Chromium version and offline steps remain visible. */ });
  }

  details.addEventListener('toggle', function () {
    if (details.open) showComponent();
  });

  function showFailure(error) {
    heading.textContent = text('Foliole couldn’t start', 'Foliole 无法启动');
    var oldSyntax = chromium && error && error.name === 'SyntaxError'
      && /regular expression flags/i.test(error.message);
    if (oldSyntax) {
      try {
        new RegExp('', 'v');
        oldSyntax = false;
      } catch { /* This WebView cannot parse the required flag. */ }
    }
    description.textContent = oldSyntax
      ? text('The current web engine could not load Foliole. Update it, then reopen Foliole.',
        '当前网页内核无法加载 Foliole。请更新网页组件后重新打开。')
      : text('Reopen Foliole. If the problem persists, check your web component and update options.',
        '请重新打开 Foliole。如果问题仍然存在，可以查看网页组件和更新方法。');
    details.open = true;
  }

  function onError(event) {
    if (event.target && event.target.tagName === 'SCRIPT' && event.target.type === 'module') {
      showFailure(event.error);
    } else if (event.error && event.error.name === 'SyntaxError' && event.filename && event.filename.indexOf(location.origin + '/') === 0) {
      showFailure(event.error);
    }
  }

  window.addEventListener('error', onError, true);
  window.addEventListener('foliole-companion-startup-settled', function () {
    window.removeEventListener('error', onError, true);
    startup.remove();
  }, { once: true });
  startup.hidden = false;
})();
