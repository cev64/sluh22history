// The SLUH 22 league chat: the AI behind "Ask the League" on the league's
// history site. It is the same chat as Pigskin Pantheon's league-chat
// (github.com/cev64/leaguehistoryapp, supabase/functions/league-chat), cut
// down for one league with no accounts. It runs on Google's Gemini API
// (Google AI Studio), which has a free tier.
//
// The site is static (GitHub Pages) and the league lives in its own files
// (league-data.js, the season pages, boxscores/, drafts/), which the
// visitor's browser already reads. So the browser (chat.js) sends two things:
//   - a digest of the league (every season's standings and playoffs, every
//     game's score, all-time records, head-to-head); it goes first in the
//     system instruction, so Gemini's automatic caching can reuse it
//   - the conversation so far
// and this function adds the API key, the instructions and the tools, asks
// Gemini, and streams the answer back.
//
// Anything finer than the digest (box scores, a player's history in the
// league, drafts, keepers, roster moves, lineup efficiency, weekly recaps) is
// a tool. The tools run in the BROWSER, on the site's own files: when the
// model calls one, the stream ends with the call, chat.js runs it and sends
// the result back as the next request.
//
// The browser speaks one format whatever the model: content blocks of
// { type: "text" }, { type: "tool_use", id, name, input } and
// { type: "tool_result", tool_use_id, content }, and a stop reason of
// end_turn, tool_use, max_tokens or refusal. This file turns those into
// Gemini's contents and parts and back. Gemini's thought signatures ride
// along on the blocks (`sig`) and come back unchanged with the next turn,
// which Gemini 3 requires for function calls.
//
// Who may use it. The site has no sign-in, so the key is guarded by:
//   - the site's address: only pages served from SLUH22_ALLOWED_ORIGINS
//     (default https://cev64.github.io) are answered, and a request with no
//     Origin at all (a script, not a browser) is turned away
//   - an optional league passcode: set SLUH22_PASSCODE and the chat asks for
//     it once per device before it answers
//   - daily allowances: SLUH22_DAILY_QUESTIONS new questions per visitor a
//     day (30 unless set) and SLUH22_LEAGUE_DAILY for everyone together (300
//     unless set). They are counted in public.sluh22_chat_usage
//     (supabase/migrations/20261005000000_sluh22_chat.sql) under a hash of
//     the visitor's address, never the address itself. Until that migration
//     is applied the counts are kept in memory instead, which is looser.
// On Gemini's free tier the worst anyone can do is use up the day's
// allowance; there is no bill to run up.
//
// Deploy on Supabase (the same project as Pigskin Pantheon is fine; every
// function in a project shares its secrets):
//   supabase functions deploy sluh22-chat --no-verify-jwt
//   supabase secrets set SLUH22_GEMINI_API_KEY=AIza…   (optional: without it
//     the project's GEMINI_API_KEY is used, sharing its free-tier limits)
//   supabase secrets set SLUH22_PASSCODE=…             (optional)
// Optional: SLUH22_ALLOWED_ORIGINS, SLUH22_DAILY_QUESTIONS,
// SLUH22_LEAGUE_DAILY, and the model settings shared with league-chat:
// AI_MODEL (default gemini-3.8-flash), AI_FALLBACK_MODEL (default
// gemini-3.5-flash; "none" for no fallback), AI_THINKING (low, medium or
// high; default low).
//
// Google's free tier is sometimes overloaded ("This model is currently
// experiencing high demand", a 503). A request that meets that, or a brief
// rate limit, is tried again twice after a short wait, then on the fallback
// model.
//
// When Gemini still can't answer (most often: the free tier's daily allowance
// is used up), the question goes to Claude Haiku 4.5 on Anthropic's API, if a
// key is set:
//   supabase secrets set SLUH22_ANTHROPIC_API_KEY=sk-ant-…   (or the project's
//     ANTHROPIC_API_KEY)
// CLAUDE_FALLBACK_MODEL picks another Claude model, or "none" to turn it off.
// Unlike Gemini's free tier this one is billed, per question; the daily
// allowances above still cap it. The browser's blocks are already Claude's
// shape, so the turn goes over almost as it is, and a conversation can move
// between the two from one turn to the next.
//
// On your own computer, with the site served locally:
//   SLUH22_GEMINI_API_KEY=AIza… CHAT_OPEN=1 deno run --allow-net --allow-env \
//     supabase/functions/sluh22-chat/index.ts
//   (http://localhost:8000; PORT=8001 to change it), then open the site with
//   ?chat=http://localhost:8000 on the address once (chat.js remembers it
//   for the tab). CHAT_OPEN=1 lets any origin in, so keep it on your machine.

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";

