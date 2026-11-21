/* global document, location, navigator, window */
(function () {
  var ua = navigator.userAgent;
  if (!/Android/i.test(ua) || (!/;\s*wv\b/i.test(ua) && !window.androidBridge)) return;

  var startup = document.getElementById('android-startup');
  var chinese = /^zh(?:-|$)/i.test(navigator.language || '');
  var chromium = /(?:Chrome|Chromium)\/([\d.]+)/.exec(ua);
  var major = chromium ? chromium[1].split('.')[0] : '';
  var minimum = startup.getAttribute('data-chromium-minimum');
  minimum = /^\d+$/.test(minimum || '') ? minimum : '';

  function text(english, simplifiedChinese) {
    return chinese ? simplifiedChinese : english;
  }

  function engineTooOld(error) {
    if (minimum && major && Number(major) < Number(minimum)) return true;
    if (!error || error.name !== 'SyntaxError' || !/regular expression flags/i.test(error.message)) return false;
    try {
      new RegExp('', 'v');
      return false;
    } catch { return true; }
  }

  function copy(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    var field = document.createElement('textarea');
    field.value = value;
    document.body.append(field);
    field.select();
    var copied = document.execCommand('copy');
    field.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  function show(errorText, error) {
    if (!startup.hidden) return;
    var old = engineTooOld(error);
    startup.lang = text('en', 'zh-Hans');
    document.getElementById('android-startup-title').textContent = old
      ? text('Component update required', '需要更新组件')
      : text('Can’t start', '无法启动');
    document.getElementById('android-startup-description').textContent = old
      ? text('Android System WebView is version ' + major + '; ' + minimum + ' or later is required.',
        'Android System WebView 当前版本 ' + major + '，需要 ' + minimum + ' 或更高。')
      : errorText;
    var button = document.getElementById('android-startup-copy');
    var label = text('Copy error details', '复制错误信息');
    button.textContent = label;
    button.onclick = function () {
      copy(errorText + '\n' + ua).then(function () {
        button.textContent = text('Copied', '已复制');
      }, function () {
        button.textContent = label;
      });
    };
    startup.hidden = false;
  }

  function onError(event) {
    var target = event.target;
    if (target && target.tagName === 'SCRIPT' && target.type === 'module') {
      show(event.error ? event.error.name + ': ' + event.error.message : 'Failed to load ' + (target.src || 'module script'),
        event.error);
    } else if (event.error && event.error.name === 'SyntaxError' && event.filename && event.filename.indexOf(location.origin + '/') === 0) {
      show(event.error.name + ': ' + event.error.message, event.error);
    }
  }

  window.addEventListener('error', onError, true);
  window.addEventListener('foliole-companion-startup-settled', function () {
    window.removeEventListener('error', onError, true);
    startup.remove();
  }, { once: true });
})();
