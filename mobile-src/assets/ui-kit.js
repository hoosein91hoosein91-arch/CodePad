/* CodePad UI kit — view layer only.
   Logic (store, runners, importers) stays in the bundles; this file renders.
   makeKit(React) returns the helpers and the Workbench screen component. */

import { PATHS, FILLED, DOTS } from "./ui-icons.js";
import { mountOverlay } from './ui-overlay.js';


export function applyUiTheme(t) {
  const r = document.documentElement;
  r.dataset.palette = t.palette || 'aurora';
  r.style.setProperty('--ui-code-size', (t.fontSize || 15) + 'px');
  r.style.setProperty('--ui-ligatures', t.ligatures ? 'normal' : 'none');
}

export function makeKit(React) {
  const { createElement: h, useState, useEffect, useRef, useCallback, Fragment } = React;

  function Icon({ n, size, className }) {
    const filled = FILLED.has(n);
    return h(
      'svg',
      {
        className: 'ui-ico' + (className ? ' ' + className : ''),
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false',
        width: size,
        height: size,
        style: filled ? { fill: 'currentColor', stroke: 'none' } : DOTS.has(n) ? { strokeWidth: 3 } : undefined,
      },
      h('path', { d: PATHS[n] || PATHS.box }),
    );
  }

  /* Overlay: drawer / modal with scrim, Escape, focus handoff. */
  function Overlay({ kind = 'modal', title, label, onClose, children, actions }) {
    const ref = useRef(null);
    const scrimRef = useRef(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
      return mountOverlay(ref.current, () => closeRef.current(), scrimRef.current);
    }, []);
    return h(
      Fragment,
      null,
      h('div', { ref: scrimRef, className: 'ui-scrim', onClick: onClose }),
      h(
        'div',
        {
          ref,
          className: 'ui-root ' + (kind === 'drawer' ? 'ui-drawer' : 'ui-modal'),
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': label || title,
          tabIndex: -1,
        },
        h(
          'div',
          { className: 'ui-pane-head' },
          h('h2', null, title),
          actions,
          h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': 'بستن', onClick: onClose }, h(Icon, { n: 'x' })),
        ),
        children,
      ),
    );
  }

  function Section({ title, children }) {
    return h('section', { className: 'ui-sec' }, title ? h('h2', null, title) : null, children);
  }

  function Row({ icon, ext, title, detail, current, onClick, end, dirLtr }) {
    return h(
      'div',
      { className: 'ui-row', 'aria-current': current ? 'true' : undefined },
      h(
        'button',
        { type: 'button', className: 'ui-row ui-fill', style: { padding: 0 }, onClick },
        ext ? h('span', { className: 'ui-ext' }, ext) : icon ? h(Icon, { n: icon }) : null,
        h(
          'span',
          { className: 'ui-row-main' },
          h('strong', { dir: dirLtr ? 'ltr' : undefined, className: dirLtr ? 'ui-ltr' : undefined }, title),
          detail ? h('span', null, detail) : null,
        ),
      ),
      end,
    );
  }

  function State({ icon = 'info', title, text, error, action }) {
    return h(
      'div',
      { className: 'ui-state' + (error ? ' ui-state--error' : ''), role: error ? 'alert' : 'status' },
      h(Icon, { n: icon, size: 28 }),
      h('strong', null, title),
      text ? h('span', null, text) : null,
      action,
    );
  }

  /* keyboard presence: shrinks the shell and hides the dock. */
  function useKeyboard() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
      const vv = window.visualViewport;
      if (!vv) return undefined;
      let base = vv.height;
      const apply = () => {
        const shrink = Math.max(window.innerHeight, base) - vv.height;
        const editing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
        setOpen(shrink > 120 && !!editing);
        document.documentElement.style.setProperty('--ui-vh', vv.height + 'px');
      };
      const reset = () => {
        if (document.activeElement === document.body) base = Math.max(base, vv.height);
        apply();
      };
      vv.addEventListener('resize', apply);
      const onFocusOut = () => setTimeout(reset, 60);
      window.addEventListener('focusout', onFocusOut);
      apply();
      return () => {
        vv.removeEventListener('resize', apply);
        window.removeEventListener('focusout', onFocusOut);
      };
    }, []);
    return open;
  }

  /* ---- Appearance panel ---- */
  const PALETTES = [
    ['aurora', 'Aurora Ink', ['#11131c', '#b7a1ff', '#67d8ef', '#ffc889']],
    ['ember', 'Ember', ['#171310', '#ffaa73', '#9dcfff', '#f3d58b']],
    ['porcelain', 'Porcelain', ['#f5f2ff', '#6846c6', '#086e86', '#a75018']],
  ];

  function Appearance({ theme, setTheme, resetTheme, onClose, extra }) {
    const size = theme.fontSize || 15;
    return h(
      Overlay,
      { kind: 'modal', title: 'ظاهر و ویرایشگر', onClose },
      h(
        'div',
        { className: 'ui-pane-body' },
        h(
          Section,
          { title: 'پالت' },
          h(
            'div',
            { className: 'ui-swatches' },
            PALETTES.map(([id, name, cols]) =>
              h(
                'button',
                { key: id, type: 'button', className: 'ui-swatch', 'aria-pressed': (theme.palette || 'aurora') === id, onClick: () => setTheme({ palette: id }) },
                h('i', null, cols.map((c) => h('b', { key: c, style: { background: c } }))),
                name,
              ),
            ),
          ),
          h('p', { className: 'ui-caption' }, 'پالت فقط پوستهٔ برنامه را عوض می‌کند. زمینهٔ کد در همهٔ پالت‌ها #000000 می‌ماند.'),
        ),
        h(
          Section,
          { title: 'نوشتار کد' },
          h(
            'div',
            { className: 'ui-field' },
            h('label', { htmlFor: 'ui-fs' }, 'اندازهٔ قلم کد: ', h('span', { className: 'ui-ltr' }, size + 'px')),
            h('input', { id: 'ui-fs', className: 'ui-range', type: 'range', min: 12, max: 26, value: size, onChange: (e) => setTheme({ fontSize: +e.target.value }) }),
          ),
          h(
            'div',
            { className: 'ui-switch' },
            h('label', { htmlFor: 'ui-lig' }, 'لیگچر فونت کد'),
            h('input', { id: 'ui-lig', type: 'checkbox', checked: !!theme.ligatures, onChange: (e) => setTheme({ ligatures: e.target.checked }) }),
          ),
          h(
            'div',
            { className: 'ui-switch' },
            h('label', { htmlFor: 'ui-ac' }, 'تکمیل خودکار'),
            h('input', { id: 'ui-ac', type: 'checkbox', checked: theme.autocomplete !== false, onChange: (e) => setTheme({ autocomplete: e.target.checked }) }),
          ),
          h(
            'div',
            { className: 'ui-card ui-card--line', 'aria-label': 'پیش‌نمایش' },
            h('p', { className: 'ui-caption', style: { margin: 0 } }, 'پیش‌نمایش'),
            h(
              'pre',
              {
                className: 'ui-ltr',
                style: { margin: '8px 0 0', background: '#000', padding: 12, borderRadius: 12, fontSize: size, lineHeight: 1.65, overflow: 'auto', color: 'var(--ui-code)' },
              },
              h('span', { style: { color: 'var(--ui-syn-comment)' } }, '# سلام دنیا — main.py\n'),
              h('span', { style: { color: 'var(--ui-syn-keyword)' } }, 'def '),
              h('span', { style: { color: 'var(--ui-syn-function)' } }, 'hello'),
              '(name):\n    ',
              h('span', { style: { color: 'var(--ui-syn-keyword)' } }, 'return '),
              h('span', { style: { color: 'var(--ui-syn-string)' } }, 'f"Hello, {name}"'),
              '\n0 O  1 l I  != === =>',
            ),
          ),
        ),
        extra,
        h(
          'div',
          null,
          h('button', { type: 'button', className: 'ui-btn ui-btn--line', onClick: resetTheme }, 'بازنشانی ظاهر'),
        ),
      ),
    );
  }

  /* ---- Workbench ---- */
  function Workbench(p) {
    const kb = useKeyboard();
    const [drawer, setDrawer] = useState(false);
    const [menu, setMenu] = useState(false);
    const [look, setLook] = useState(false);
    const [adding, setAdding] = useState(null);
    const [tab, setTab] = useState(p.panel === 'stage' ? 'stage' : 'out');
    const [mode, setMode] = useState('split');
    const [ratio, setRatio] = useState(0.58);
    const [term, setTerm] = useState('');
    const workRef = useRef(null);
    const fileIn = useRef(null);
    const attachIn = useRef(null);
    const logRef = useRef(null);

    useEffect(() => {
      if (p.panel === 'stage') setTab('stage');
      else if (tab === 'stage') setTab('out');
    }, [p.panel]);
    useEffect(() => {
      const n = logRef.current;
      n && (n.scrollTop = n.scrollHeight);
    }, [p.lines, tab]);
    useEffect(() => {
      applyUiTheme(p.theme);
    }, [p.theme.palette, p.theme.fontSize, p.theme.ligatures]);

    const pick = (t) => {
      setTab(t);
      if (t === 'stage') p.setPanel('stage');
      else p.setPanel('out');
      if (mode === 'min') setMode('split');
    };
    const showStage = tab === 'stage';
    const drag = (e) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const r = workRef.current?.getBoundingClientRect();
      if (r && r.height > 0) setRatio(Math.min(0.85, Math.max(0.15, (e.clientY - r.top) / r.height)));
    };
    const close = (fn) => (...a) => {
      setDrawer(false);
      setAdding(null);
      return fn && fn(...a);
    };

    const hasStage = p.stageLabel;
    const rows = mode === 'full' ? '0fr 1fr' : mode === 'min' ? '1fr auto' : `${ratio}fr ${1 - ratio}fr`;
    const sheetClass = 'ui-sheet';

    const filesPanel = h(
      'div',
      { className: 'ui-pane-body' },
      h(
        Section,
        { title: 'پروژه‌ها' },
        h(
          'div',
          { className: 'ui-list' },
          p.projects.map((pr) =>
            h(Row, {
              key: pr.id,
              icon: 'folder',
              title: pr.name,
              detail: pr.files.length + ' فایل',
              current: pr.id === p.project.id,
              onClick: close(() => p.onSelectProject(pr.id)),
              end: h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': 'حذف پروژه ' + pr.name, disabled: p.projects.length < 2, onClick: () => p.onRemoveProject(pr.id) }, h(Icon, { n: 'trash' })),
            }),
          ),
        ),
        adding === 'project'
          ? h(
              'div',
              { className: 'ui-list' },
              p.projectKinds.map((k) => h(Row, { key: k.kind, icon: 'plus', title: k.title, detail: k.detail, onClick: close(() => p.onNewProject(k.kind)) })),
              p.packs.map((k) => h(Row, { key: 'pack-' + k.id, icon: 'box', title: k.title, detail: k.detail, onClick: close(() => p.onNewPack(k.text)) })),
            )
          : h('button', { type: 'button', className: 'ui-btn ui-btn--primary', onClick: () => setAdding('project') }, h(Icon, { n: 'plus' }), 'پروژهٔ تازه'),
        h('button', { type: 'button', className: 'ui-btn ui-btn--quiet', style: { justifyContent: 'flex-start' }, onClick: close(p.onRecovery) }, h(Icon, { n: 'clock' }), 'تاریخچه، پشتیبان و کتابخانه‌ها'),
      ),
      h(
        Section,
        { title: 'فایل‌های ' + p.project.name },
        h(
          'div',
          { className: 'ui-list' },
          p.project.files.map((f) =>
            h(Row, {
              key: f.id,
              ext: p.meta[f.lang].short,
              title: f.name,
              dirLtr: true,
              current: f.id === p.file.id,
              onClick: close(() => p.onSelectFile(f.id, f.lang)),
              end: h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': 'حذف ' + f.name, disabled: p.project.files.length < 2, onClick: () => p.onRemoveFile(f.id) }, h(Icon, { n: 'trash' })),
            }),
          ),
        ),
        adding === 'file'
          ? h(
              'div',
              { className: 'ui-list' },
              p.fileKinds.map((k) => h(Row, { key: k, icon: 'file', title: p.meta[k].label, onClick: close(() => p.onNewFile(k)) })),
            )
          : h('button', { type: 'button', className: 'ui-btn ui-btn--line', onClick: () => setAdding('file') }, h(Icon, { n: 'file' }), 'فایل تازه'),
      ),
      h(
        Section,
        { title: 'پیوست‌ها' },
        h('p', { className: 'ui-caption' }, 'عکس یا فایل با نامش در صفحه یا پایتون استفاده می‌شود: ', h('span', { className: 'ui-ltr' }, 'photo.png'), ' در html و ', h('span', { className: 'ui-ltr' }, 'open("data.csv")'), ' در پایتون. روی یک پیوست بزنی، نامش در کد گذاشته می‌شود.'),
        p.attachments.length === 0 ? h('p', { className: 'ui-caption' }, 'هنوز پیوستی ندارد.') : null,
        p.attachments.map((a) => p.renderAttachment(a, () => setDrawer(false))),
        h('input', { ref: attachIn, type: 'file', multiple: true, className: 'ui-sr', tabIndex: -1, onChange: (e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; p.onAddAttachments(f); } }),
        h('button', { type: 'button', className: 'ui-btn ui-btn--line', onClick: () => attachIn.current?.click() }, h(Icon, { n: 'image' }), 'افزودن عکس یا فایل'),
      ),
      h(
        Section,
        { title: 'خروجی' },
        h('button', { type: 'button', className: 'ui-btn ui-btn--line', onClick: close(p.onExport) }, h(Icon, { n: 'save' }), 'ساخت APK یا برنامهٔ PC از پروژهٔ فعال'),
      ),
    );

    const menuItems = [
      ['maxi', mode === 'code' ? 'بازگشت از تمام‌صفحهٔ کد' : 'تمام‌صفحهٔ کد', () => setMode(mode === 'code' ? 'split' : 'code')],
      ['open', 'باز کردن فایل یا ZIP پروژه', () => fileIn.current?.click()],
      ['undo', 'بازگردانی', p.onUndo],
      ['redo', 'ازنو', p.onRedo],
      ['save', 'خروجی APK یا PC', p.onExport],
      ['box', 'نصب پروژهٔ فعال در برنامه‌ها', p.onInstall],
      ...(p.canSaveHtml ? [['globe', 'ذخیره به‌صورت صفحهٔ HTML', p.onSaveHtml]] : []),
      ['tool', 'Studio و ابزارها', p.onStudio],
      ['clock', 'تاریخچه و پشتیبان', p.onRecovery],
    ];

    return h(
      'main',
      { className: 'ui-root ui-app', 'data-kb': kb ? 'open' : undefined, 'data-wide': '', style: { height: 'var(--ui-vh, 100dvh)' } },
      h(
        'header',
        { className: 'ui-top' },
        h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': 'پروژه‌ها و فایل‌ها', onClick: () => setDrawer(true) }, h(Icon, { n: 'menu' })),
        h(
          'button',
          { type: 'button', className: 'ui-crumb ui-fill', onClick: () => setDrawer(true), 'aria-label': 'پروژه ' + p.project.name + '، فایل ' + p.file.name },
          h('strong', null, p.project.name),
          h('span', { className: 'ui-ltr' }, p.file.name),
        ),
        h('input', { ref: fileIn, type: 'file', multiple: true, className: 'ui-sr', tabIndex: -1, onChange: (e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; p.onOpenFiles(f); } }),
        h(
          'button',
          { type: 'button', className: 'ui-run', 'data-codepad-run': true, 'data-running': p.running ? 'true' : 'false', onClick: () => (p.running ? p.onStop() : p.onRun()) },
          h(Icon, { n: p.running ? 'stop' : 'play' }),
          p.running ? 'توقف' : p.project.entryFile ? 'اجرای پروژه' : 'اجرا',
        ),
        h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': 'گزینه‌های بیشتر', 'aria-expanded': menu, onClick: () => setMenu(true) }, h(Icon, { n: 'more' })),
      ),
      h(
        'nav',
        { className: 'ui-tabs', 'aria-label': 'فایل‌های باز' },
        p.project.files.map((f) =>
          h('button', { key: f.id, type: 'button', className: 'ui-tab', 'aria-current': f.id === p.file.id ? 'true' : undefined, onClick: () => p.onSelectFile(f.id, f.lang) }, h('small', null, p.meta[f.lang].short), f.name),
        ),
        h('button', { type: 'button', className: 'ui-btn ui-btn--tool', style: { minHeight: 44, width: 44 }, 'aria-label': 'فایل تازه', onClick: () => { setAdding('file'); setDrawer(true); } }, h(Icon, { n: 'plus' })),
      ),
      h(
        'aside',
        { className: 'ui-sidebar', 'aria-label': 'فایل‌ها و پروژه‌ها' },
        drawer ? null : filesPanel,
      ),
      h(
        'div',
        { ref: workRef, className: 'ui-work', 'data-mode': mode, style: { '--ui-rows': rows } },
        h('section', { className: 'ui-canvas' }, p.editor),
        h(
          'section',
          { className: sheetClass, 'aria-label': 'خروجی' },
          h('div', {
            className: 'ui-grip',
            role: 'separator',
            'aria-orientation': 'horizontal',
            'aria-label': 'تغییر اندازهٔ پنل خروجی',
            onPointerDown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); setMode('split'); },
            onPointerMove: drag,
          }),
          h(
            'div',
            { className: 'ui-sheet-bar', role: 'tablist' },
            h('button', { type: 'button', role: 'tab', className: 'ui-seg', 'aria-selected': tab === 'out', onClick: () => pick('out') }, h(Icon, { n: 'code', size: 18 }), 'خروجی'),
            h('button', { type: 'button', role: 'tab', className: 'ui-seg', 'aria-selected': tab === 'term', onClick: () => pick('term') }, h(Icon, { n: 'term', size: 18 }), 'ترمینال'),
            h('button', { type: 'button', role: 'tab', className: 'ui-seg', 'aria-selected': tab === 'stage', onClick: () => pick('stage') }, h(Icon, { n: 'eye', size: 18 }), p.stageLabel),
            h('span', { className: 'ui-fill' }),
            tab !== 'stage' ? h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': 'پاک‌کردن خروجی', onClick: p.onClear }, h(Icon, { n: 'trash' })) : null,
            tab !== 'stage' ? h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': p.copied ? 'کپی شد' : 'کپی خروجی', onClick: p.onCopy }, h(Icon, { n: p.copied ? 'check' : 'copy' })) : null,
            h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': mode === 'full' ? 'اندازهٔ معمولی' : 'تمام‌صفحه‌کردن پنل', onClick: () => setMode(mode === 'full' ? 'split' : 'full') }, h(Icon, { n: mode === 'full' ? 'mini' : 'maxi' })),
            h('button', { type: 'button', className: 'ui-btn ui-btn--tool', 'aria-label': mode === 'min' ? 'باز کردن خروجی' : 'کوچک‌کردن خروجی', onClick: () => setMode(mode === 'min' ? 'split' : 'min') }, h(Icon, { n: mode === 'min' ? 'up' : 'down' })),
          ),
          mode === 'min'
            ? null
            : showStage
              ? p.stage
              : h(
                  Fragment,
                  null,
                  h(
                    'div',
                    { ref: logRef, className: 'ui-log', 'aria-live': 'polite', dir: 'ltr' },
                    p.lines.length === 0 ? h('p', { className: 'ui-empty', dir: 'rtl' }, 'هنوز خروجی‌ای نیست. اجرا را بزن تا نتیجه اینجا بیاید.') : null,
                    p.lines.map((l) => h('p', { key: l.id, dir: 'auto', className: 'is-' + l.stream }, l.text)),
                  ),
                  tab === 'out' && p.stdinOn
                    ? h(
                        'label',
                        { className: 'ui-stdin' },
                        h('span', null, p.stdinLabel),
                        h('textarea', { value: p.stdin, onChange: (e) => p.onStdin(e.target.value), rows: 2, dir: 'ltr', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'ورودی برنامه', placeholder: p.stdinPlaceholder }),
                      )
                    : null,
                  tab === 'term'
                    ? h(
                        Fragment,
                        null,
                        p.busy ? h('div', { role: 'status', dir: 'auto', className: 'ui-status' }, p.busy) : null,
                        h(
                          'form',
                          { className: 'ui-term', onSubmit: (e) => { e.preventDefault(); const t = term; setTerm(''); p.onTerminal(t); } },
                          h('b', null, '$'),
                          h('input', { value: term, onChange: (e) => setTerm(e.target.value), placeholder: 'help · pip install numpy', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'ترمینال' }),
                        ),
                      )
                    : null,
                ),
        ),
      ),
      h(
        'div',
        { className: 'ui-keys', 'data-when': 'kb', role: 'toolbar', 'aria-label': 'کلیدهای کمکی' },
        p.keys.map((k) =>
          h('button', { key: p.file.lang + '-' + k.label, type: 'button', className: 'ui-key' + (/[؀-ۿ]/.test(k.label) ? ' ui-key--fa' : '') + (k.accent ? ' ui-key--accent' : ''), onMouseDown: (e) => e.preventDefault(), onClick: () => p.onKey(k) }, k.label),
        ),
      ),
      h(
        'nav',
        { className: 'ui-dock', 'aria-label': 'بخش‌های برنامه' },
        h('button', { type: 'button', className: 'ui-dock-btn', 'aria-current': 'page' }, h(Icon, { n: 'code' }), 'ویرایشگر'),
        h(p.Link, { to: '/launcher', className: 'ui-dock-btn' }, h(Icon, { n: 'grid' }), 'برنامه‌ها'),
        h('button', { type: 'button', className: 'ui-dock-btn', onClick: p.onHub }, h(Icon, { n: 'spark' }), 'هاب'),
        h('button', { type: 'button', className: 'ui-dock-btn', onClick: () => setLook(true) }, h(Icon, { n: 'sliders' }), 'ظاهر'),
      ),
      drawer ? h(Overlay, { kind: 'drawer', title: 'پروژه و فایل‌ها', onClose: () => { setDrawer(false); setAdding(null); } }, filesPanel) : null,
      menu
        ? h(
            Overlay,
            { kind: 'modal', title: 'گزینه‌ها', onClose: () => setMenu(false) },
            h(
              'div',
              { className: 'ui-pane-body' },
              h('div', { className: 'ui-list' }, menuItems.map(([ic, t, fn]) => h(Row, { key: t, icon: ic, title: t, onClick: () => { setMenu(false); fn && fn(); } }))),
            ),
          )
        : null,
      look ? h(Appearance, { theme: p.theme, setTheme: p.setTheme, resetTheme: p.resetTheme, onClose: () => setLook(false) }) : null,
      p.dialogs,
    );
  }

  /* ---- form + sheet helpers ---- */
  function Fld({ label, hint, children, id }) {
    return h('div', { className: 'ui-field' }, label ? h('label', { htmlFor: id }, label) : null, children, hint ? h('span', { className: 'ui-caption' }, hint) : null);
  }
  function Input({ mono, className, ...r }) {
    return h('input', { ...r, className: 'ui-input' + (mono ? ' ui-ltr' : '') + (className ? ' ' + className : ''), dir: mono ? 'ltr' : r.dir });
  }
  function Area({ mono, className, ...r }) {
    return h('textarea', { spellCheck: false, ...r, className: 'ui-input ui-area' + (mono ? ' ui-ltr' : '') + (className ? ' ' + className : ''), dir: mono ? 'ltr' : r.dir });
  }
  function Sel({ mono, className, children, ...r }) {
    return h('select', { ...r, className: 'ui-input' + (mono ? ' ui-ltr' : '') + (className ? ' ' + className : ''), dir: mono ? 'ltr' : r.dir }, children);
  }
  function Btn({ kind, icon, children, className, ...r }) {
    return h('button', { type: 'button', ...r, className: 'ui-btn' + (kind ? ' ui-btn--' + kind : '') + (className ? ' ' + className : '') }, icon ? h(Icon, { n: icon }) : null, children);
  }
  function Sw({ label, hint, checked, onChange, id, disabled }) {
    return h(
      'div',
      { className: 'ui-switch' },
      h('label', { htmlFor: id }, label, hint ? h('span', { className: 'ui-caption', style: { display: 'block' } }, hint) : null),
      h('input', { id, type: 'checkbox', checked: !!checked, disabled, onChange: (e) => onChange(e.target.checked), 'aria-label': label }),
    );
  }
  function Note({ tone, children, ...r }) {
    return h('div', { ...r, className: 'ui-notice' + (tone ? ' ui-notice--' + tone : ''), role: tone === 'err' ? 'alert' : 'status' }, children);
  }
  function Sheet({ open = true, onOpenChange, title, children, testId, kind = 'modal' }) {
    if (!open) return null;
    return h(Overlay, { kind, title, onClose: () => onOpenChange && onOpenChange(false) }, h('div', { className: 'ui-pane-body', 'data-testid': testId }, children));
  }
  function Details({ title, icon, open, onToggle, children, ...r }) {
    return h(
      'details',
      { ...r, className: 'ui-card ui-details', open, onToggle: (e) => onToggle && onToggle(e.currentTarget.open) },
      h('summary', null, icon ? h(Icon, { n: icon, size: 18 }) : null, title),
      h('div', { className: 'ui-stack', style: { marginTop: 12 } }, children),
    );
  }
  function AppIcon({ app, size = 56, radius = 16 }) {
    return h(
      'span',
      { className: 'ui-appicon', style: { width: size, height: size, borderRadius: radius, background: app.iconColor || 'var(--ui-surface-2)' } },
      app.iconImage ? h('img', { src: app.iconImage, alt: '', draggable: false }) : h('span', { style: { fontSize: Math.round(size * 0.46) } }, app.icon),
    );
  }

  return { h, Icon, Overlay, Section, Row, State, Appearance, Workbench, useKeyboard, Fld, Input, Area, Sel, Btn, Sw, Note, Sheet, Details, AppIcon };
}