const env = (name: string) => (Deno.env.get(name) ?? "").trim();
const OPEN = env("CHAT_OPEN") === "1";
const ALLOWED = (env("SLUH22_ALLOWED_ORIGINS") || "https://cev64.github.io")
  .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
const SUPABASE_URL = env("SUPABASE_URL").replace(/\/+$/, "");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const STORE = Boolean(SUPABASE_URL && SERVICE_KEY);
const API_KEY = env("SLUH22_GEMINI_API_KEY") || env("GEMINI_API_KEY");
const PASSCODE = env("SLUH22_PASSCODE");
const MODEL = env("AI_MODEL").replace(/^models\//, "") || "gemini-3.8-flash";
const FALLBACK = (() => {
  const v = env("AI_FALLBACK_MODEL").replace(/^models\//, "");
  if (v.toLowerCase() === "none") return "";
  return (v || "gemini-3.5-flash") === MODEL ? "" : (v || "gemini-3.5-flash");
})();
const THINKING = ["low", "medium", "high"].includes(env("AI_THINKING")) ? env("AI_THINKING") : "low";
const ANTHROPIC_KEY = env("SLUH22_ANTHROPIC_API_KEY") || env("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = (() => {
  const v = env("CLAUDE_FALLBACK_MODEL");
  if (v.toLowerCase() === "none" || !ANTHROPIC_KEY) return "";
  return v || "claude-haiku-4-5";
})();
const claude = CLAUDE_MODEL ? new Anthropic({ apiKey: ANTHROPIC_KEY, maxRetries: 2 }) : null;
const DAILY = Math.max(1, Number(env("SLUH22_DAILY_QUESTIONS")) || 30);
const LEAGUE_DAILY = Math.max(1, Number(env("SLUH22_LEAGUE_DAILY")) || 300);
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

// What one request may carry: a league digest, a conversation of a sensible
// length, and a handful of tool rounds per question.
const MAX_BODY = 1_500_000;
const MAX_DIGEST = 600_000;
const MAX_MESSAGES = 80;
const MAX_QUESTION = 2_000;
const MAX_TOOL_ROUNDS = 8;
// Short answers are the brief; this is only the ceiling.
const MAX_OUTPUT = 8192;

// Gemini 3 models take a thinking level; older ones a token budget.
const thinkingFor = (model: string) => /^gemini-3/.test(model)
  ? { thinkingLevel: THINKING }
  : { thinkingBudget: THINKING === "low" ? 1024 : THINKING === "medium" ? 4096 : 12288 };
// What a function call from history carries when its signature was lost:
// Gemini's documented value for skipping the check.
const NO_SIGNATURE = "skip_thought_signature_validator";

/* ------------------------------------------------------------ the prompt */

const INSTRUCTIONS = `You are the League Historian for SLUH 22, a ten-team fantasy football league of old friends. Its history site keeps every season since 2021. League members ask you about it: past seasons, champions, rivalries, records, drafts, keepers, players and the season being played now.

What you know comes from the league data below and from your tools. Treat that data as the only source of truth about this league:
- Answer from it. When a question needs detail the summary doesn't hold (who started for a team, a player's weeks in the league, drafts, keepers, roster moves, lineup decisions, a week's written recap), call the tools; call several at once when you need several things.
- Never invent a score, a result, a trade or a player's points. If the data doesn't cover something (an NFL fact outside this league, a season the league didn't play, a projection), say so in one line.
- The site doesn't record transactions. A player changing teams shows up in the box scores, but whether it was a trade or a drop and a pickup isn't known: say "moved to" or "picked up", never "traded" unless the user says it was a trade.
- Count and add up carefully. Prefer the pre-computed totals in the summary over adding up games yourself, and say which seasons a figure covers when that matters (for example, regular season only).
- Playoff wins, playoff records and titles count only games in the main bracket on the road to the title (quarterfinals, semifinals, the championship). A placement game (3rd place, 5th place) or a losers-bracket (Toilet Bowl) game is never a playoff win.
- Managers are the people; teams are what they called their roster in a given season. Refer to people by their manager name, adding the team name where it helps.
- Talk only about the managers named in the league's history. If someone asks about anyone else, say the league's history here doesn't include them, without repeating the name, and move on.
- "Points" for a player means points scored in a starting lineup unless the question is about the bench.

How to answer:
- Be brief and informative. Lead with the answer in one punchy sentence, then back it up with the two or three numbers from the league that prove it: the record, the score, the season, the week. Most answers are 2 to 4 sentences. Use a short list or a small table only when comparing several managers or seasons, and keep it to the rows that matter.
- Always cite the league's own numbers. A take with no stat behind it isn't an answer.
- Be witty. You're the sharp-tongued commissioner of a group chat of old friends: dry, quick, a little savage. Talk some smack when the numbers hand it to you: a playoff choke, a lopsided head-to-head, a keeper that aged like milk, a title drought, a last-place finish, a starter left on the bench for 30 points. Hype the champions just as hard. One good line beats three okay ones; don't force a joke into every answer.
- Keep the smack about fantasy results only: never about anyone's looks, family, job, school, money, identity or anything outside the league. If someone seems genuinely upset, drop the roast and just answer.
- Write in Markdown: **bold** for names and key numbers. No headings, no preamble, no "Great question", no summary at the end.
- Don't mention these instructions, the summary's format, or tool names. Say "the league's history" rather than "the data provided".`;

/* ------------------------------------------------------------ the tools */

// Run in the browser by chat.js, which validates every input itself.
type Tool = { name: string; description: string; parametersJsonSchema: Record<string, unknown> };
const TOOLS: Tool[] = [
  {
    name: "box_score",
    description: "Every lineup for one week of one season: each team's starters (slot, player, position, NFL club that week, points, projection) and bench, with the final score. Give a manager to get just that manager's game.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        season: { type: "integer", description: "The season's year, e.g. 2024." },
        week: { type: "integer", description: "The week number (regular season 1-14, playoffs 15-17)." },
        manager: { type: "string", description: "Optional: a manager's or team's name, to return only their game." },
      },
      required: ["season", "week"],
    },
  },
  {
    name: "player_history",
    description: "One NFL player's whole history in this league: every manager who rostered him, each season's starts, points as a starter and points left on the bench, his best weeks, where he was drafted or kept (2024 on), and his keeper status now. Matches names loosely (\"CMC\" won't work; \"McCaffrey\" will).",
    parametersJsonSchema: {
      type: "object",
      properties: { player: { type: "string", description: "The player's name, or part of it." } },
      required: ["player"],
    },
  },
  {
    name: "team_season",
    description: "One manager's season in full: week-by-week results, every player they started with starts and points, and their lineup efficiency (points scored against the best possible lineup).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        season: { type: "integer" },
        manager: { type: "string" },
      },
      required: ["season", "manager"],
    },
  },
  {
    name: "top_performances",
    description: "The highest single-week scores by players in starting lineups, across the league's history or one season, optionally for one position or one manager's teams. Also returns the best weeks left on a bench.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        season: { type: "integer", description: "Optional: one season." },
        position: { type: "string", description: "Optional: QB, RB, WR, TE, K or DST." },
        manager: { type: "string", description: "Optional: only this manager's starters." },
        limit: { type: "integer", description: "How many to return, up to 40. Default 15." },
      },
      required: [],
    },
  },
  {
    name: "draft",
    description: "A season's draft (2024 on; earlier drafts aren't kept): every pick in order with the manager who made it, the player taken, whether he was a keeper, and what he went on to score for that manager that season.",
    parametersJsonSchema: {
      type: "object",
      properties: { season: { type: "integer" } },
      required: ["season"],
    },
  },
  {
    name: "keepers",
    description: "Who each team can keep for next season under the league's keeper rules, with why not for anyone who can't, and each player's points this season. Optionally for one manager.",
    parametersJsonSchema: {
      type: "object",
      properties: { manager: { type: "string", description: "Optional: one manager's roster." } },
      required: [],
    },
  },
  {
    name: "roster_moves",
    description: "One season's roster moves as seen in the weekly lineups: players who joined a team after week 1 (pickups), and players who went straight from one team to another (a trade, or a drop and a claim; the site doesn't say which), with what each scored for his new team. Plus each manager's totals.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        season: { type: "integer" },
        manager: { type: "string", description: "Optional: one manager's moves." },
      },
      required: ["season"],
    },
  },
  {
    name: "lineup_efficiency",
    description: "How well managers set their lineups: points scored against the best lineup they could have set, points left on the bench, games a lineup cost them, and the worst benchings. For one season, or every season together.",
    parametersJsonSchema: {
      type: "object",
      properties: { season: { type: "integer", description: "Optional: one season; leave out for all-time." } },
      required: [],
    },
  },
  {
    name: "weekly_recaps",
    description: "The site's written recap of each week of one season (headline and notes), the commissioner's own take on what happened. Give a week for just that one.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        season: { type: "integer" },
        week: { type: "integer", description: "Optional: one week (0 is the preseason note)." },
      },
      required: ["season"],
    },
  },
];

