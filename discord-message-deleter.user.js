// ==UserScript==
// @name         Discord Message Deleter - DM & Channel Cleaner
// @namespace    https://github.com/nobody-you-used-to-know/discord-message-deleter
// @version      1.1.0
// @description  Bulk-delete your own messages in the currently open Discord DM, group, or channel. Collapsible, draggable, resizable panel. Your token stays local and only talks to Discord.
// @author       nobody-you-used-to-know
// @match        https://discord.com/*
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/nobody-you-used-to-know/discord-message-deleter
// ==/UserScript==

/*
 * IMPORTANT
 * - Never share your token. Anyone who has it can log into your account with
 *   no password and no 2FA.
 * - Automating your account (self-botting) breaks Discord's Terms of Service.
 *   Use at your own risk.
 */

(() => {
  'use strict';

  if (document.getElementById('ddm-root')) return;

  const LS_POS  = 'ddm.pos.v1';
  const LS_SIZE = 'ddm.size.v1';
  const LS_OPEN = 'ddm.open.v1';

  let stop = false;
  let running = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- root (icon + panel) ----------
  const root = document.createElement('div');
  root.id = 'ddm-root';
  document.body.appendChild(root);

  // launcher icon (trash) - top right by default
  const icon = document.createElement('div');
  icon.id = 'ddm-icon';
  icon.title = 'Discord Message Deleter';
  icon.style.cssText = `
    position:fixed; top:14px; right:14px; z-index:99999;
    width:34px; height:34px; border-radius:8px;
    background:#2b2d31; border:1px solid #3a3c41;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.4);
    color:#dbdee1; transition:background .15s, transform .15s;`;
  icon.onmouseenter = () => { icon.style.background = '#35373c'; };
  icon.onmouseleave = () => { icon.style.background = '#2b2d31'; };
  // simple trash SVG
  icon.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
      <path d="M10 11v6M14 11v6"></path>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
    </svg>`;
  root.appendChild(icon);

  // panel
  const panel = document.createElement('div');
  panel.id = 'ddm-panel';
  const savedPos = readJSON(LS_POS)  || { top: 56, right: 14 };
  const savedSize = readJSON(LS_SIZE) || { w: 320, h: 480 };
  panel.style.cssText = `
    position:fixed; z-index:99999; display:none;
    top:${savedPos.top}px; ${'left' in savedPos ? `left:${savedPos.left}px;` : `right:${savedPos.right}px;`}
    width:${savedSize.w}px; height:${savedSize.h}px;
    min-width:260px; min-height:340px; max-width:520px; max-height:80vh;
    background:#1e1f22; color:#dbdee1;
    font:13px/1.45 -apple-system, BlinkMacSystemFont, sans-serif;
    border:1px solid #3a3c41; border-radius:12px;
    box-shadow:0 8px 30px rgba(0,0,0,.75);
    display:flex; flex-direction:column; overflow:hidden; resize:both;`;
  panel.style.display = 'none';
  panel.innerHTML = `
    <div id="ddm-header" style="background:#111214; padding:9px 12px; font-weight:700; font-size:13px;
      display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none; flex:0 0 auto;">
      <span>Run &middot; Discord Message Deleter</span>
      <span id="ddm-min" title="Minimise" style="cursor:pointer; opacity:.6; padding:0 4px; font-size:16px;">&minus;</span>
    </div>

    <div style="padding:12px; overflow:auto; flex:1 1 auto;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#949ba4; margin-bottom:4px;">Target</div>
      <div id="ddm-target" style="background:#111; border-radius:6px; padding:8px; margin-bottom:12px;
        font-size:12px; color:#ccc; min-height:17px;">Open a chat &mdash; auto-detects.</div>

      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#949ba4; margin-bottom:4px;">Your token</div>
      <input id="ddm-token" type="password" placeholder="Paste from Network tab (authorization)"
        autocomplete="off" spellcheck="false"
        style="width:100%; box-sizing:border-box; padding:7px; background:#111;
        border:1px solid #3a3c41; border-radius:6px; color:#fff; margin-bottom:6px;">
      <div style="font-size:11px; color:#6d7178; margin-bottom:12px;">
        Detection can take 1&ndash;2 seconds after switching channels.
      </div>

      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#949ba4; margin-bottom:4px;">Speed</div>
      <select id="ddm-speed" style="width:100%; box-sizing:border-box; padding:7px; background:#111;
        border:1px solid #3a3c41; border-radius:6px; color:#fff; margin-bottom:12px;">
        <option value="300">Safe &mdash; gentlest, least likely to hit limits</option>
        <option value="150" selected>Balanced &mdash; recommended</option>
        <option value="80">Fast &mdash; pushes Discord's cap</option>
      </select>

      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <button id="ddm-start" style="flex:1; padding:8px; cursor:pointer; background:#248046;
          border:none; border-radius:6px; color:#fff; font-weight:600;">Start</button>
        <button id="ddm-stop" style="flex:1; padding:8px; cursor:pointer; background:#8a1c1c;
          border:none; border-radius:6px; color:#fff; font-weight:600;">Stop</button>
      </div>

      <div id="ddm-count" style="font-weight:600; margin-bottom:6px;">Deleted 0 &middot; scanned 0</div>
      <div id="ddm-log" style="height:80px; overflow:auto; background:#111; border-radius:6px;
        padding:6px; font:11px/1.4 monospace; white-space:pre-wrap; color:#9aa0a6;"></div>

      <div style="font-size:10px; color:#5c6067; margin-top:10px;">
        Never share your token &mdash; it is full account access.
      </div>
    </div>`;
  root.appendChild(panel);

  const $ = sel => panel.querySelector(sel);
  const logEl = $('#ddm-log');
  const countEl = $('#ddm-count');
  const targetEl = $('#ddm-target');
  const tokenEl = $('#ddm-token');

  const log = msg => {
    logEl.textContent = (msg + '\n' + logEl.textContent).split('\n').slice(0, 50).join('\n');
  };
  const H = () => ({ Authorization: tokenEl.value.trim() });
  const setCount = (d, s) => { countEl.innerHTML = `Deleted ${d} &middot; scanned ${s}`; };

  // ---------- open/close ----------
  const setOpen = open => {
    panel.style.display = open ? 'flex' : 'none';
    icon.style.display = open ? 'none' : 'flex';
    try { localStorage.setItem(LS_OPEN, open ? '1' : '0'); } catch (_) {}
  };
  icon.onclick = () => { setOpen(true); scheduleDetect(200); };
  $('#ddm-min').onclick = () => setOpen(false);
  const wasOpen = (() => { try { return localStorage.getItem(LS_OPEN) === '1'; } catch (_) { return false; } })();
  setOpen(wasOpen);

  // ---------- drag ----------
  (() => {
    const header = $('#ddm-header');
    let dragging = false, startX = 0, startY = 0, startTop = 0, startLeft = 0;
    header.addEventListener('mousedown', e => {
      if (e.target.id === 'ddm-min') return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startTop = r.top; startLeft = r.left;
      panel.style.right = 'auto';
      panel.style.left = startLeft + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const nt = Math.max(0, Math.min(window.innerHeight - 40, startTop  + (e.clientY - startY)));
      const nl = Math.max(0, Math.min(window.innerWidth  - 40, startLeft + (e.clientX - startX)));
      panel.style.top  = nt + 'px';
      panel.style.left = nl + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      writeJSON(LS_POS, { top: parseFloat(panel.style.top), left: parseFloat(panel.style.left) });
    });
  })();

  // ---------- persist resize ----------
  const ro = new ResizeObserver(() => {
    writeJSON(LS_SIZE, { w: panel.offsetWidth, h: panel.offsetHeight });
  });
  ro.observe(panel);

  // ---------- target detection ----------
  let lastPath = location.pathname;
  let detectTimer = null;
  let detecting = false;

  function pulseDetecting(on) {
    detecting = on;
    if (on) {
      targetEl.style.opacity = '.6';
      targetEl.textContent = 'Detecting current chat...';
    } else {
      targetEl.style.opacity = '1';
    }
  }

  async function detect() {
    const token = tokenEl.value.trim();
    if (!token) { pulseDetecting(false); targetEl.textContent = 'Paste your token to detect the chat.'; return null; }

    const parts = location.pathname.split('/'); // /channels/<scope>/<channelId>
    const scope = parts[2];
    const channelId = parts[3];
    if (!channelId) { pulseDetecting(false); targetEl.textContent = 'Open a DM or channel first.'; return null; }

    pulseDetecting(true);
    try {
      const ch = await (await fetch(`/api/v9/channels/${channelId}`, { headers: H() })).json();
      let label;
      if (scope === '@me') {
        if (ch.type === 1) label = `DM with ${ch.recipients?.[0]?.username || 'unknown'}`;
        else if (ch.type === 3) label = `Group: ${ch.name || (ch.recipients || []).map(r => r.username).join(', ')}`;
        else label = `DM ${channelId}`;
      } else {
        let guildName = scope;
        try {
          const g = await (await fetch(`/api/v9/guilds/${scope}`, { headers: H() })).json();
          guildName = g.name || scope;
        } catch (_) {}
        label = `${guildName} > #${ch.name || channelId}`;
      }
      pulseDetecting(false);
      targetEl.textContent = label;
      return channelId;
    } catch (_) {
      pulseDetecting(false);
      targetEl.textContent = 'Detect failed - token wrong or expired?';
      return null;
    }
  }

  function scheduleDetect(delay = 900) {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(detect, delay);
  }

  // re-detect when the URL (channel) changes - Discord uses history.pushState
  (() => {
    const wrap = fnName => {
      const orig = history[fnName];
      history[fnName] = function () {
        const r = orig.apply(this, arguments);
        window.dispatchEvent(new Event('ddm:navigate'));
        return r;
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('ddm:navigate')));
    window.addEventListener('ddm:navigate', () => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        if (panel.style.display !== 'none') scheduleDetect(900);
      }
    });
  })();

  tokenEl.addEventListener('input', () => scheduleDetect(400));

  // ---------- controls ----------
  $('#ddm-stop').onclick = () => { stop = true; log('Stopping.'); };

  $('#ddm-start').onclick = async () => {
    if (running) return;
    const channelId = await detect();
    if (!channelId) return;

    running = true;
    stop = false;

    const me = await (await fetch('/api/v9/users/@me', { headers: H() })).json();
    if (!me.id) { log('Bad token.'); running = false; return; }

    const minDelay = parseInt($('#ddm-speed').value, 10);
    log(`Clearing messages by ${me.username}.`);

    let before = null;
    let deleted = 0;
    let scanned = 0;

    while (!stop) {
      const url = `/api/v9/channels/${channelId}/messages?limit=100` + (before ? `&before=${before}` : '');
      const r = await fetch(url, { headers: H() });

      if (r.status === 429) {
        const w = (await r.json()).retry_after;
        log(`Rate limit ${w}s.`);
        await sleep(w * 1000 + 300);
        continue;
      }
      if (!r.ok) { log(`Fetch failed ${r.status}.`); break; }

      const batch = await r.json();
      if (!batch.length) break;

      before = batch[batch.length - 1].id;
      scanned += batch.length;
      setCount(deleted, scanned);

      for (const m of batch) {
        if (stop) break;
        if (m.author.id !== me.id) continue;

        while (!stop) {
          const d = await fetch(
            `/api/v9/channels/${channelId}/messages/${m.id}`,
            { method: 'DELETE', headers: H() }
          );
          if (d.status === 429) {
            const w = (await d.json()).retry_after;
            log(`Rate limit ${w}s.`);
            await sleep(w * 1000 + 300);
            continue;
          }
          if (d.status === 204) { deleted++; setCount(deleted, scanned); }
          else if (d.status !== 403 && d.status !== 404) log(`Skipped (${d.status}).`);
          const remaining = d.headers.get('x-ratelimit-remaining');
          const resetAfter = parseFloat(d.headers.get('x-ratelimit-reset-after') || '0');
          await sleep(remaining === '0' && resetAfter > 0 ? resetAfter * 1000 + 100 : minDelay);
          break;
        }
      }
    }

    log(`Done. Deleted ${deleted} of ${scanned} scanned.`);
    running = false;
  };

  // ---------- helpers ----------
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
})();
