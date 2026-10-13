# Ask the League: the AI chat's server half

The site is static (GitHub Pages), so it can't keep a secret: anything in the
repository or the pages is public. The Claude API key lives in a Supabase Edge
Function instead, `functions/sluh22-chat`, which the chat (`chat.js` at the
root) calls. It runs in the same Supabase project as Pigskin Pantheon
(`League History`, `vnmzjfnfqqxedbmirakb`); `CHAT_URL` at the top of
`chat.js` points at it.

## Setting it up

1. **Deploy the function**, with JWT checks off (the site has no sign-in):

   ```bash
   supabase functions deploy sluh22-chat --no-verify-jwt --project-ref vnmzjfnfqqxedbmirakb
   ```

   Or in the dashboard: Edge Functions ▸ Deploy a new function ▸ via editor,
   name it `sluh22-chat`, paste `functions/sluh22-chat/index.ts`, and turn
   off "Verify JWT" in its settings.

2. **The key.** The chat runs on Claude Haiku 5.5. Make a key at
   platform.claude.com ▸ API keys, then in Edge Functions ▸ Secrets save it as
   `SLUH22_ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY`, shared with the
   project's other functions). It's billed per question, but Haiku is
   Claude's cheapest model, the league summary is cached between questions,
   and the daily limits below cap the total.

3. **Optional: a league passcode.** Save `SLUH22_PASSCODE` and the chat asks
   each device for it once (not case-sensitive). Share it in the group chat.

4. **Apply the usage counter**: paste
   `migrations/20261005000000_sluh22_chat.sql` into SQL editor and run it.
   Until then the daily limits are counted in memory, which is looser.

## Settings (all optional, as function secrets)

| Secret | Default | What it does |
| --- | --- | --- |
| `SLUH22_ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | The Claude key |
| `SLUH22_PASSCODE` | none | A passcode the chat asks for |
| `SLUH22_ALLOWED_ORIGINS` | `https://cev64.github.io` | Sites allowed to call it (comma-separated) |
| `SLUH22_DAILY_QUESTIONS` | 30 | Questions per visitor per day |
| `SLUH22_LEAGUE_DAILY` | 300 | Questions per day for everyone together |
| `SLUH22_CLAUDE_MODEL` | `claude-haiku-5-5` | Which Claude model answers |
| `SLUH22_EFFORT` | `low` | How hard it thinks: `low` (quickest), `medium` or `high` |

Nobody can run up much of a bill: every question counts against the daily
limits above, per visitor and for the league.

## Trying it on your own computer

```bash
SLUH22_ANTHROPIC_API_KEY=sk-ant-… CHAT_OPEN=1 deno run --allow-net --allow-env \
  supabase/functions/sluh22-chat/index.ts
```

then serve the site and open any page with `?chat=http://localhost:8000`.