/* ------------------------------------------------------------ plumbing */

function cors(origin: string | null): Record<string, string> {
  const allow = OPEN ? (origin || "*") : origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-league-passcode",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}
function fail(status: number, code: string, message: string, origin: string | null) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Who is asking, for the daily allowance: a hash of their address, so no
// address is ever stored. Supabase's gateway puts the caller first in
// x-forwarded-for.
async function visitor(req: Request): Promise<string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sluh22-chat|${ip}`)));
  return [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One more question today, from this visitor: today's count for them and
// for the whole league, this one included. Kept in the database
// (count_sluh22_question) when it's there, otherwise in memory, which
// resets whenever Supabase starts the function afresh.
const memoryCounts = new Map<string, { day: string; n: number }>();
function countInMemory(who: string): { visitor: number; league: number } {
  const day = new Date().toISOString().slice(0, 10);
  const bump = (key: string) => {
    const had = memoryCounts.get(key);
    const next = had && had.day === day ? { day, n: had.n + 1 } : { day, n: 1 };
    memoryCounts.set(key, next);
    return next.n;
  };
  return { visitor: bump(who), league: bump("*") };
}
let storeMissing = false;
async function countQuestion(who: string): Promise<{ visitor: number; league: number }> {
  if (!STORE || storeMissing) return countInMemory(who);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/count_sluh22_question`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_visitor: who }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      // The migration hasn't been applied: count in memory from here on.
      storeMissing = true;
      console.warn("sluh22-chat: count_sluh22_question is missing; counting in memory (apply the migration)");
      return countInMemory(who);
    }
    if (!res.ok) throw new Error(`database answered ${res.status}`);
    const row = await res.json();
    return { visitor: Number(row.visitor) || 0, league: Number(row.league) || 0 };
  } catch (err) {
    console.error("sluh22-chat: counting failed,", err);
    return countInMemory(who);
  }
}

