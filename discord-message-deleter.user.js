// ==UserScript==
// @name         Discord Message Deleter - DM & Channel Cleaner
// @namespace    https://github.com/nobody-you-used-to-know/discord-message-deleter
// @version      1.0.0
// @description  Bulk-delete your own messages in the currently open Discord DM, group, or channel. Your token stays local and only talks to Discord.
// @author       nobody you used to know
// @match        https://discord.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

/*
 * HOW IT WORKS
 * - Adds a small panel to the top-right of Discord.
 * - You paste YOUR OWN auth token (from DevTools -> Network -> Request Headers).
 * - It pages backward through the open channel's history and deletes only
 *   messages authored by you. Discord will not let you delete anyone else's.
 * - It reads Discord's rate-limit headers and paces itself so it does not get
 *   throttled or flagged.
 *
 * IMPORTANT
 * - Never share your token. Anyone who has it can log into your account with
 *   no password and no 2FA. Do not paste it into websites, bots, screenshots,
 *   or chats.
 * - Automating your account (self-botting) is against Discord's Terms of
 *   Service. You use this at your own risk.
 */

(() => {
  'use strict';

  const PANEL_ID = 'ddm-panel';
  if (document.getElementById(PANEL_ID)) return;

  let stop = false;
  let running = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- UI ----------
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position:fixed; top:16px; right:16px; z-index:99999; width:300px;
    background:#1e1f22; color:#dbdee1;
    font:13px/1.45 -apple-system, BlinkMacSystemFont, sans-serif;
    border:1px solid #3a3c41; border-radius:12px; padding:0;
    box-shadow:0 8px 30px rgba(0,0,0,.75); overflow:hidden;`;

  panel.innerHTML = `
    <div style="background:#111214; padding:11px 14px; font-weight:700; font-size:14px;
      display:flex; justify-content:space-between; align-items:center; cursor:default;">
      <span>Discord DM / Channel Cleaner</span>
      <span id="ddm-close" style="cursor:pointer; opacity:.55; padding:0 4px;">&times;</span>
    </div>

    <div style="padding:14px;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#949ba4; margin-bottom:4px;">Target</div>
      <div id="ddm-target" style="background:#111; border-radius:6px; padding:8px; margin-bottom:12px;
        font-size:12px; color:#ccc; min-height:17px;">Paste token, then Detect.</div>

      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#949ba4; margin-bottom:4px;">Your token</div>
      <input id="ddm-token" type="password" placeholder="Paste from Network tab (authorization)"
        autocomplete="off" spellcheck="false"
        style="width:100%; box-sizing:border-box; padding:8px; background:#111;
        border:1px solid #3a3c41; border-radius:6px; color:#fff; margin-bottom:6px;">
      <button id="ddm-detect" style="width:100%; padding:7px; cursor:pointer; background:#3a3c41;
        border:none; border-radius:6px; color:#fff; margin-bottom:12px;">Detect current chat</button>

      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#949ba4; margin-bottom:4px;">Speed</div>
      <select id="ddm-speed" style="width:100%; box-sizing:border-box; padding:8px; background:#111;
        border:1px solid #3a3c41; border-radius:6px; color:#fff; margin-bottom:4px;">
        <option value="300">Safe - gentlest, least likely to hit limits</option>
        <option value="150" selected>Balanced - recommended</option>
        <option value="80">Fast - pushes Discord's cap</option>
      </select>
      <div style="font-size:11px; color:#6d7178; margin-bottom:12px;">
        Discord throttles to roughly one delete per second no matter what. Speed only affects the margins.
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <button id="ddm-start" style="flex:1; padding:9px; cursor:pointer; background:#248046;
          border:none; border-radius:6px; color:#fff; font-weight:600;">Start</button>
        <button id="ddm-stop" style="flex:1; padding:9px; cursor:pointer; background:#8a1c1c;
          border:none; border-radius:6px; color:#fff; font-weight:600;">Stop</button>
      </div>

      <div id="ddm-count" style="font-weight:600; margin-bottom:6px;">Deleted 0 &middot; scanned 0</div>
      <div id="ddm-log" style="height:90px; overflow:auto; background:#111; border-radius:6px;
        padding:6px; font:11px/1.4 monospace; white-space:pre-wrap; color:#9aa0a6;"></div>

      <div style="font-size:10px; color:#5c6067; margin-top:10px;">
        Never share your token. Anyone who has it can access your account without a password.
      </div>
    </div>`;

  document.body.appendChild(panel);

  const $ = sel => panel.querySelector(sel);
  const logEl = $('#ddm-log');
  const countEl = $('#ddm-count');
  const targetEl = $('#ddm-target');

  const log = msg => {
    logEl.textContent = (msg + '\n' + logEl.textContent).split('\n').slice(0, 60).join('\n');
  };
  const headers = () => ({ Authorization: $('#ddm-token').value.trim() });
  const setCount = (d, s) => { countEl.innerHTML = `Deleted ${d} &middot; scanned ${s}`; };

  $('#ddm-close').onclick = () => panel.remove();
  $('#ddm-stop').onclick = () => { stop = true; log('Stopping.'); };

  // ---------- detect the open chat and name it ----------
  async function detect() {
    const token = $('#ddm-token').value.trim();
    if (!token) { targetEl.textContent = 'Paste your token first.'; return null; }

    const parts = location.pathname.split('/'); // /channels/<scope>/<channelId>
    const scope = parts[2];
    const channelId = parts[3];
    if (!channelId) { targetEl.textContent = 'Open a DM or channel first.'; return null; }

    try {
      const ch = await (await fetch(`/api/v9/channels/${channelId}`, { headers: headers() })).json();
      let label;

      if (scope === '@me') {
        if (ch.type === 1) {
          label = `DM with ${ch.recipients?.[0]?.username || 'unknown'}`;
        } else if (ch.type === 3) {
          label = `Group: ${ch.name || (ch.recipients || []).map(r => r.username).join(', ')}`;
        } else {
          label = `DM ${channelId}`;
        }
      } else {
        let guildName = scope;
        try {
          const g = await (await fetch(`/api/v9/guilds/${scope}`, { headers: headers() })).json();
          guildName = g.name || scope;
        } catch (_) {}
        label = `${guildName} > #${ch.name || channelId}`;
      }

      targetEl.textContent = label;
      return channelId;
    } catch (_) {
      targetEl.textContent = 'Detect failed - token wrong or expired?';
      return null;
    }
  }

  $('#ddm-detect').onclick = detect;

  // ---------- main delete loop ----------
  $('#ddm-start').onclick = async () => {
    if (running) return;

    const channelId = await detect();
    if (!channelId) return;

    running = true;
    stop = false;

    const me = await (await fetch('/api/v9/users/@me', { headers: headers() })).json();
    if (!me.id) { log('Bad token.'); running = false; return; }

    const minDelay = parseInt($('#ddm-speed').value, 10);
    log(`Clearing messages by ${me.username}.`);

    let before = null;
    let deleted = 0;
    let scanned = 0;

    while (!stop) {
      const url = `/api/v9/channels/${channelId}/messages?limit=100` + (before ? `&before=${before}` : '');
      const r = await fetch(url, { headers: headers() });

      if (r.status === 429) {
        const w = (await r.json()).retry_after;
        log(`Rate limit ${w}s.`);
        await sleep(w * 1000 + 300);
        continue;
      }
      if (!r.ok) { log(`Fetch failed ${r.status}.`); break; }

      const batch = await r.json();
      if (!batch.length) break;

      before = batch[batch.length - 1].id; // page backward through history
      scanned += batch.length;
      setCount(deleted, scanned);

      for (const m of batch) {
        if (stop) break;
        if (m.author.id !== me.id) continue; // only your own messages

        while (!stop) {
          const d = await fetch(
            `/api/v9/channels/${channelId}/messages/${m.id}`,
            { method: 'DELETE', headers: headers() }
          );

          if (d.status === 429) {
            const w = (await d.json()).retry_after;
            log(`Rate limit ${w}s.`);
            await sleep(w * 1000 + 300);
            continue;
          }
          if (d.status === 204) {
            deleted++;
            setCount(deleted, scanned);
          } else if (d.status !== 403 && d.status !== 404) {
            log(`Skipped (${d.status}).`);
          }

          // Rate-limit aware pacing: wait the real reset time only when the
          // bucket is empty, otherwise use the chosen minimum delay.
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
})();
