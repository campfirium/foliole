export const DEFAULT_THEME_SCRIPT = `(function () {
  function isEditable(target) {
    return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }
  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
    var data = document.body.dataset;
    var destination = null;
    if (event.key === 'Escape') destination = data.archiveUrl;
    if (event.code === 'Space') destination = event.shiftKey ? data.newerUrl : data.olderUrl;
    if (!destination) return;
    event.preventDefault();
    location.href = destination;
  });
})();`;
