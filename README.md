# Discord Message Deleter — delete your DM & channel messages

Bulk-delete **your own** messages in any Discord **DM, group, or channel**. Adds a panel top-right — paste token, Detect, Start. Only your messages get deleted. Works via Tampermonkey.

## ⚠️ Never share your token
Your token = full login to your account. No password, no 2FA needed. **Never** paste it in sites, bots, screenshots, or chats. Leaked it? → **Settings → My Account → Change Password**.

## Install
1. Get [Tampermonkey](https://www.tampermonkey.net/).
2. **[Install from Greasy Fork](https://greasyfork.org/en/scripts/591955-discord-message-deleter-dm-channel-cleaner)** — click "Install this script" and Tampermonkey does the rest.
3. Reload Discord. Panel shows top-right.

## Get your token
`F12` → **Network** tab → type `/api` → click any row.

![Network tab](./network-tab.png)

**Headers → Request Headers → authorization** → copy the value.

![authorization header](./authorization-header.png)

Paste it in the panel.

## Run
Open the chat → paste token → **Detect** (check the name) → pick speed → **Start**.
Deletes only your messages, current chat only. Big histories take a while (Discord caps ~1/sec).

<sub>Self-botting breaks Discord ToS — use at your own risk. MIT.</sub>