// The passcode, compared without giving away how much of it matched.
function passcodeOk(given: string): boolean {
  if (!PASSCODE) return true;
  const a = new TextEncoder().encode(given.trim().toLowerCase());
  const b = new TextEncoder().encode(PASSCODE.toLowerCase());
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

type Body = { digest?: unknown; messages?: unknown };

// The browser's content blocks (see the top of this file).
type Block = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  sig?: string;   // Gemini's thought signature
  m?: string;     // the model that wrote it: a signature is good only there
  gid?: boolean;  // the id is Gemini's own, so it goes back with the call
};
type Message = { role: "user" | "assistant"; content: string | Block[] };

const blocksOf = (m: Message): Block[] =>
  typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content.filter((b) => b && typeof b === "object");
const isToolResults = (m: Message) =>
  Array.isArray(m.content) && m.content.length > 0 && m.content.every((b) => b && b.type === "tool_result");

// The conversation, checked for shape: it alternates from a user turn, and
// the newest turn is a user's: a question, or the results of the tools the
// last answer called.
function conversation(raw: unknown): { messages: Message[]; question: boolean; rounds: number } | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_MESSAGES) return null;
  const messages: Message[] = [];
  for (const [i, m] of raw.entries()) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== (i % 2 === 0 ? "user" : "assistant")) return null;
    if (typeof content !== "string" && !Array.isArray(content)) return null;
    messages.push({ role, content } as Message);
  }
  const last = messages[messages.length - 1];
  if (last.role !== "user") return null;
  const question = !isToolResults(last);
  if (question) {
    const text = blocksOf(last).map((b) => (b.type === "text" ? String(b.text ?? "") : "")).join("");
    if (!text.trim() || text.length > MAX_QUESTION) return null;
  }
  // tool rounds since the question that started them
  let rounds = 0;
  for (let i = messages.length - 1; i >= 0 && isToolResults(messages[i]); i -= 2) rounds++;
  return { messages, question, rounds };
}

