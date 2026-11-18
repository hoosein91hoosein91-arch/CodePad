// Shared lifecycle for React sheets and DOM pages, including nested overlays.
const stack = [];
const focusable = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
export function mountOverlay(node, close, scrim) {
  const previous = document.activeElement;
  const entry = { node, close };
  stack.push(entry);
  node.style.zIndex = String(100 + stack.length * 2);
  if (scrim) scrim.style.zIndex = String(99 + stack.length * 2);
  document.documentElement.classList.add('ui-locked');
  const onKey = event => {
    if (stack.at(-1) !== entry || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === 'Tab') {
      const items = [...node.querySelectorAll(focusable)].filter(el => el.getClientRects().length && !el.closest('[hidden]'));
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); node.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  node.focus({ preventScroll: true });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const top = stack.at(-1) === entry;
    stack.splice(stack.indexOf(entry), 1);
    document.removeEventListener('keydown', onKey, true);
    if (!stack.length) document.documentElement.classList.remove('ui-locked');
    if (top) {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else stack.at(-1)?.node.focus({ preventScroll: true });
    }
  };
}
