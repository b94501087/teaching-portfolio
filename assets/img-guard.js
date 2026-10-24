/* Block the image context menu and image drags. Right-click on ordinary text and links is unchanged. */
(function () {
  function node(t) {
    return t && t.nodeType === 1 ? t : (t && t.parentElement);
  }
  function blocked(t) {
    var el = node(t);
    if (!el || !el.closest) return false;
    if (el.closest('.lb')) return true;
    if (el.closest('img, picture, .zoom')) return true;
    return el.tagName === 'FIGURE';
  }
  function guard(e) {
    if (blocked(e.target)) e.preventDefault();
  }
  document.addEventListener('contextmenu', guard);
  document.addEventListener('dragstart', guard);
})();
