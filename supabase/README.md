# Ask the League: the AI chat's server half

The site is static (GitHub Pages), so it can't keep a secret: anything in the
repository or the pages is public. The Gemini API key lives in a Supabase Edge
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

2. **The key.** Edge Functions ▸ Secrets. Secrets are shared by every
   function in the project, so the `GEMINI_API_KEY` Pigskin Pantheon already
   uses works as is. To give this league its own free-tier allowance, make a
   second key in Google AI Studio (aistudio.google.com ▸ Get API key ▸ in a
   *new* Google Cloud project, with no billing) and save it as
   `SLUH22_GEMINI_API_KEY`; the function prefers it.

3. **Optional: a league passcode.** Save `SLUH22_PASSCODE` and the chat asks
   each device for it once (not case-sensitive). Share it in the group chat.

4. **Optional, recommended: a backup on Claude.** When Gemini can't answer
   (the free tier's daily allowance used up, or Google overloaded), the
   question goes to Claude Haiku 4.5 instead. Make a key at
   platform.claude.com ▸ API keys and save it as `SLUH22_ANTHROPIC_API_KEY`
   (or `ANTHROPIC_API_KEY`, shared with the project's other functions), then
   redeploy the function. This one is billed: with the league summary cached,
   a question costs about a cent or two, and the daily limits below cap it.

5. **Apply the usage counter**: paste
   `migrations/20261005000000_sluh22_chat.sql` into SQL editor and run it.
   Until then the daily limits are counted in memory, which is looser.

## Settings (all optional, as function secrets)

| Secret | Default | What it does |
| --- | --- | --- |
| `SLUH22_GEMINI_API_KEY` | `GEMINI_API_KEY` | The Gemini key |
| `SLUH22_PASSCODE` | none | A passcode the chat asks for |
| `SLUH22_ALLOWED_ORIGINS` | `https://cev64.github.io` | Sites allowed to call it (comma-separated) |
| `SLUH22_DAILY_QUESTIONS` | 30 | Questions per visitor per day |
| `SLUH22_LEAGUE_DAILY` | 300 | Questions per day for everyone together |
| `AI_MODEL`, `AI_FALLBACK_MODEL`, `AI_THINKING` | shared with league-chat | Which Gemini model, and how hard it thinks |
| `SLUH22_ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | The Claude key for the backup; without one there is no backup |
| `CLAUDE_FALLBACK_MODEL` | `claude-haiku-4-5` | The backup's model; `none` turns the backup off |

On Gemini's free tier nobody can run up a bill: the worst case is the day's
allowance running out. The Claude backup is billed, but only answers when
Gemini can't, and only within the daily limits. Free-tier prompts may be used by Google to improve its
products.

## Trying it on your own computer

```bash
SLUH22_GEMINI_API_KEY=AIza… CHAT_OPEN=1 deno run --allow-net --allow-env \
  supabase/functions/sluh22-chat/index.ts
```

then serve the site and open any page with `?chat=http://localhost:8000`.
