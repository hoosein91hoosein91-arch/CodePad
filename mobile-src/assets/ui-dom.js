/* CodePad UI kit — DOM flavour for the vanilla modules (hub, studio, music, …).
   Same tokens, same classes (ui-*) as the React views. */
import { PATHS, FILLED, DOTS } from './ui-icons.js';
import { mountOverlay } from './ui-overlay.js';

const NS = 'http://www.w3.org/2000/svg';

export function icon(n, size) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'ui-ico');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  if (size) {
    s.setAttribute('width', size);
    s.setAttribute('height', size);
  }
  if (FILLED.has(n)) s.style.cssText = 'fill:currentColor;stroke:none';
  else if (DOTS.has(n)) s.style.strokeWidth = '3';
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', PATHS[n] || PATHS.box);
  s.append(p);
  return s;
}

/** h('div', {class, onclick, 'aria-label'}, ...children). Strings become text nodes. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

/** Button: btn('اجرا', {icon:'play', kind:'primary', onclick}) ; kind: primary|line|quiet|danger|tool */
export function btn(label, { icon: ic, kind, onclick, aria, disabled, cls = '', type = 'button', title } = {}) {
  const k = kind ? ' ui-btn--' + kind : '';
  const b = h('button', { type, class: 'ui-btn' + k + (cls ? ' ' + cls : ''), onclick, 'aria-label': aria || (kind === 'tool' ? label : undefined), disabled: !!disabled, title }, ic ? icon(ic) : null, kind === 'tool' ? null : label);
  return b;
}

export const chip = (text, tone) => h('span', { class: 'ui-chip' + (tone ? ' ui-chip--' + tone : '') }, text);

/** Section with heading. */
export const section = (title, ...kids) => h('section', { class: 'ui-sec' }, title ? h('h2', {}, title) : null, ...kids);

/** A 48-high list row: row({icon|ext,title,detail,onclick,end}) */
export function row({ icon: ic, ext, title, detail, onclick, end, current, ltr } = {}) {
  const main = h('span', { class: 'ui-row-main' }, h('strong', ltr ? { class: 'ui-ltr', dir: 'ltr' } : {}, title), detail ? h('span', {}, detail) : null);
  const lead = ext ? h('span', { class: 'ui-ext' }, ext) : ic ? icon(ic) : null;
  const inner = onclick ? h('button', { type: 'button', class: 'ui-row ui-fill', style: { padding: 0 }, onclick }, lead, main) : h('div', { class: 'ui-row ui-fill', style: { padding: 0 } }, lead, main);
  return h('div', { class: 'ui-row', 'aria-current': current ? 'true' : null }, inner, end || null);
}

/** Empty / error / loading states. */
export function state({ icon: ic = 'info', title, text, error, action, loading } = {}) {
  return h('div', { class: 'ui-state' + (error ? ' ui-state--error' : ''), role: error ? 'alert' : 'status' }, loading ? h('div', { class: 'ui-spin', 'aria-hidden': 'true' }) : icon(ic, 28), title ? h('strong', {}, title) : null, text ? h('span', {}, text) : null, action || null);
}

/**
 * modal({title, body, kind:'modal'|'drawer'|'page', onClose, actions})
 * returns {el, close, body}. 'page' = full-screen pane (used by hub/studio).
 */
export function modal({ title, body, kind = 'modal', onClose, actions, label, canClose } = {}) {
  const scrim = kind === 'page' ? null : h('div', { class: 'ui-scrim', onclick: () => api.close() });
  const closeBtn = h('button', { type: 'button', class: 'ui-btn ui-btn--tool', 'aria-label': 'بستن', onclick: () => api.close() }, icon('x'));
  const head = h('div', { class: 'ui-pane-head' }, h('h2', {}, title), actions || null, closeBtn);
  const bodyEl = h('div', { class: 'ui-pane-body' });
  if (body) bodyEl.append(...[].concat(body));
  const cls = kind === 'drawer' ? 'ui-drawer' : kind === 'page' ? 'ui-page' : 'ui-modal';
  const el = h('div', { class: 'ui-root ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title, tabindex: '-1' }, head, bodyEl);
  let closed = false, dispose;
  const api = {
    el,
    body: bodyEl,
    head,
    setTitle: (t) => (head.querySelector('h2').textContent = t),
    close() {
      if (closed) return;
      if (canClose && !canClose()) return;
      closed = true;
      scrim?.remove();
      el.remove();
      dispose?.();
      onClose && onClose();
    },
  };
  document.body.append(...(scrim ? [scrim] : []), el);
  dispose = mountOverlay(el, () => api.close(), scrim);
  return api;
}

let toastTimer;
export function toast(text, ms = 3200) {
  document.querySelector('.ui-toast')?.remove();
  const t = h('div', { class: 'ui-root ui-toast', role: 'status' }, text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
  return t;
}

/** Segmented tabs: tabs([[id,label,icon?]], current, onPick) -> element with .set(id) */
export function tabs(items, current, onPick) {
  const wrap = h('div', { class: 'ui-sheet-bar', role: 'tablist', style: { overflowX: 'auto' } });
  const set = (id) => {
    for (const b of wrap.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.t === id));
  };
  for (const [id, label, ic] of items) wrap.append(h('button', { type: 'button', role: 'tab', class: 'ui-seg', 'data-t': id, 'aria-selected': String(id === current), onclick: () => { set(id); onPick(id); } }, ic ? icon(ic, 18) : null, label));
  wrap.set = set;
  return wrap;
}
