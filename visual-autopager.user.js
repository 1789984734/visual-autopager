// ==UserScript==
// @name         自动翻页 · 可视化规则
// @namespace    local.visual-autopager
// @version      1.4.1
// @description  多站点自动翻页：全站菜单入口、规则按需运行、配置界面延迟创建。
// @homepageURL  https://github.com/1789984734/visual-autopager
// @supportURL   https://github.com/1789984734/visual-autopager/issues
// @updateURL    https://raw.githubusercontent.com/1789984734/visual-autopager/main/visual-autopager.meta.js
// @downloadURL  https://raw.githubusercontent.com/1789984734/visual-autopager/main/visual-autopager.user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self || document.getElementById('vap-ui-host')) return;

  const STORE = 'visual-autopager.rules.v1';
  const LABELS = { idle: '自动加载中', loading: '正在加载', paused: '已暂停', error: '加载失败', done: '已结束' };
  let engine = null;
  let needsRefresh = false;
  let route = location.href;
  let picker = null;
  let highlighted = [];
  let initTimer;
  let previewController;
  let host = null;
  let ui = null;
  let routeTimer = null;
  let activeSiteRules = [];
  let startupError = '';
  let pickerFrame = null;
  let highlightFrame = null;

  function ensureUI() {
    if (ui) return;
    host = document.createElement('div');
    host.id = 'vap-ui-host';
    host.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483646!important;';
    ui = host.attachShadow({ mode: 'open' });
    ui.innerHTML = `
      <style>
        :host { color-scheme:light; }
        * { box-sizing:border-box; }
        .app { font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#243348; }
        [hidden] { display:none!important; }
        button,input,select,textarea { font:inherit; }
        button { cursor:pointer;border:1px solid #dce3ed;border-radius:8px;padding:7px 11px;background:white;color:#34445c; }
        button:hover { background:#f0f5ff;border-color:#9db8ed; }
        button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible { outline:2px solid #2563eb;outline-offset:2px; }
        button:disabled { opacity:.5;cursor:default; }
        .primary { background:#2563eb;color:white;border-color:#2563eb; }
        .primary:hover { background:#1d4ed8;color:white; }
        .danger { color:#ba2836; }
        .panel { width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;border:1px solid #dde5f0;background:#fff;border-radius:16px;padding:18px;box-shadow:0 12px 48px #172b4d26; }
        .head,.row { display:flex;align-items:center;gap:8px; }
        .head { justify-content:space-between; }
        h2 { font-size:18px;line-height:1.3;margin:0; }
        p { margin:6px 0 12px; }
        .muted { color:#6c7b90;font-size:12px; }
        .status { background:#f3f7fd;border-radius:10px;padding:10px 12px;margin:12px 0; }
        .status p { margin:3px 0 0;word-break:break-word; }
        label.field { display:block;margin:12px 0; }
        label.field>span { display:block;font-weight:600;margin-bottom:5px; }
        input[type=text],input[type=number],select,textarea { width:100%;min-width:0;border:1px solid #dce3ed;border-radius:8px;padding:8px;background:#fff;color:#243348; }
        .selector { font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px; }
        .row input { flex:1; }
        .row button { flex:none; }
        .check { display:flex;gap:7px;align-items:center;margin:9px 0; }
        input[type=checkbox] { accent-color:#2563eb; }
        details { border-top:1px solid #e8edf4;padding-top:10px;margin-top:14px; }
        summary { cursor:pointer;color:#52657e; }
        textarea { resize:vertical;font-family:ui-monospace,monospace;font-size:12px;margin:10px 0; }
        .actions { display:flex;gap:7px;flex-wrap:wrap;margin-top:12px; }
        #notice { font-size:12px;white-space:pre-wrap;word-break:break-word;margin:12px 0 0; }
        #notice[data-error=true] { color:#b42332; }
        .pickbar { position:fixed;left:50%;top:16px;transform:translateX(-50%);width:min(600px,calc(100vw - 32px));padding:13px 16px;border-radius:12px;background:#fff;border:1px solid #bdd1f6;box-shadow:0 8px 32px #1733572e; }
        .pickbar p { margin:4px 0; }
        #pick-info { overflow-wrap:anywhere; }
        .outline { position:fixed;pointer-events:none;border:2px solid #2563eb;background:#2563eb16;border-radius:3px; }
        .preview { position:fixed;pointer-events:none;border:2px dashed #16a34a;background:#16a34a0b; }
        @media(max-width:480px) { .panel { padding:14px; }.pickbar { font-size:12px; } }
      </style>
      <div class="app">
        <section class="panel" id="panel" hidden aria-label="自动翻页规则设置">
          <div class="head"><h2>自动翻页</h2><button id="close" aria-label="关闭设置">关闭</button></div>
          <p class="muted">点选内容范围，为这个网站保存规则。</p>
          <div class="status" role="status" aria-live="polite"><strong id="state">尚未配置</strong><p id="status-detail" class="muted">配置后可自动追加下一页内容。</p></div>
          <div class="actions"><button id="toggle" disabled>开始自动加载</button><button id="load" disabled>加载下一页</button><button id="refresh" hidden>刷新应用规则</button></div>
          <label class="field"><span>当前网站的规则</span><select id="rules"><option value="">新建规则</option></select></label>
          <label class="field"><span>规则名称</span><input id="name" type="text" maxlength="120" placeholder="例如：论坛帖子列表"></label>
          <label class="field"><span>匹配路径</span><input id="path" type="text" placeholder="/list/*"><small class="muted">仅当前域名；* 匹配任意字符，忽略查询参数。</small></label>
          <label class="field"><span>① 内容容器</span><div class="row"><input id="container" class="selector" type="text" placeholder="点选列表的外层容器"><button data-pick="container">点选容器</button></div></label>
          <label class="field"><span>② 内容条目</span><div class="row"><input id="items" class="selector" type="text" placeholder="点选列表中的一张卡片"><button data-pick="items">点选条目</button></div><small class="muted">相对于内容容器匹配，确认高亮范围包含完整条目。</small></label>
          <label class="field"><span>③ 下一页链接</span><div class="row"><input id="next" class="selector" type="text" placeholder="点选“下一页”链接"><button data-pick="next">点选下一页</button></div></label>
          <label class="check"><input id="enabled" type="checkbox" checked>启用此规则</label>
          <label class="check"><input id="auto" type="checkbox" checked>匹配页面时自动加载</label>
          <label class="check"><input id="openInNewTab" type="checkbox">条目链接在新标签页打开</label>
          <p class="muted">适用于当前页及追加条目的网页链接；锚点、下载和分页链接保留原行为。</p>
          <details><summary>加载设置</summary>
            <label class="field"><span>提前加载距离（px）</span><input id="preload" type="number" value="800" min="0" max="4000" step="100"></label>
            <label class="field"><span>最多显示页数（含当前页）</span><input id="maxPages" type="number" value="30" min="2" max="200"></label>
            <label class="check"><input id="dedupe" type="checkbox" checked>跳过重复条目</label>
          </details>
          <div class="actions"><button id="check">高亮检查</button><button id="test">检查下一页</button><button id="save" class="primary">保存规则</button><button id="delete" class="danger" disabled>删除规则</button></div>
          <p id="notice" role="status" aria-live="polite"></p>
          <details><summary>导入 / 导出所有网站规则</summary><textarea id="json" rows="5" placeholder="粘贴规则 JSON，或点击导出"></textarea><div class="actions"><button id="export">导出到文本框</button><button id="import">导入并合并</button></div></details>
          <p class="muted" style="margin-top:14px;margin-bottom:0">支持同源 HTML 分页。接口分页、虚拟列表和脚本交互需要专门适配。</p>
        </section>
        <section id="pickbar" class="pickbar" hidden aria-label="选择网页元素">
          <strong id="pick-title"></strong><p class="muted">移动鼠标预览，点击锁定；可选择父级。Enter 确认，Esc 取消。</p>
          <p id="pick-info" class="selector">请点击网页中的元素。</p>
          <div class="actions"><button id="pick-parent" disabled>选择父级 ↑</button><button id="pick-again">重新选择</button><button id="pick-confirm" class="primary" disabled>确认选择</button><button id="pick-cancel">取消</button></div>
        </section>
        <div id="outline" class="outline" hidden></div>
        <div id="previews"></div>
      </div>`;
    bindUIEvents();
  }
  const $ = (id) => ui.getElementById(id);

  function message(text, error = false) {
    $('notice').textContent = text;
    $('notice').dataset.error = String(error);
  }

  function canonical(raw, base = location.href) {
    const url = new URL(raw, base);
    if (!/^https?:$/.test(url.protocol)) throw new Error('下一页必须是 HTTP 或 HTTPS 链接。');
    url.hash = '';
    return url.href;
  }

  function wildcard(pattern, pathname) {
    const escaped = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${escaped}$`).test(pathname);
  }

  function normalizeRule(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('规则格式不正确。');
    const string = (key, max = 1500) => {
      if (typeof raw[key] !== 'string' || !raw[key].trim() || raw[key].length > max) throw new Error(`规则字段 ${key} 不正确。`);
      return raw[key].trim();
    };
    const origin = string('origin', 300);
    const originURL = new URL(origin);
    if (!/^https?:$/.test(originURL.protocol) || originURL.origin !== origin) throw new Error('规则域名格式不正确。');
    const path = string('path', 400);
    if (!path.startsWith('/') || /[?#]/.test(path)) throw new Error('匹配路径应以 / 开头，不包含 ? 或 #。');
    const number = (key, min, max) => {
      const value = Number(raw[key]);
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} 应在 ${min} 至 ${max} 之间。`);
      return value;
    };
    const result = {
      id: string('id', 120), name: string('name', 120), origin, path,
      container: string('container'), items: string('items'), next: string('next'),
      enabled: raw.enabled !== false, auto: raw.auto !== false, dedupe: raw.dedupe !== false,
      openInNewTab: raw.openInNewTab === true,
      preload: number('preload', 0, 4000), maxPages: number('maxPages', 2, 200),
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    };
    // Validate syntax without trusting selector strings as HTML or executable code.
    for (const key of ['container', 'items', 'next']) document.createElement('div').querySelector(result[key]);
    return result;
  }

  function readRawRules() {
    const raw = GM_getValue(STORE, []);
    return Array.isArray(raw) ? raw : [];
  }

  function readRules() {
    return readRawRules().flatMap((rule) => {
      try { return [normalizeRule(rule)]; } catch { return []; }
    });
  }

  function matchingRule() {
    return activeSiteRules.filter((r) => wildcard(r.path, location.pathname))
      .sort((a, b) => b.path.replaceAll('*', '').length - a.path.replaceAll('*', '').length || b.updatedAt - a.updatedAt)[0];
  }

  function updateActivation(raw = readRawRules()) {
    // Filter first: unrelated and disabled rules require no selector validation.
    activeSiteRules = raw.filter((rule) => rule && typeof rule === 'object' && rule.origin === location.origin && rule.enabled !== false)
      .flatMap((rule) => {
        try { return [normalizeRule(rule)]; } catch { return []; }
      });
    if (activeSiteRules.length) {
      if (routeTimer === null) {
        route = location.href;
        routeTimer = setInterval(checkRoute, 750);
      }
    } else {
      if (routeTimer !== null) clearInterval(routeTimer);
      routeTimer = null;
      clearTimeout(initTimer);
      initTimer = null;
    }
  }

  function checkRoute() {
    if (location.href === route) return;
    const preserve = samePageRoute(route, location.href) && (!engine || engine.container.isConnected);
    route = location.href;
    if (preserve) {
      if (engine) engine.route = route;
      return;
    }
    closePanel();
    engine?.destroy(); engine = null; needsRefresh = false; startupError = '';
    updateActivation();
    renderStatus();
    if (activeSiteRules.length) initTimer = setTimeout(() => scheduleStart(), 350);
  }

  function samePageRoute(before, after) {
    if (before === after) return true;
    const split = (url) => {
      const index = url.indexOf('#');
      return index < 0 ? [url, ''] : [url.slice(0, index), url.slice(index + 1)];
    };
    const [oldPage, oldFragment] = split(before);
    const [newPage, newFragment] = split(after);
    if (oldPage !== newPage) return false;
    const pageAnchor = (fragment) => {
      const anchor = fragment.split(':~:')[0];
      if (!anchor || anchor.toLowerCase() === 'top') return true;
      let name;
      try { name = decodeURIComponent(anchor); } catch { return false; }
      return Boolean(document.getElementById(name)) || [...document.getElementsByName(name)].some((el) => el.localName === 'a');
    };
    // Preserve known document anchors; unknown hashes may belong to a site router.
    return pageAnchor(oldFragment) && pageAnchor(newFragment);
  }

  function populateRules(selected = '') {
    $('rules').replaceChildren(new Option('新建规则', ''));
    readRules().filter((r) => r.origin === location.origin).forEach((r) => $('rules').add(new Option(`${r.enabled ? '' : '（停用）'}${r.name} · ${r.path}`, r.id)));
    $('rules').value = selected;
    $('delete').disabled = !selected;
  }

  function fillRule(rule) {
    populateRules(rule?.id || '');
    $('name').value = rule?.name || `${location.hostname} · ${location.pathname}`;
    $('path').value = rule?.path || location.pathname;
    for (const key of ['container', 'items', 'next']) $(key).value = rule?.[key] || '';
    for (const key of ['enabled', 'auto', 'dedupe']) $(key).checked = rule?.[key] !== false;
    $('openInNewTab').checked = rule?.openInNewTab === true;
    $('preload').value = rule?.preload ?? 800;
    $('maxPages').value = rule?.maxPages ?? 30;
  }

  function draftRule() {
    return normalizeRule({
      id: $('rules').value || crypto.randomUUID(), origin: location.origin,
      name: $('name').value, path: $('path').value,
      container: $('container').value, items: $('items').value, next: $('next').value,
      enabled: $('enabled').checked, auto: $('auto').checked, dedupe: $('dedupe').checked,
      openInNewTab: $('openInNewTab').checked,
      preload: Number($('preload').value), maxPages: Number($('maxPages').value), updatedAt: Date.now(),
    });
  }

  function findContent(doc, rule) {
    const containers = [...doc.querySelectorAll(rule.container)].filter((el) => el !== host);
    if (containers.length !== 1) throw new Error(`内容容器匹配了 ${containers.length} 个元素，应恰好匹配 1 个。`);
    const container = containers[0];
    if (['HTML', 'BODY'].includes(container.tagName)) throw new Error('请选择列表的内容容器，不要选择整个页面。');
    const items = [...container.querySelectorAll(rule.items)];
    if (!items.length) throw new Error('没有匹配到内容条目，请调整条目范围。');
    const set = new Set(items);
    if (items.some((item) => {
      for (let parent = item.parentElement; parent && parent !== container; parent = parent.parentElement) if (set.has(parent)) return true;
      return false;
    })) throw new Error('条目选择器同时匹配了父子元素，请缩小范围。');
    return { container, items };
  }

  function documentBase(doc, sourceURL) {
    const raw = doc.querySelector('base[href]')?.getAttribute('href');
    return raw ? new URL(raw, sourceURL).href : sourceURL;
  }

  function findNext(doc, rule, sourceURL) {
    const matches = [...doc.querySelectorAll(rule.next)].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true' && !el.classList.contains('disabled'));
    if (!matches.length) return null;
    if (matches.length > 1) throw new Error(`下一页匹配了 ${matches.length} 个元素，请选择唯一的链接。`);
    const link = matches[0].matches('a[href]') ? matches[0] : matches[0].querySelector('a[href]');
    if (!link) throw new Error('下一页元素没有有效链接。按钮或接口分页需要专门适配。');
    const raw = link.getAttribute('href')?.trim();
    if (!raw || raw.startsWith('#')) return null;
    const url = canonical(raw, documentBase(doc, sourceURL));
    if (new URL(url).origin !== rule.origin) throw new Error('下一页不在当前域名内，需要单独的跨域适配。');
    return url;
  }

  async function requestPage(url, signal) {
    const response = await fetch(url, { credentials: 'same-origin', signal });
    if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}。`);
    const finalURL = canonical(response.url || url);
    if (new URL(finalURL).origin !== location.origin) throw new Error('请求被重定向到其他域名。');
    const type = response.headers.get('content-type') || '';
    if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error('下一页返回的不是 HTML，需要接口适配。');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const probe = new TextDecoder().decode(bytes.subarray(0, 4096));
    const meta = [...probe.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag.match(/charset\s*=\s*["']?([^\s"';/>]+)/i)?.[1]).find(Boolean);
    let encoding = type.match(/charset\s*=\s*["']?([^\s"';]+)/i)?.[1] || meta || document.characterSet || 'utf-8';
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) encoding = 'utf-8';
    else if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
    let html;
    try { html = new TextDecoder(encoding).decode(bytes); }
    catch { throw new Error(`无法解码页面声明的字符集：${encoding}。`); }
    return { doc: new DOMParser().parseFromString(html, 'text/html'), url: finalURL };
  }

  function safeURL(raw, base, href = false) {
    if (!raw?.trim()) return null;
    try {
      const url = new URL(raw.trim(), base);
      if (/^https?:$/.test(url.protocol) || (href && /^(mailto|tel):$/.test(url.protocol))) return url.href;
      if (!href && /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(raw.trim())) return raw.trim();
    } catch { /* Ignore malformed resource attributes. */ }
    return null;
  }

  function resolveSrcset(raw, base) {
    // URL tokens may themselves contain commas, notably data: URLs.
    const candidates = [];
    let index = 0;
    while (index < raw.length) {
      while (/[\s,]/.test(raw[index] || '') && index < raw.length) index++;
      let url = '';
      while (index < raw.length && !/\s/.test(raw[index])) url += raw[index++];
      let descriptor = '';
      if (url.endsWith(',')) url = url.replace(/,+$/, '');
      else {
        while (index < raw.length && raw[index] !== ',') descriptor += raw[index++];
        index++;
      }
      const resolved = safeURL(url, base);
      if (resolved && (!descriptor.trim() || /^\d+(?:\.\d+)?[wx]$/.test(descriptor.trim()))) candidates.push(`${resolved}${descriptor.trim() ? ` ${descriptor.trim()}` : ''}`);
    }
    return candidates.join(', ');
  }

  function prepareItem(item, base) {
    item.querySelectorAll('script,style,base,meta,link,iframe,object,embed').forEach((el) => el.remove());
    for (const el of [item, ...item.querySelectorAll('*')]) {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || ['srcdoc', 'autofocus', 'nonce'].includes(attr.name)) el.removeAttribute(attr.name);
        else if (['href', 'src', 'poster', 'action', 'formaction', 'xlink:href'].includes(attr.name)) {
          // Keep local fragment references local to the appended document.
          if (/href$/.test(attr.name) && attr.value.trim().startsWith('#')) continue;
          const value = safeURL(attr.value, base, /href$/.test(attr.name));
          if (value) el.setAttribute(attr.name, value); else el.removeAttribute(attr.name);
        }
      }
      if (el.matches('img,source')) {
        const lazy = el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('data-lazy-src');
        if (lazy) {
          const value = safeURL(lazy, base);
          if (value) el.setAttribute('src', value);
        }
        const srcset = el.getAttribute('data-srcset') || el.getAttribute('srcset');
        if (srcset) {
          const value = resolveSrcset(srcset, base);
          if (value) el.setAttribute('srcset', value); else el.removeAttribute('srcset');
        }
        if (el.tagName === 'IMG') { el.loading = 'lazy'; el.decoding = 'async'; }
      }
    }
    return item;
  }

  function itemKey(item, base) {
    if (item.getAttribute('data-id')) return `id:${item.getAttribute('data-id')}`;
    const links = [...(item.matches('a[href]') ? [item] : []), ...item.querySelectorAll('a[href]')].map((el) => safeURL(el.getAttribute('href'), base, true)).filter(Boolean);
    const images = [...(item.matches('img') ? [item] : []), ...item.querySelectorAll('img')].map((el) => safeURL(el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('data-lazy-src') || el.getAttribute('src'), base)).filter(Boolean);
    const text = item.textContent.replace(/\s+/g, ' ').trim();
    return text || links.length || images.length ? JSON.stringify([text, links, images]) : null;
  }

  function renameDuplicateIds(nodes, page) {
    const used = new Set();
    const renamed = new Map();
    let index = 0;
    for (const node of nodes) for (const el of [node, ...node.querySelectorAll('[id]')]) {
      const id = el.id;
      if (!id) continue;
      if (document.getElementById(id) || used.has(id)) {
        let replacement;
        do { replacement = `vap-page-${page}-${++index}`; } while (document.getElementById(replacement) || used.has(replacement));
        renamed.set(id, replacement);
        el.id = replacement;
      }
      used.add(el.id);
    }
    for (const node of nodes) for (const el of [node, ...node.querySelectorAll('*')]) {
      for (const attr of ['href', 'xlink:href']) {
        const href = el.getAttribute(attr);
        if (!href?.startsWith('#')) continue;
        let id = href.slice(1);
        try { id = decodeURIComponent(id); } catch { /* Keep malformed fragment text unchanged. */ }
        if (renamed.has(id)) el.setAttribute(attr, `#${encodeURIComponent(renamed.get(id))}`);
      }
      for (const attr of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'list', 'headers']) if (el.hasAttribute(attr)) {
        el.setAttribute(attr, el.getAttribute(attr).split(/\s+/).map((id) => renamed.get(id) || id).join(' '));
      }
    }
  }

  function scrollRoot(element) {
    for (let parent = element; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
    }
    return null;
  }

  class Pager {
    constructor(rule) {
      this.rule = rule;
      const { container, items } = findContent(document, rule);
      this.container = container;
      this.last = items.at(-1);
      this.source = canonical(location.href);
      this.route = location.href;
      this.next = findNext(document, rule, this.source);
      this.seenPages = new Set([this.source]);
      const base = documentBase(document, this.source);
      this.seenItems = new Set(items.map((item) => itemKey(item, base)).filter(Boolean));
      this.pageCount = 1;
      this.state = this.next ? 'paused' : 'done';
      this.detail = this.next ? '规则已就绪。' : '当前页没有下一页链接。';
      this.busy = false;
      this.disposed = false;
      this.originalLinkAttributes = new Map();
      this.syncItemLinks(items);
      this.notify();
      if (rule.auto && this.next) this.resume();
    }

    notify() { if (!this.disposed) renderStatus(this); }

    restoreItemLink(link) {
      const original = this.originalLinkAttributes.get(link);
      if (!original) return;
      for (const attr of ['target', 'rel']) {
        if (link.getAttribute(attr) === original[attr]) continue;
        if (original[attr] === null) link.removeAttribute(attr);
        else link.setAttribute(attr, original[attr]);
      }
      this.originalLinkAttributes.delete(link);
    }

    restoreItemLinks() {
      for (const link of this.originalLinkAttributes.keys()) this.restoreItemLink(link);
    }

    syncItemLinks(items = null) {
      if (!this.rule.openInNewTab || !this.rule.enabled || !wildcard(this.rule.path, location.pathname)) return this.restoreItemLinks();
      const fullSync = items === null;
      const pagination = [...document.querySelectorAll(this.rule.next)];
      const links = new Set();
      for (const item of items || this.container.querySelectorAll(this.rule.items)) {
        if (item.matches('a[href]')) links.add(item);
        item.querySelectorAll('a[href]').forEach((link) => links.add(link));
      }
      const eligible = fullSync ? new Set() : null;
      const current = new URL(location.href);
      for (const link of links) {
        const raw = link.getAttribute('href')?.trim();
        if (!raw || raw.startsWith('#') || link.hasAttribute('download')) continue;
        if ((link.getAttribute('rel') || '').split(/\s+/).some((token) => ['next', 'prev'].includes(token.toLowerCase())) || pagination.some((el) => el === link || el.contains(link))) continue;
        let destination;
        try { destination = new URL(link.href); } catch { continue; }
        if (!/^https?:$/.test(destination.protocol)) continue;
        if (destination.hash && destination.origin === current.origin && destination.pathname === current.pathname && destination.search === current.search) continue;
        eligible?.add(link);
        if (!this.originalLinkAttributes.has(link)) this.originalLinkAttributes.set(link, { target: link.getAttribute('target'), rel: link.getAttribute('rel') });
        if (link.getAttribute('target') !== '_blank') link.setAttribute('target', '_blank');
        const rel = link.getAttribute('rel') || '';
        if (!rel.split(/\s+/).some((token) => token.toLowerCase() === 'noopener')) link.setAttribute('rel', rel.trimEnd() ? `${rel.trimEnd()} noopener` : 'noopener');
      }
      // Restore links that are no longer part of the current rule's content scope.
      if (fullSync) for (const link of this.originalLinkAttributes.keys()) if (!eligible.has(link)) this.restoreItemLink(link);
    }

    arm() {
      this.observer?.disconnect();
      if (this.disposed || this.state !== 'idle' || this.busy) return;
      if (!this.container.isConnected || !this.last.isConnected) return this.fail('页面内容被重新渲染，请刷新或重新配置规则。');
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.load(false);
      }, { root: scrollRoot(this.container), rootMargin: `0px 0px ${this.rule.preload}px 0px`, threshold: 0 });
      this.observer.observe(this.last);
    }

    resume() {
      if (this.disposed || this.state === 'done' || needsRefresh) return;
      this.state = 'idle'; this.detail = '接近列表底部时加载下一页。'; this.notify(); this.arm();
    }

    pause(detail = '点击继续，或手动加载下一页。') {
      if (this.disposed || this.state === 'done') return;
      this.state = 'paused'; this.detail = detail;
      this.observer?.disconnect(); this.controller?.abort(); this.notify();
    }

    fail(detail) {
      this.state = 'error'; this.detail = detail; this.observer?.disconnect(); this.notify();
    }

    finish(detail) {
      this.state = 'done'; this.detail = detail; this.observer?.disconnect(); this.notify();
    }

    destroy() { this.disposed = true; this.observer?.disconnect(); this.controller?.abort(); this.restoreItemLinks(); }

    async load(manual = true) {
      if (this.busy || this.disposed || needsRefresh || this.state === 'done' || (!manual && this.state !== 'idle')) return;
      if (this.pageCount >= this.rule.maxPages) return this.finish(`已达到 ${this.rule.maxPages} 页上限。`);
      if (!this.next) return this.finish('已加载到最后一页。');
      if (this.seenPages.has(this.next)) return this.finish('下一页指向已加载页面，已停止。');
      if (!samePageRoute(this.route, location.href) || !this.container.isConnected) return this.fail('页面已经变化，请重新配置规则。');
      const automatic = this.state === 'idle';
      this.busy = true;
      this.state = 'loading'; this.detail = `正在加载第 ${this.pageCount + 1} 页…`; this.observer?.disconnect(); this.notify();
      const controller = new AbortController();
      this.controller = controller;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
      try {
        const result = await requestPage(this.next, controller.signal);
        if (controller.signal.aborted || this.disposed || !samePageRoute(this.route, location.href)) return;
        if (this.seenPages.has(result.url)) return this.finish('下一页重定向到了已加载页面，已停止。');
        const { items } = findContent(result.doc, this.rule);
        const next = findNext(result.doc, this.rule, result.url);
        const base = documentBase(result.doc, result.url);
        const pendingKeys = new Set();
        const nodes = [];
        for (const item of items) {
          // Reject executable top-level items as well as executable descendants.
          if (item.matches('script,style,base,meta,link,iframe,object,embed')) continue;
          const key = itemKey(item, base);
          if (this.rule.dedupe && key && (this.seenItems.has(key) || pendingKeys.has(key))) continue;
          if (key) pendingKeys.add(key);
          nodes.push(document.importNode(prepareItem(item, base), true));
        }
        if (!nodes.length) return this.finish('下一页没有新的内容条目，已停止。');
        if (controller.signal.aborted || this.disposed || !samePageRoute(this.route, location.href) || !this.container.isConnected) return;
        renameDuplicateIds(nodes, this.pageCount + 1);
        const fragment = document.createDocumentFragment();
        nodes.forEach((node) => fragment.append(node));
        this.container.append(fragment);
        this.syncItemLinks(nodes);
        this.last = nodes.at(-1);
        this.seenPages.add(this.next); this.seenPages.add(result.url);
        pendingKeys.forEach((key) => this.seenItems.add(key));
        this.pageCount++;
        this.source = result.url; this.next = next;
        if (!next) this.finish('已加载到最后一页。');
        else if (this.seenPages.has(next)) this.finish('下一页指向已加载页面，已停止。');
        else if (this.pageCount >= this.rule.maxPages) this.finish(`已达到 ${this.rule.maxPages} 页上限。`);
        else {
          this.state = automatic ? 'idle' : 'paused';
          this.detail = `已追加 ${nodes.length} 个条目。${automatic ? '' : '可继续手动加载。'}`;
          this.notify();
        }
      } catch (error) {
        if (this.disposed) return;
        if (controller.signal.aborted && !timedOut) return;
        this.fail(timedOut ? '请求超过 15 秒，请点击“加载下一页”重试。' : `${error.message} 点击“加载下一页”重试。`);
      } finally {
        clearTimeout(timeout);
        if (this.controller === controller) this.controller = null;
        this.busy = false;
        if (!this.disposed) { this.notify(); this.arm(); }
      }
    }
  }

  function renderStatus(pager = engine) {
    if (!ui) return;
    $('state').textContent = pager ? `${LABELS[pager.state]} · ${pager.pageCount} 页` : startupError ? '规则需要调整' : '尚未配置';
    $('status-detail').textContent = needsRefresh ? '新规则已保存，请刷新页面后应用。' : pager?.detail || startupError || '配置后可自动追加下一页内容。';
    $('toggle').disabled = !pager || pager.state === 'done' || needsRefresh;
    $('toggle').textContent = !pager ? '开始自动加载' : ['idle', 'loading'].includes(pager.state) ? '暂停自动加载' : '继续自动加载';
    $('load').disabled = !pager || pager.busy || pager.state === 'done' || needsRefresh;
    $('load').textContent = pager?.state === 'error' ? '重试下一页' : '加载下一页';
    $('refresh').hidden = !needsRefresh;
  }

  function openPanel() {
    checkRoute();
    updateActivation();
    ensureUI();
    if (!host.isConnected) document.documentElement.append(host);
    cancelPicker();
    if (engine && ['idle', 'loading'].includes(engine.state)) engine.pause('配置期间已暂停，关闭面板后可点击继续。');
    fillRule(matchingRule() || engine?.rule);
    $('panel').hidden = false;
    renderStatus();
    message('按 ①②③ 点选，然后高亮检查并保存。');
  }

  function closePanel() {
    if (!ui) return;
    cancelPicker();
    $('panel').hidden = true;
    clearHighlights();
    previewController?.abort();
    host.remove();
  }

  const classes = (el) => [...el.classList].filter((name) => name.length < 60 && !/^(active|selected|current|hover|focus|loading|is-|has-|vap-)/i.test(name) && !/[a-f0-9]{10,}/i.test(name)).slice(0, 3);
  const quote = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, '\\a ')}"`;

  function atoms(el, useId = true) {
    const tag = CSS.escape(el.localName);
    const result = [];
    if (useId && el.id && !/\d{6,}|[a-f0-9]{12,}/i.test(el.id)) result.push(`#${CSS.escape(el.id)}`);
    if (el.matches('a[rel~=next]')) result.push(`${tag}[rel~="next"]`);
    for (const attr of ['data-testid', 'data-role', 'aria-label']) if (el.getAttribute(attr)) result.push(`${tag}[${attr}=${quote(el.getAttribute(attr))}]`);
    const names = classes(el);
    for (let count = 1; count <= names.length; count++) result.push(`${tag}${names.slice(0, count).map((name) => `.${CSS.escape(name)}`).join('')}`);
    result.push(tag);
    return result;
  }

  function uniqueSelector(el) {
    const unique = (selector) => {
      const found = document.querySelectorAll(selector);
      return found.length === 1 && found[0] === el;
    };
    for (const candidate of atoms(el)) if (unique(candidate)) return candidate;
    let path = '';
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const segment = atoms(node).find((candidate) => node.parentElement && [...node.parentElement.querySelectorAll(`:scope > ${candidate}`)].length === 1)
        || `${CSS.escape(node.localName)}:nth-of-type(${[...node.parentElement.children].filter((child) => child.localName === node.localName).indexOf(node) + 1})`;
      path = path ? `${segment} > ${path}` : segment;
      if (unique(path)) return path;
    }
    throw new Error('无法生成可靠选择器，请手动填写。');
  }

  function relativeSelector(el, container) {
    const direct = el.parentElement === container;
    for (const candidate of atoms(el, false)) {
      const selector = direct ? `:scope > ${candidate}` : candidate;
      const found = [...container.querySelectorAll(selector)];
      const matches = new Set(found);
      const nested = found.some((node) => {
        for (let parent = node.parentElement; parent && parent !== container; parent = parent.parentElement) if (matches.has(parent)) return true;
        return false;
      });
      if (matches.has(el) && !nested) return selector;
    }
    throw new Error('无法确定条目范围，请重新选择完整条目。');
  }

  function itemCandidate(el, container) {
    let best = el;
    for (let node = el; node && node !== container; node = node.parentElement) {
      if (node.parentElement === container) best = node;
      else if (atoms(node, false).some((selector) => container.querySelectorAll(selector).length > 1)) best = node;
    }
    return best;
  }

  function pickerElement(target) {
    if (!(target instanceof Element) || target === host || host.contains(target)) return null;
    if (picker.kind === 'next') return target.closest('a[href]');
    if (picker.kind === 'items') {
      if (!picker.container.contains(target) || target === picker.container) return null;
      return itemCandidate(target, picker.container);
    }
    return target;
  }

  function positionBox(box, el) {
    paintBox(box, el.getBoundingClientRect());
  }

  function paintBox(box, rect) {
    box.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
  }

  function updatePicker(force = false) {
    if (!picker) return;
    const el = picker.candidate;
    $('outline').hidden = !el;
    if (!el) {
      picker.selector = null; picker.selectorElement = null;
      $('pick-confirm').disabled = true; $('pick-parent').disabled = true;
      return;
    }
    positionBox($('outline'), el);
    try {
      if (force || picker.selectorElement !== el) {
        picker.selector = picker.kind === 'items' ? relativeSelector(el, picker.container) : uniqueSelector(el);
        picker.count = picker.kind === 'items' ? picker.container.querySelectorAll(picker.selector).length : document.querySelectorAll(picker.selector).length;
        picker.selectorElement = el;
      }
      $('pick-info').textContent = `${picker.selector} · 匹配 ${picker.count} 个元素${picker.locked ? ' · 已锁定' : ''}`;
      $('pick-confirm').disabled = !picker.locked;
      $('pick-parent').disabled = !picker.locked || picker.kind === 'next' || !el.parentElement || ['BODY', 'HTML'].includes(el.parentElement.tagName) || el.parentElement === picker.container;
    } catch (error) {
      picker.selector = null; picker.selectorElement = null;
      $('pick-info').textContent = error.message;
      $('pick-confirm').disabled = true;
    }
  }

  function startPicker(kind) {
    clearHighlights();
    let container;
    if (kind === 'items') {
      const matches = document.querySelectorAll($('container').value || ':not(*)');
      if (matches.length !== 1) throw new Error('请先点选唯一的内容容器。');
      container = matches[0];
    }
    picker = { kind, container, candidate: null, locked: false };
    $('panel').hidden = true;
    $('pickbar').hidden = false;
    $('pick-title').textContent = { container: '① 选择内容容器', items: '② 选择一个完整条目', next: '③ 选择下一页链接' }[kind];
    $('pick-info').textContent = '请点击网页中的元素。';
    $('pick-confirm').disabled = true; $('pick-parent').disabled = true;
    document.addEventListener('pointermove', pickerMove, true);
    document.addEventListener('pointerdown', pickerBlock, true);
    document.addEventListener('click', pickerClick, true);
    document.addEventListener('keydown', pickerKey, true);
    document.addEventListener('scroll', pickerScroll, true);
    window.addEventListener('resize', pickerScroll);
  }

  function inUI(event) { return event.composedPath().includes(host); }
  function cancelPickerFrame() {
    if (pickerFrame !== null) cancelAnimationFrame(pickerFrame);
    pickerFrame = null;
  }
  function schedulePickerFrame() {
    if (!picker || pickerFrame !== null) return;
    const session = picker;
    pickerFrame = requestAnimationFrame(() => {
      pickerFrame = null;
      if (picker !== session) return;
      if (!picker.locked && picker.pendingTarget) {
        const target = picker.pendingTarget;
        picker.pendingTarget = null;
        if (target !== picker.hoverTarget) {
          picker.hoverTarget = target;
          picker.candidate = target.isConnected ? pickerElement(target) : null;
        }
      }
      updatePicker();
    });
  }
  function pickerMove(event) {
    if (!picker || picker.locked || inUI(event)) return;
    picker.pendingTarget = event.target;
    schedulePickerFrame();
  }
  function pickerBlock(event) { if (picker && !inUI(event)) { event.preventDefault(); event.stopImmediatePropagation(); } }
  function pickerClick(event) {
    if (!picker || inUI(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    cancelPickerFrame();
    picker.pendingTarget = null; picker.hoverTarget = event.target;
    picker.candidate = pickerElement(event.target);
    picker.locked = Boolean(picker.candidate);
    if (!picker.candidate) $('pick-info').textContent = picker.kind === 'next' ? '请选择带 href 的下一页链接。' : '请选择内容容器内的条目。';
    updatePicker(true);
  }
  function pickerScroll() { schedulePickerFrame(); }
  function pickerKey(event) {
    if (!picker || !['Escape', 'Enter', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape') cancelPicker();
    else if (event.key === 'Enter' && !$('pick-confirm').disabled) confirmPicker();
    else if (event.key === 'ArrowUp' && !$('pick-parent').disabled) chooseParent();
  }
  function chooseParent() { if (picker?.candidate?.parentElement) { cancelPickerFrame(); picker.candidate = picker.candidate.parentElement; updatePicker(true); } }
  function cancelPicker() {
    if (!picker) return;
    cancelPickerFrame();
    picker = null;
    document.removeEventListener('pointermove', pickerMove, true);
    document.removeEventListener('pointerdown', pickerBlock, true);
    document.removeEventListener('click', pickerClick, true);
    document.removeEventListener('keydown', pickerKey, true);
    document.removeEventListener('scroll', pickerScroll, true);
    window.removeEventListener('resize', pickerScroll);
    $('pickbar').hidden = true; $('outline').hidden = true; $('panel').hidden = false;
  }
  function confirmPicker() {
    if (!picker?.locked || !picker.selector) return;
    updatePicker(true);
    if (!picker.selector) return;
    const { kind, candidate, selector } = picker;
    if (kind === 'container' && ['HTML', 'BODY'].includes(candidate.tagName)) { $('pick-info').textContent = '请选择列表容器，不要选择整个页面。'; return; }
    $(kind).value = selector;
    cancelPicker();
    message(selector.includes(':nth-of-type') ? '已选择。该选择器包含位置索引，请使用“检查下一页”验证。' : '已选择，请继续下一步或高亮检查。');
  }

  function clearHighlights() {
    if (highlightFrame !== null) cancelAnimationFrame(highlightFrame);
    highlightFrame = null;
    highlighted = [];
    $('previews').replaceChildren();
    document.removeEventListener('scroll', scheduleHighlights, true);
    window.removeEventListener('resize', scheduleHighlights);
  }
  function repositionHighlights() {
    const positions = highlighted.map(({ box, el }) => ({ box, rect: el.getBoundingClientRect() }));
    positions.forEach(({ box, rect }) => paintBox(box, rect));
  }
  function scheduleHighlights() {
    if (!highlighted.length || highlightFrame !== null) return;
    highlightFrame = requestAnimationFrame(() => { highlightFrame = null; repositionHighlights(); });
  }
  function highlight(elements) {
    clearHighlights();
    highlighted = elements.slice(0, 100).map((el) => {
      const box = document.createElement('div'); box.className = 'preview';
      $('previews').append(box); return { box, el };
    });
    repositionHighlights();
    document.addEventListener('scroll', scheduleHighlights, true);
    window.addEventListener('resize', scheduleHighlights);
  }

  function guard(action) {
    return async () => { try { await action(); } catch (error) { message(error.message, true); } };
  }

  function previewNext(rule) {
    const same = engine && samePageRoute(engine.route, location.href) && ['origin', 'container', 'items', 'next'].every((key) => engine.rule[key] === rule[key]);
    return same ? engine.next : findNext(document, rule, canonical(location.href));
  }

  function applyRule(rule) {
    if (needsRefresh) { engine?.pause('请刷新后应用新规则。'); renderStatus(); return; }
    if (engine?.pageCount > 1) {
      const same = ['origin', 'container', 'items', 'next', 'dedupe'].every((key) => engine.rule[key] === rule[key]);
      if (!same) {
        engine.pause('规则已变更。'); needsRefresh = true; renderStatus(); return;
      }
      engine.rule = rule;
      engine.syncItemLinks();
      if (!rule.enabled || !rule.auto || !wildcard(rule.path, location.pathname)) engine.pause('规则已保存，自动加载已暂停。');
      else if (engine.state !== 'done') engine.resume();
      else engine.notify();
      return;
    }
    engine?.destroy(); engine = null;
    if (rule.enabled && wildcard(rule.path, location.pathname)) engine = new Pager(rule);
    renderStatus();
  }

  function bindUIEvents() {
    $('close').addEventListener('click', closePanel);
    $('rules').addEventListener('change', () => { clearHighlights(); fillRule(readRules().find((r) => r.id === $('rules').value)); message(''); });
    ui.querySelectorAll('[data-pick]').forEach((button) => button.addEventListener('click', guard(() => startPicker(button.dataset.pick))));
    $('pick-parent').addEventListener('click', chooseParent);
    $('pick-confirm').addEventListener('click', confirmPicker);
    $('pick-cancel').addEventListener('click', cancelPicker);
    $('pick-again').addEventListener('click', () => { cancelPickerFrame(); picker.pendingTarget = null; picker.hoverTarget = null; picker.candidate = null; picker.locked = false; $('pick-info').textContent = '请重新点击元素。'; updatePicker(); });
    $('check').addEventListener('click', guard(() => {
      const rule = draftRule();
      const { items } = findContent(document, rule);
      const next = previewNext(rule);
      highlight(items);
      message(`已高亮 ${items.length} 个条目${items.length > 100 ? '（仅绘制前 100 个）' : ''}。\n${next ? `下一页：${next}` : '没有找到可用的下一页链接。'}`);
    }));
    $('test').addEventListener('click', guard(async () => {
      const rule = draftRule();
      findContent(document, rule);
      const next = previewNext(rule);
      if (!next || next === canonical(location.href)) throw new Error('没有可用的下一页链接，或链接指向当前页。');
      previewController?.abort();
      const controller = new AbortController(); previewController = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      $('test').disabled = true; message('正在检查下一页…');
      try {
        const result = await requestPage(next, controller.signal);
        const { items } = findContent(result.doc, rule);
        const following = findNext(result.doc, rule, result.url);
        if (!controller.signal.aborted && samePageRoute(route, location.href)) message(`检查通过：下一页有 ${items.length} 个条目。\n${following ? '还能继续翻页。' : '这是最后一页。'} 尚未追加内容。`);
      } catch (error) {
        if (controller.signal.aborted) message('检查已取消或超时，可再次检查。', true);
        else throw error;
      } finally { clearTimeout(timeout); $('test').disabled = false; if (previewController === controller) previewController = null; }
    }));
    $('save').addEventListener('click', guard(() => {
      const rule = draftRule();
      findContent(document, rule); findNext(document, rule, canonical(location.href));
      const rules = readRules().filter((r) => r.id !== rule.id); rules.push(rule);
      GM_setValue(STORE, rules);
      updateActivation(rules);
      populateRules(rule.id); clearHighlights(); applyRule(rule);
      message(needsRefresh ? '规则已保存。当前页已有追加内容，请刷新后应用新规则。' : '规则已保存，下次访问匹配页面时自动生效。');
    }));
    $('delete').addEventListener('click', guard(() => {
      const id = $('rules').value;
      const rules = readRules().filter((r) => r.id !== id);
      GM_setValue(STORE, rules);
      updateActivation(rules);
      if (engine?.rule.id === id) { needsRefresh = engine.pageCount > 1; engine.destroy(); engine = null; }
      fillRule(); renderStatus(); message('规则已删除。');
    }));
    $('toggle').addEventListener('click', () => {
      if (!engine) return;
      if (['idle', 'loading'].includes(engine.state)) engine.pause(); else engine.resume();
    });
    $('load').addEventListener('click', () => engine?.load());
    $('refresh').addEventListener('click', () => location.reload());
    $('export').addEventListener('click', () => {
      $('json').value = JSON.stringify({ schemaVersion: 1, rules: readRules() }, null, 2);
      $('json').focus(); $('json').select(); message('已导出全部规则，可复制保存。');
    });
    $('import').addEventListener('click', guard(() => {
      const data = JSON.parse($('json').value);
      if (data.schemaVersion !== 1 || !Array.isArray(data.rules) || data.rules.length > 500) throw new Error('请导入 schemaVersion 为 1 的规则文件，最多 500 条。');
      const incoming = data.rules.map(normalizeRule);
      const merged = new Map(readRules().map((r) => [r.id, r]));
      incoming.forEach((r) => merged.set(r.id, r));
      const rules = [...merged.values()];
      GM_setValue(STORE, rules);
      updateActivation(rules);
      engine?.pause('导入了新规则。'); needsRefresh = true;
      fillRule(matchingRule()); renderStatus(); message(`已导入 ${incoming.length} 条规则。刷新页面后应用。`);
    }));

  }

  function scheduleStart(attempt = 0) {
    clearTimeout(initTimer);
    if (engine || needsRefresh) return;
    const rule = matchingRule();
    if (!rule) return renderStatus();
    startupError = '';
    try { engine = new Pager(rule); renderStatus(); }
    catch (error) {
      if (attempt < 12) initTimer = setTimeout(() => scheduleStart(attempt + 1), 500);
      else { startupError = error.message; renderStatus(); }
    }
  }

  GM_registerMenuCommand('自动翻页：配置当前网站', openPanel);
  GM_registerMenuCommand('自动翻页：暂停 / 继续', () => {
    if (!engine) return openPanel();
    if (['idle', 'loading'].includes(engine.state)) engine.pause(); else engine.resume();
  });
  GM_registerMenuCommand('自动翻页：加载下一页 / 重试', () => {
    if (!engine) return openPanel();
    engine.load();
  });
  updateActivation();
  scheduleStart();
})();