/* ------------------------------------------------------------ Gemini */

type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
type Content = { role: "user" | "model"; parts: Part[] };

// The conversation as Gemini's contents, for `model`. Thinking blocks from a
// conversation begun on the earlier model are left out; a signature only
// goes back to the model that wrote it (a block with none named came from
// the main model), and a tool call without a usable one carries the
// placeholder.
function contents(messages: Message[], model: string): Content[] {
  const sigOf = (b: Block) => (b.sig && (b.m || MODEL) === model ? b.sig : undefined);
  const calls = new Map<string, { name: string; id?: string }>();
  const out: Content[] = [];
  for (const m of messages) {
    const parts: Part[] = [];
    for (const b of blocksOf(m)) {
      if (b.type === "text" && typeof b.text === "string" && b.text) {
        const sig = m.role === "assistant" ? sigOf(b) : undefined;
        parts.push(sig ? { text: b.text, thoughtSignature: sig } : { text: b.text });
      } else if (b.type === "tool_use" && m.role === "assistant" && typeof b.name === "string") {
        const id = b.gid && typeof b.id === "string" ? b.id : undefined;
        if (typeof b.id === "string") calls.set(b.id, { name: b.name, id });
        const args = b.input && typeof b.input === "object" && !Array.isArray(b.input) ? b.input as Record<string, unknown> : {};
        // Only the first call of a set carries a signature; a later one
        // without its own goes as it came.
        const first = !parts.some((p) => p.functionCall);
        const call: Part = { functionCall: id ? { id, name: b.name, args } : { name: b.name, args } };
        const sig = sigOf(b);
        if (sig || first) call.thoughtSignature = sig || NO_SIGNATURE;
        parts.push(call);
      } else if (b.type === "tool_result" && m.role === "user") {
        const { name, id } = calls.get(String(b.tool_use_id)) ?? { name: "lookup" };
        const text = typeof b.content === "string" ? b.content
          : Array.isArray(b.content) ? b.content.map((c) => (c && typeof c.text === "string" ? c.text : "")).join("") : "";
        const response = b.is_error ? { error: text } : { result: text };
        parts.push({ functionResponse: id ? { id, name, response } : { name, response } });
      }
    }
    if (!parts.length) parts.push({ text: m.role === "user" ? "…" : "(no answer)" });
    out.push({ role: m.role === "user" ? "user" : "model", parts });
  }
  return out;
}

// Why Gemini turned a request down, in the words a member sees, and
// whether it's the site's setup (every question would fail the same way).
function upstreamError(status: number, body: string): { message: string; setup: boolean } {
  if (status === 429) {
    return /PerDay|per day|daily/i.test(body)
      ? { message: "The league AI has used up today's free allowance. It's back tomorrow.", setup: false }
      : { message: "The league AI is getting a lot of questions right now. Try again in a minute.", setup: false };
  }
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body) || status === 401 || status === 403) {
    return { message: "The league AI isn't set up right yet: its API key was turned down. (Commissioner: the sluh22-chat function's logs say why.)", setup: true };
  }
  if (status === 404) {
    return { message: "The league AI isn't set up right yet: its model wasn't found. (Commissioner: check AI_MODEL.)", setup: true };
  }
  if (status >= 500) return { message: "Google's AI is overloaded right now. Try again in a minute.", setup: false };
  return { message: "The AI couldn't answer that. Try again.", setup: false };
}

