# Valore Library moderation workflow (n8n)

This project already screens every submission itself (`museum_server.py` calls Claude
directly and auto-publishes/auto-rejects/flags for review — no setup required, it just
works). This n8n workflow is optional: import it if you want n8n itself to be the
system doing the screening, e.g. for visibility, logging, or chaining in extra steps
(Slack alert on `needs_review`, etc.).

## Setup

1. In n8n, **Import from File** → `valore-museum-moderation.json`.
2. Open the **Screen with Claude** node and add your Anthropic API credential
   (same key as `ANTHROPIC_API_KEY` in `.env`).
3. Open the **Send Result to Valore Library** node and:
   - Replace `YOUR-MUSEUM-SERVER-HOST` in the URL with wherever `museum_server.py`
     is actually reachable from n8n (e.g. a local network IP, or a tunnel/reverse
     proxy if n8n is hosted elsewhere).
   - Replace `PASTE_N8N_CALLBACK_SECRET_FROM_ENV_HERE` with the value of
     `N8N_CALLBACK_SECRET` from `.env`.
4. Activate the workflow and copy its production webhook URL.
5. In `.env`, set `N8N_WEBHOOK_URL` to that URL.
6. If you want n8n to be the *authoritative* screener instead of the server's
   built-in one, set `DISABLE_BUILTIN_AI_SCREENING=true` in `.env` — new
   submissions will then sit as `pending` until this workflow calls back with a
   decision. Leave it `false` (default) to keep the built-in screening as the
   real-time decision-maker and use this workflow purely in parallel (e.g. for
   notifications) instead.
