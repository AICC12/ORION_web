/* =====================================================================
   ORION — Inline Edit Mode  (edit.js)
   --------------------------------------------------------------------
   On-page editor, no framework, no backend. Two sub-modes:

     TEXT MODE   · click text to type
                 · select text → floating bar: bold / weight / SIZE /
                   colour / alignment / clear
                 · click an image → replace it with a local file

     DESIGN MODE · click any block → side panel: background · text
                   colour · font-size · padding · radius
                 · DRAG the block (or arrow keys) to move it

   Everything is saved to localStorage per page and restored on load
   (even with edit mode off). Toolbar: 초기화 · HTML 내보내기 · 완료.
   ===================================================================== */

(function () {
  'use strict';

  var PAGE = location.pathname.split('/').pop() || 'index.html';
  var CKEY = 'orionEdit:content:' + PAGE;   // { oeid: innerHTML }
  var SKEY = 'orionEdit:style:'   + PAGE;   // { oeid: { prop: value } }
  var IKEY = 'orionEdit:img:'     + PAGE;   // { oeid: dataURL }

  /* -------- helpers ---------------------------------------------- */
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function persist(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); return true; } catch (e) { toast('저장 공간이 가득 찼습니다 (이미지가 너무 큼)'); return false; } }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function rgbToHex(c) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
    if (!m) return (c && c[0] === '#') ? c : '#000000';
    return '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + (+n).toString(16)).slice(-2); }).join('');
  }

  /* -------- id every editable / stylable block (document order) --- */
  var ID_SEL = [
    'main section', 'main .container', 'main .split > *', 'main .head-block',
    'main .feature', 'main .spec', 'main .stat', 'main .dir-link',
    'main .figure', 'main .morph', 'main .media-band', 'main .btn',
    'main .eyebrow', 'main h1', 'main h2', 'main h3', 'main .lead', 'main p',
    'main .figure__cap', 'main .morph__hint', 'main img',
    'footer', 'footer .footer-col', 'footer .footer-brand',
    'footer .footer-brand small', 'footer .footer-bottom span'
  ].join(',');
  var all = [].slice.call(document.querySelectorAll(ID_SEL));
  all.forEach(function (el, i) { el.setAttribute('data-oeid', 'n' + i); });

  /* text-editable subset (leaf text blocks, no nesting duplicates) */
  var TEXT_SEL = [
    'main .eyebrow', 'main h1', 'main h2', 'main h3', 'main .lead',
    'main .feature p', 'main .feature .kr', 'main .spec__val', 'main .spec__key',
    'main .stat__val', 'main .stat__key', 'main .step__body p',
    'main .figure__cap', 'main .morph__hint', 'main .dir-link p', 'main p',
    'footer .footer-brand small', 'footer .footer-bottom span'
  ].join(',');
  var textEls = [].slice.call(document.querySelectorAll(TEXT_SEL));
  textEls = textEls.filter(function (el) { return !textEls.some(function (o) { return o !== el && o.contains(el); }); });
  var textSet = new Set(textEls);

  /* replaceable images */
  var IMG_SEL = 'main .figure img, main .hero__media img, main .media-band__bg img, main .morph img, main .showcase__frame img';
  var imgs = [].slice.call(document.querySelectorAll(IMG_SEL));
  imgs.forEach(function (el) { el.classList.add('oe-img'); if (el.parentElement) el.parentElement.classList.add('oe-imgwrap'); });

  /* -------- stores ----------------------------------------------- */
  var contentMap = load(CKEY) || {};
  var styleMap   = load(SKEY) || {};
  var imgMap     = load(IKEY) || {};

  function elById(id) { return document.querySelector('[data-oeid="' + id + '"]'); }

  /* -------- restore saved edits (always) ------------------------- */
  (function restore() {
    // content first (may rewrite innerHTML), then styles, then images
    textEls.forEach(function (el) { var v = contentMap[el.getAttribute('data-oeid')]; if (v != null) el.innerHTML = v; });
    Object.keys(styleMap).forEach(function (id) {
      var el = elById(id); if (!el) return;
      var s = styleMap[id]; for (var p in s) if (s.hasOwnProperty(p)) el.style.setProperty(p, s[p]);
    });
    imgs.forEach(function (el) { var v = imgMap[el.getAttribute('data-oeid')]; if (v) { el.src = v; el.style.removeProperty('opacity'); } });
  })();

  /* -------- persistence ------------------------------------------ */
  var saveContent = debounce(function () {
    textEls.forEach(function (el) { contentMap[el.getAttribute('data-oeid')] = el.innerHTML; });
    persist(CKEY, contentMap);
  }, 350);
  var saveStyle = debounce(function () { persist(SKEY, styleMap); }, 250);

  function setStyle(el, prop, val) {
    var id = el.getAttribute('data-oeid'); if (!id) return;
    if (!styleMap[id]) styleMap[id] = {};
    if (val === '' || val == null) { delete styleMap[id][prop]; el.style.removeProperty(prop); }
    else { styleMap[id][prop] = val; el.style.setProperty(prop, val); }
    saveStyle();
  }

  function saveImage(id, dataURL) { imgMap[id] = dataURL; persist(IKEY, imgMap); }

  /* =================================================================
     MODE MACHINE
  ================================================================= */
  var editing = false, mode = 'text';

  function applyMode() {
    document.body.classList.toggle('oe-editing', editing);
    document.body.classList.toggle('oe-design', editing && mode === 'design');
    // text elements editable only in text mode
    textEls.forEach(function (el) {
      if (editing && mode === 'text') el.setAttribute('contenteditable', 'true');
      else el.removeAttribute('contenteditable');
    });
    segText.classList.toggle('is-on', mode === 'text');
    segDesign.classList.toggle('is-on', mode === 'design');
    fabLabel.textContent = editing ? '편집 종료' : '편집 모드';
    if (!editing) { hideFmt(); deselect(); }
    if (editing && mode !== 'design') deselect();
  }
  function setEditing(on) {
    editing = on;
    if (on) toast(mode === 'text'
      ? '텍스트 클릭=수정 · 드래그=서식(크기·굵기·색·정렬) · 이미지 클릭=교체'
      : '블록을 클릭해 선택 → 패널에서 디자인, 드래그/방향키로 이동');
    applyMode();
  }
  function setMode(m) { mode = m; applyMode(); if (editing) toast(m === 'design' ? '디자인 모드 · 블록을 클릭하세요' : '텍스트 모드'); }

  /* =================================================================
     TEXT MODE — live typing + format toolbar
  ================================================================= */
  document.addEventListener('input', function (e) {
    if (!editing || mode !== 'text') return;
    if (e.target.closest && e.target.closest('[data-oeid]')) saveContent();
  });

  var fmt = document.createElement('div');
  fmt.className = 'oe-format';
  fmt.innerHTML =
    '<button class="oe-f" data-fmt="bold" title="굵게"><b>B</b></button>' +
    '<button class="oe-f" data-weight="400" title="얇게">400</button>' +
    '<button class="oe-f" data-weight="500" title="보통">500</button>' +
    '<button class="oe-f" data-weight="700" title="굵게">700</button>' +
    '<span class="oe-f-sep"></span>' +
    '<button class="oe-f" data-size="-" title="작게">A−</button>' +
    '<button class="oe-f" data-size="+" title="크게">A+</button>' +
    '<span class="oe-f-sep"></span>' +
    '<button class="oe-sw" data-color="#0a0b0d" style="background:#0a0b0d" title="검정"></button>' +
    '<button class="oe-sw" data-color="#e11d2a" style="background:#e11d2a" title="레드"></button>' +
    '<button class="oe-sw" data-color="#6e6e73" style="background:#6e6e73" title="그레이"></button>' +
    '<button class="oe-sw oe-sw--ring" data-color="#ffffff" style="background:#fff" title="흰색"></button>' +
    '<label class="oe-sw oe-sw--pick" title="사용자 색상"><input type="color" data-colorpick></label>' +
    '<span class="oe-f-sep"></span>' +
    '<button class="oe-f" data-align="left" title="왼쪽">⇤</button>' +
    '<button class="oe-f" data-align="center" title="가운데">↔</button>' +
    '<button class="oe-f" data-align="right" title="오른쪽">⇥</button>' +
    '<span class="oe-f-sep"></span>' +
    '<button class="oe-f" data-fmt="clear" title="서식 지우기">✕</button>';
  document.body.appendChild(fmt);
  var colorPick = fmt.querySelector('[data-colorpick]');
  var savedRange = null;

  function activeEditable() {
    var sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
    var n = sel.getRangeAt(0).commonAncestorContainer; n = n.nodeType === 1 ? n : n.parentElement;
    return n ? n.closest('[data-oeid]') : null;
  }
  function wrapRange(css) {
    var sel = window.getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0), span = document.createElement('span'); span.style.cssText = css;
    try { range.surroundContents(span); } catch (e) { span.appendChild(range.extractContents()); range.insertNode(span); }
    sel.removeAllRanges(); var r = document.createRange(); r.selectNodeContents(span); sel.addRange(r);
  }
  function applyColor(c) { document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, c); }
  function stepSize(dir) {
    var el = activeEditable(); if (!el) return;
    var cur = parseFloat(getComputedStyle(el).fontSize) || 16;
    var next = Math.max(9, Math.min(200, Math.round(cur * (dir === '+' ? 1.1 : 0.9))));
    setStyle(el, 'font-size', next + 'px');
  }

  function showFmt() {
    if (!editing || mode !== 'text') { hideFmt(); return; }
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed || !activeEditable()) { hideFmt(); return; }
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) { hideFmt(); return; }
    fmt.classList.add('is-on');
    var bar = fmt.getBoundingClientRect();
    var top = rect.top - bar.height - 12; if (top < 8) top = rect.bottom + 12;
    var left = Math.min(Math.max(rect.left + rect.width / 2, bar.width / 2 + 8), window.innerWidth - bar.width / 2 - 8);
    fmt.style.top = top + 'px'; fmt.style.left = left + 'px';
  }
  function hideFmt() { fmt.classList.remove('is-on'); }

  fmt.addEventListener('mousedown', function (e) { if (e.target.type !== 'color') e.preventDefault(); });
  fmt.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fmt],[data-weight],[data-color],[data-align],[data-size]'); if (!b) return;
    if (b.dataset.fmt === 'bold') document.execCommand('bold');
    else if (b.dataset.fmt === 'clear') { document.execCommand('removeFormat'); var el = activeEditable(); if (el) setStyle(el, 'text-align', ''); }
    else if (b.dataset.weight) wrapRange('font-weight:' + b.dataset.weight);
    else if (b.dataset.size) stepSize(b.dataset.size);
    else if (b.dataset.color) applyColor(b.dataset.color);
    else if (b.dataset.align) { var e2 = activeEditable(); if (e2) setStyle(e2, 'text-align', b.dataset.align); }
    saveContent(); requestAnimationFrame(showFmt);
  });
  colorPick.addEventListener('mousedown', function () { var s = window.getSelection(); savedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; });
  colorPick.addEventListener('input', function () {
    if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
    applyColor(this.value); saveContent(); requestAnimationFrame(showFmt);
  });
  document.addEventListener('selectionchange', function () { requestAnimationFrame(showFmt); });
  window.addEventListener('scroll', hideFmt, { passive: true });

  /* =================================================================
     IMAGE REPLACE  (text mode; morph is shown side-by-side while
     editing so the two layers never overlap during replacement)
  ================================================================= */
  var filePicker = document.createElement('input');
  filePicker.type = 'file'; filePicker.accept = 'image/*'; filePicker.style.display = 'none';
  document.body.appendChild(filePicker);
  var targetImg = null;

  document.addEventListener('click', function (e) {
    if (!editing || mode !== 'text') return;
    var img = e.target.closest && e.target.closest('.oe-img'); if (!img) return;
    e.preventDefault(); targetImg = img; filePicker.value = ''; filePicker.click();
  }, true);

  filePicker.addEventListener('change', function () {
    var file = filePicker.files && filePicker.files[0]; if (!file || !targetImg) return;
    var reader = new FileReader();
    reader.onload = function () {
      targetImg.src = reader.result;
      targetImg.style.removeProperty('opacity');           // ← never pin opacity (was the overlap bug)
      saveImage(targetImg.getAttribute('data-oeid'), reader.result);
      toast('이미지를 교체했습니다');
    };
    reader.readAsDataURL(file);
  });

  /* =================================================================
     DESIGN MODE — select a block, style it, drag to move
  ================================================================= */
  var selEl = null;

  var panel = document.createElement('div');
  panel.className = 'oe-panel';
  panel.innerHTML =
    '<div class="oe-panel__h"><span class="oe-panel__t">디자인</span><button class="oe-x" data-p="close">✕</button></div>' +
    '<div class="oe-panel__tag" data-tag>—</div>' +
    '<div class="oe-row"><label>배경색</label><span><input type="color" data-p="bg"><button class="oe-mini" data-p="bg-none">없음</button></span></div>' +
    '<div class="oe-row"><label>글자색</label><input type="color" data-p="fg"></div>' +
    '<div class="oe-row"><label>글자 크기 <b data-v="fs"></b></label><input type="range" min="10" max="140" data-p="fs"></div>' +
    '<div class="oe-row"><label>안쪽 여백 <b data-v="pad"></b></label><input type="range" min="0" max="100" data-p="pad"></div>' +
    '<div class="oe-row"><label>모서리 <b data-v="rad"></b></label><input type="range" min="0" max="60" data-p="rad"></div>' +
    '<div class="oe-row"><label>크기(너비) <b data-v="w"></b></label><input type="range" min="20" max="100" data-p="w"></div>' +
    '<div class="oe-panel__note">블록을 <b>드래그</b>하거나 <b>방향키</b>로 이동 · 우하단 <b>모서리 핸들</b>로 크기 조절</div>' +
    '<div class="oe-panel__foot"><button class="oe-mini" data-p="parent">▲ 부모 선택</button><button class="oe-mini" data-p="reset-el">이 블록 초기화</button></div>';
  document.body.appendChild(panel);

  function curTranslate(el) {
    var s = styleMap[el.getAttribute('data-oeid')];
    var m = /translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/.exec((s && s.transform) || '');
    return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
  }
  function setTranslate(el, x, y) { setStyle(el, 'transform', 'translate(' + x + 'px, ' + y + 'px)'); }

  function fillPanel(el) {
    var cs = getComputedStyle(el);
    panel.querySelector('[data-tag]').textContent =
      el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').filter(function (c) { return c && c.indexOf('oe-') !== 0; })[0] : '');
    panel.querySelector('[data-p="bg"]').value = rgbToHex(cs.backgroundColor);
    panel.querySelector('[data-p="fg"]').value = rgbToHex(cs.color);
    var fs = Math.round(parseFloat(cs.fontSize)); panel.querySelector('[data-p="fs"]').value = fs; panel.querySelector('[data-v="fs"]').textContent = fs + 'px';
    var pad = Math.round(parseFloat(cs.paddingTop)); panel.querySelector('[data-p="pad"]').value = pad; panel.querySelector('[data-v="pad"]').textContent = pad + 'px';
    var rad = Math.round(parseFloat(cs.borderTopLeftRadius)); panel.querySelector('[data-p="rad"]').value = rad; panel.querySelector('[data-v="rad"]').textContent = rad + 'px';
    var pw = el.parentElement ? Math.round(el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width * 100) : 100;
    pw = Math.max(20, Math.min(100, pw)); panel.querySelector('[data-p="w"]').value = pw; panel.querySelector('[data-v="w"]').textContent = pw + '%';
  }
  /* corner handle for resizing the selected block (esp. images) */
  var handle = document.createElement('div');
  handle.className = 'oe-resize';
  document.body.appendChild(handle);
  function placeHandle() {
    if (!editing || mode !== 'design' || !selEl) { handle.style.display = 'none'; return; }
    var r = selEl.getBoundingClientRect();
    handle.style.display = 'block';
    handle.style.left = (r.right - 8) + 'px';
    handle.style.top  = (r.bottom - 8) + 'px';
  }

  function selectEl(el) {
    if (selEl) selEl.classList.remove('oe-selected');
    selEl = el; el.classList.add('oe-selected');
    fillPanel(el); panel.classList.add('is-on'); placeHandle();
  }
  function deselect() { if (selEl) selEl.classList.remove('oe-selected'); selEl = null; panel.classList.remove('is-on'); placeHandle(); }

  // select on click
  document.addEventListener('click', function (e) {
    if (!editing || mode !== 'design') return;
    if (e.target.closest('.oe-panel, .oe-bar, .oe-fab, .oe-format, .oe-resize')) return;
    var el = e.target.closest('[data-oeid]');
    if (!el) return;
    // clicking an image selects its sizing box so width/resize feels natural
    if (el.tagName === 'IMG') { var box = el.closest('.figure, .morph, .media-band, .showcase__frame'); if (box && box.hasAttribute('data-oeid')) el = box; }
    e.preventDefault(); e.stopPropagation(); selectEl(el);
  }, true);

  // panel controls
  panel.addEventListener('input', function (e) {
    if (!selEl) return; var p = e.target.getAttribute('data-p');
    if (p === 'bg') setStyle(selEl, 'background-color', e.target.value);
    else if (p === 'fg') setStyle(selEl, 'color', e.target.value);
    else if (p === 'fs') { setStyle(selEl, 'font-size', e.target.value + 'px'); panel.querySelector('[data-v="fs"]').textContent = e.target.value + 'px'; }
    else if (p === 'pad') { setStyle(selEl, 'padding', e.target.value + 'px'); panel.querySelector('[data-v="pad"]').textContent = e.target.value + 'px'; }
    else if (p === 'rad') { setStyle(selEl, 'border-radius', e.target.value + 'px'); panel.querySelector('[data-v="rad"]').textContent = e.target.value + 'px'; }
    else if (p === 'w') { setStyle(selEl, 'width', e.target.value + '%'); setStyle(selEl, 'max-width', 'none'); panel.querySelector('[data-v="w"]').textContent = e.target.value + '%'; placeHandle(); }
  });
  panel.addEventListener('click', function (e) {
    var p = e.target.getAttribute('data-p'); if (!p) return;
    if (p === 'close') deselect();
    else if (p === 'bg-none' && selEl) setStyle(selEl, 'background-color', 'transparent');
    else if (p === 'parent' && selEl) { var par = selEl.parentElement.closest('[data-oeid]'); if (par) selectEl(par); }
    else if (p === 'reset-el' && selEl) {
      var id = selEl.getAttribute('data-oeid'); if (styleMap[id]) { delete styleMap[id]; persist(SKEY, styleMap); }
      selEl.removeAttribute('style'); fillPanel(selEl); placeHandle();
    }
  });

  // drag to move (design mode)
  var drag = null;
  document.addEventListener('pointerdown', function (e) {
    if (!editing || mode !== 'design' || !selEl) return;
    if (e.target.closest('.oe-panel, .oe-bar, .oe-fab')) return;
    var hit = e.target.closest('[data-oeid]');
    if (!hit || (hit !== selEl && !selEl.contains(hit))) return;
    var base = curTranslate(selEl);
    drag = { sx: e.clientX, sy: e.clientY, bx: base.x, by: base.y };
    selEl.classList.add('oe-dragging');
    e.preventDefault();
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    setTranslate(selEl, drag.bx + (e.clientX - drag.sx), drag.by + (e.clientY - drag.sy));
    placeHandle();
  });
  window.addEventListener('pointerup', function () { if (drag && selEl) selEl.classList.remove('oe-dragging'); drag = null; });

  /* resize via the corner handle → sets width in px on the block */
  var rz = null;
  handle.addEventListener('pointerdown', function (e) {
    if (!selEl) return;
    e.preventDefault(); e.stopPropagation();
    rz = { sx: e.clientX, w: selEl.getBoundingClientRect().width };
    selEl.classList.add('oe-dragging');
  });
  window.addEventListener('pointermove', function (e) {
    if (!rz || !selEl) return;
    var w = Math.max(40, Math.round(rz.w + (e.clientX - rz.sx)));
    setStyle(selEl, 'width', w + 'px'); setStyle(selEl, 'max-width', 'none');
    placeHandle();
  });
  window.addEventListener('pointerup', function () { if (rz && selEl) selEl.classList.remove('oe-dragging'); rz = null; });

  /* keep the handle glued to the block while scrolling / resizing */
  window.addEventListener('scroll', placeHandle, { passive: true });
  window.addEventListener('resize', placeHandle);

  // arrow-key nudge
  document.addEventListener('keydown', function (e) {
    if (!editing || mode !== 'design' || !selEl) return;
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault(); var step = e.shiftKey ? 10 : 1, t = curTranslate(selEl);
    setTranslate(selEl, t.x + d[0] * step, t.y + d[1] * step);
  });

  /* =================================================================
     RESET · EXPORT
  ================================================================= */
  function resetPage() {
    if (!confirm('이 페이지의 모든 편집 내용을 되돌릴까요?')) return;
    [CKEY, SKEY, IKEY].forEach(function (k) { localStorage.removeItem(k); });
    location.reload();
  }
  function exportHTML() {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('.oe-fab, .oe-bar, .oe-format, .oe-panel, .oe-resize, .oe-toast, input[type="file"]').forEach(function (n) { n.remove(); });
    clone.querySelectorAll('link[href="edit.css"], script[src="edit.js"]').forEach(function (n) { n.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    clone.querySelectorAll('[data-oeid]').forEach(function (n) { n.removeAttribute('data-oeid'); });
    clone.querySelectorAll('.oe-img, .oe-selected, .oe-dragging').forEach(function (n) { n.classList.remove('oe-img', 'oe-selected', 'oe-dragging'); });
    clone.querySelectorAll('.oe-imgwrap').forEach(function (n) { n.classList.remove('oe-imgwrap'); });
    var html = '<!DOCTYPE html>\n<html lang="ko">\n' + clone.innerHTML + '\n</html>';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = PAGE; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('편집본 HTML을 내보냈습니다 · ' + PAGE);
  }

  /* =================================================================
     UI CHROME — floating button + bottom bar
  ================================================================= */
  var fab = document.createElement('button');
  fab.className = 'oe-fab'; fab.type = 'button';
  fab.innerHTML = '<span class="oe-dot"></span><span class="oe-fab-label">편집 모드</span>';
  var fabLabel = fab.querySelector('.oe-fab-label');

  var bar = document.createElement('div');
  bar.className = 'oe-bar';
  bar.innerHTML =
    '<div class="oe-seg"><button class="oe-seg__b is-on" data-mode="text">텍스트</button><button class="oe-seg__b" data-mode="design">디자인</button></div>' +
    '<span class="oe-bar__sep"></span>' +
    '<button class="oe-btn" data-act="reset">초기화</button>' +
    '<button class="oe-btn" data-act="export">HTML 내보내기</button>' +
    '<span class="oe-bar__sep"></span>' +
    '<button class="oe-btn oe-btn--primary" data-act="done">완료</button>';
  document.body.appendChild(fab);
  document.body.appendChild(bar);
  var segText = bar.querySelector('[data-mode="text"]');
  var segDesign = bar.querySelector('[data-mode="design"]');

  fab.addEventListener('click', function () { setEditing(!editing); });
  bar.addEventListener('click', function (e) {
    var m = e.target.getAttribute('data-mode'); if (m) { setMode(m); return; }
    var act = e.target.getAttribute('data-act');
    if (act === 'reset') resetPage();
    else if (act === 'export') exportHTML();
    else if (act === 'done') setEditing(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && editing) { if (selEl) deselect(); else setEditing(false); }
    if ((e.key === 'e' || e.key === 'E') && !editing) {
      var t = e.target; if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      setEditing(true);
    }
  });

  /* -------- toast ------------------------------------------------ */
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'oe-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

})();