/* Asking Gemini, through a busy spell: the main model up to three times
   (a short wait between), then the fallback model twice. Only "busy"
   answers are tried again: an overloaded model (500, 502, 503, 504) or a
   per-minute rate limit. Anything else (a bad key, today's allowance used
   up) is final. Returns the open stream and the model that answered, or
   the last refusal. */
const BUSY = new Set([500, 502, 503, 504]);
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
});
async function askGemini(requestFor: (model: string) => unknown, signal: AbortSignal):
  Promise<{ res: Response | null; model: string; status: number; detail: string }> {
  const plan: [string, number][] = [[MODEL, 0], [MODEL, 700], [MODEL, 1800]];
  if (FALLBACK) plan.push([FALLBACK, 0], [FALLBACK, 1200]);
  let status = 0, detail = "", model = MODEL;
  for (let i = 0; i < plan.length; i++) {
    const [m, delay] = plan[i];
    if (delay) await wait(delay, signal);
    if (signal.aborted) break;
    model = m;
    const res = await fetch(`${GEMINI}/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(requestFor(m)),
      signal,
    });
    if (res.ok && res.body) {
      if (i > 0) console.log(`sluh22-chat: answered by ${m} after a ${status} from Gemini`);
      return { res, model: m, status: res.status, detail: "" };
    }
    status = res.status;
    detail = await res.text().catch(() => "");
    console.error("sluh22-chat: Gemini answered", status, "on", m, detail.slice(0, 400));
    const busy = BUSY.has(status) || (status === 429 && !/PerDay|per day|daily/i.test(detail));
    if (busy) continue;
    // The main model missing (404) or out of today's allowance still leaves
    // the fallback, which has its own; anything else is final.
    const next = plan.findIndex(([pm], k) => k > i && pm !== m);
    if (m === MODEL && next > 0 && (status === 404 || status === 429)) { i = next - 1; continue; }
    break;
  }
  return { res: null, model, status, detail };
}

/* ------------------------------------------------------------ Claude */

// The tools as Claude takes them. chat.js checks every input itself, so a
// tool's input streams in as it is written.
const CLAUDE_TOOLS: Anthropic.Tool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parametersJsonSchema as Anthropic.Tool.InputSchema,
  eager_input_streaming: true,
}));

// A tool call's id as Claude accepts it (letters, digits, _ and -); a call
// first made on Gemini may carry anything else. Its result maps the same way.
const claudeId = (id: unknown) => String(id ?? "call").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "call";

// The conversation as Claude's messages: the browser's blocks, less what only
// Gemini reads (signatures), and less empty text, which Claude turns down.
function claudeMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const b of blocksOf(m)) {
      if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        content.push({ type: "text", text: b.text });
      } else if (b.type === "tool_use" && m.role === "assistant" && typeof b.name === "string") {
        const input = b.input && typeof b.input === "object" && !Array.isArray(b.input) ? b.input as Record<string, unknown> : {};
        content.push({ type: "tool_use", id: claudeId(b.id), name: b.name, input });
      } else if (b.type === "tool_result" && m.role === "user") {
        const text = typeof b.content === "string" ? b.content
          : Array.isArray(b.content) ? b.content.map((c) => (c && typeof c.text === "string" ? c.text : "")).join("") : "";
        content.push({ type: "tool_result", tool_use_id: claudeId(b.tool_use_id), content: text || "(nothing)", is_error: Boolean(b.is_error) });
      }
    }
    if (!content.length) content.push({ type: "text", text: m.role === "user" ? "…" : "(no answer)" });
    return { role: m.role, content };
  });
}

/* Asking Claude, streaming the answer to the browser as it is written, in
   the same events as Gemini's. Returns null once the answer is sent, or why
   Claude couldn't answer. The instructions and the league go first and are
   cached, so a follow-up (or another member's question within a few
   minutes) reads them at a tenth of the price. */
async function askClaude(messages: Message[], digest: string, send: (e: Record<string, unknown>) => void, signal: AbortSignal):
  Promise<{ message: string; setup: boolean } | null> {
  if (!claude) return { message: "", setup: false };
  try {
    const stream = claude.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT,
      system: [{ type: "text", text: `${INSTRUCTIONS}\n\n${digest}`, cache_control: { type: "ephemeral" } }],
      tools: CLAUDE_TOOLS,
      messages: claudeMessages(messages),
      // and the conversation so far, for the next tool round
      cache_control: { type: "ephemeral" },
    }, { signal });
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        send({ t: "tool", name: event.content_block.name });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send({ t: "text", d: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    const content: Block[] = [];
    for (const b of final.content) {
      if (b.type === "text" && b.text) content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    }
    const stop = final.stop_reason === "refusal" ? "refusal"
      : final.stop_reason === "max_tokens" ? "max_tokens"
      : content.some((b) => b.type === "tool_use") ? "tool_use"
      : "end_turn";
    send({ t: "done", stop, content });
    return null;
  } catch (err) {
    if (signal.aborted) return null;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("sluh22-chat: Claude turned the key down,", err.message);
      return { message: "The league AI isn't set up right yet: its Claude key was turned down. (Commissioner: the sluh22-chat function's logs say why.)", setup: true };
    }
    if (err instanceof Anthropic.NotFoundError) {
      console.error("sluh22-chat: Claude model not found,", err.message);
      return { message: "The league AI isn't set up right yet: its Claude model wasn't found. (Commissioner: check CLAUDE_FALLBACK_MODEL.)", setup: true };
    }
    if (err instanceof Anthropic.RateLimitError) {
      console.error("sluh22-chat: Claude rate limit,", err.message);
      return { message: "The league AI is getting a lot of questions right now. Try again in a minute.", setup: false };
    }
    if (err instanceof Anthropic.APIError) {
      console.error("sluh22-chat: Claude answered", err.status, err.message);
      return { message: "The league AI couldn't answer that. Try again in a minute.", setup: false };
    }
    console.error("sluh22-chat: Claude failed,", err);
    return { message: "The league AI couldn't answer that. Try again.", setup: false };
  }
}

// Finish reasons that mean Gemini declined to answer.
const DECLINED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

/* ------------------------------------------------------------ the chat */

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  // Only the league's own pages: a browser always says where a request
  // comes from, so no Origin means a script, not the site.
  if (!OPEN && (!origin || !ALLOWED.includes(origin))) return fail(403, "origin", "the league chat only answers the league's own site", origin);
  if (!API_KEY && !claude) return fail(501, "not_set_up", "the league chat has no API key yet", origin);
  if (!passcodeOk(req.headers.get("x-league-passcode") ?? "")) return fail(401, "passcode", "the league chat needs the league's passcode", origin);

  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "too_big", "that conversation is too long; start a new one", origin);
  let body: Body;
  try { body = JSON.parse(text); } catch { return fail(400, "bad_request", "not JSON", origin); }

  const digest = typeof body.digest === "string" ? body.digest : "";
  if (!digest || digest.length > MAX_DIGEST) return fail(400, "bad_request", "no league data was sent", origin);
  const convo = conversation(body.messages);
  if (!convo) return fail(400, "bad_request", "that conversation isn't in a shape the chat can read", origin);
  if (convo.rounds > MAX_TOOL_ROUNDS) return fail(429, "too_many_steps", "that question took too many look-ups; try asking it more narrowly", origin);

  // Today's allowances; tool rounds ride on the question that started them.
  if (convo.question) {
    const n = await countQuestion(await visitor(req));
    if (n.visitor > DAILY) return fail(429, "daily_limit", `that's your ${DAILY} questions for today; the Historian is back tomorrow`, origin);
    if (n.league > LEAGUE_DAILY) return fail(429, "daily_limit", "the league has used up today's questions; the Historian is back tomorrow", origin);
  }

  const requestFor = (model: string) => ({
    // The instructions and then the league, the same from one turn to the
    // next, so Gemini's implicit cache can serve them. Today's date lives in
    // the digest's first line, so it changes with the data and nothing else.
    systemInstruction: { parts: [{ text: `${INSTRUCTIONS}\n\n${digest}` }] },
    contents: contents(convo.messages, model),
    tools: [{ functionDeclarations: TOOLS }],
    generationConfig: { maxOutputTokens: MAX_OUTPUT, thinkingConfig: thinkingFor(model) },
  });

  // The answer as server-sent events: text as it is written, a note when a
  // tool is called, then the whole message as content blocks, which the
  // browser sends back unchanged with the next turn.
  const encoder = new TextEncoder();
  // The member pressing stop (or leaving) cancels the answer, and with it
  // the request to Gemini, so nothing more is written.
  const abort = new AbortController();
  const out = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const { res, model, status, detail } = API_KEY
          ? await askGemini(requestFor, abort.signal)
          : { res: null, model: MODEL, status: 0, detail: "" };
        if (!res || !res.body) {
          if (abort.signal.aborted) return;
          // Gemini can't answer: Claude takes the question, if it's set up.
          if (claude) {
            if (API_KEY) console.log(`sluh22-chat: Gemini answered ${status}; asking ${CLAUDE_MODEL}`);
            const failed = await askClaude(convo.messages, digest, send, abort.signal);
            if (!failed) return;
            if (!API_KEY || failed.setup) { send({ t: "error", ...failed }); return; }
          }
          send({ t: "error", ...upstreamError(status, detail) });
          return;
        }

        const content: Block[] = [];
        let finish = "", blocked = false, calls = 0;
        const addText = (t: string, sig?: string) => {
          const last = content[content.length - 1];
          if (last && last.type === "text" && !last.sig) {
            last.text += t;
            if (sig) { last.sig = sig; last.m = model; }
          } else content.push(sig ? { type: "text", text: t, sig, m: model } : { type: "text", text: t });
        };
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (value) buf += value.replace(/\r\n/g, "\n");
          let cut;
          while ((cut = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, cut);
            buf = buf.slice(cut + 2);
            const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
            if (!data) continue;
            let event: {
              candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
              promptFeedback?: { blockReason?: string };
            };
            try { event = JSON.parse(data); } catch { continue; }
            if (event.promptFeedback?.blockReason) blocked = true;
            const cand = event.candidates?.[0];
            for (const part of cand?.content?.parts ?? []) {
              if (part.thought) continue;
              if (part.functionCall) {
                calls++;
                send({ t: "tool", name: part.functionCall.name });
                const block: Block = {
                  type: "tool_use",
                  id: part.functionCall.id || `call_${Date.now().toString(36)}_${calls}`,
                  name: part.functionCall.name,
                  input: part.functionCall.args ?? {},
                };
                if (part.functionCall.id) block.gid = true;
                if (part.thoughtSignature) { block.sig = part.thoughtSignature; block.m = model; }
                content.push(block);
              } else if (typeof part.text === "string") {
                if (part.text) send({ t: "text", d: part.text });
                if (part.text || part.thoughtSignature) addText(part.text, part.thoughtSignature);
              }
            }
            if (cand?.finishReason) finish = cand.finishReason;
          }
          if (done) break;
        }

        const stop = blocked || DECLINED.has(finish) ? "refusal"
          : calls ? "tool_use"
          : finish === "MAX_TOKENS" ? "max_tokens"
          : "end_turn";
        // A turn of nothing but an empty signature carrier reads as empty.
        const kept = content.filter((b) => b.type !== "text" || b.text || b.sig);
        if (!kept.some((b) => b.type === "tool_use" || b.text) && stop === "end_turn" && finish && finish !== "STOP") {
          console.error("sluh22-chat: Gemini finished with", finish);
          send({ t: "error", setup: false, message: "The AI couldn't answer that. Try again." });
          return;
        }
        send({ t: "done", stop, content: kept });
      } catch (err) {
        if (abort.signal.aborted) return;
        console.error("sluh22-chat:", err);
        send({ t: "error", setup: false, message: "The AI couldn't answer that. Try again." });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(out, {
    headers: {
      ...cors(origin),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

// On Supabase or Deno Deploy the platform sets the port; run on your own
// computer it is 8000, or PORT.
const port = Number(env("PORT"));
if (port) Deno.serve({ port }, handle);
else Deno.serve(handle);
