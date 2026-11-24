# auto-route

A model-routing plugin for Claude Code. It works on its own: no other plugin is needed.

- **The routing model.** The main session's system prompt gets an agent table and rules: which work goes to which subagent and model. Subagents don't get it, so they never delegate further.
- **A note on each prompt.** Each prompt you type gets a hidden note naming the table row it matches and up to three skills that fit. Slash commands are left alone.
- **The agents.** Eight agents ship in `agents/`, so installing the plugin installs them.

| Work | Agent | Model |
|---|---|---|
| Bug that resists ordinary debugging, only when you ask for Fable | `auto-route:fable` | fable |
| Auth, permissions, payments, migrations, deletion, concurrency, security | `auto-route:reviewer` | opus |
| Messy code, root-cause debugging, multi-file change with invariants | `auto-route:heavy` | opus, extra-high effort |
| Read a guide, post, doc page or link | `auto-route:reader` | haiku |
| Locate code: "where is X", "what calls Y" | `auto-route:searcher` | haiku |
| Broad sweep across many files, or inspecting a GitHub profile or repos before a build; one subagent per repo, facts with quoted lines | `auto-route:explore` | haiku |
| Run build, lint, typecheck or tests; report pass or fail with the error lines | `auto-route:verifier` | haiku |
| Bounded edit: rename, known-cause bug, boilerplate, tests | `auto-route:editor` | sonnet |
| Anything else | main session | session model |

## Simple questions on a cheaper model

A short question (no code, path or link) gets its turn moved to a cheaper model. A small model call sorts it first:

| The question is | It runs on | While the session context is under |
|---|---|---|
| Plain chat, not about code | Haiku | 0 = off by default; 100,000 tokens when on (`haikuUpTo`) |
| Technical, asking for no change | Sonnet | 50,000 tokens (`sonnetUpTo`) |
| Asking for work | the session's model | |

The limits exist because each model has its own prompt cache. The first switched turn writes the whole conversation into the cheaper model's cache, while the session's model would have read its own cache cheaply. Under 100K tokens, Haiku costs about the same as a warm Opus cache and far less per answer. The Haiku switch is off by default (`haikuUpTo` 0) until it is measured. A switch only goes to a cheaper family than the session's model. Sonnet's first switch costs more than staying on Opus, and it saves only on later questions. Set either limit to `0` in `/config` to turn that switch off.

After a reload nothing switches until the main session makes one request, because until then the context size is unknown.

## What it does at session start

Nothing runs at session start. The routing table and, if you set `houseRules` to `on` in `/config`, the house rules go into the main session's system prompt (off by default).

- **House rules** (`houseRules: on`). `hooks/house.ts` holds them and `hooks/register.ts` adds them to the main session's system prompt (subagents do not get them). They are short on purpose: the answer or next action first, numbered steps for real multi-step work, repo hygiene, changelog and handoff, one automated check per feature. Voice stays with the caveman plugin and code style with ponytail, so nothing is said twice. Say "stop adhd mode" to turn the shape off. If your own `CLAUDE.md` repeats these, delete the copy.
- **Done-check** (`houseRules: on`). The house rules tell Claude to run `hooks/done-check.mjs` once in the project root before a build's final message. It exits 1 with one line per miss: no `HANDOFF.md` or README, a site URL or base path hard-coded in a framework config instead of read from the environment, or a placeholder image.

## Install

In Claude Code (terminal, desktop app or IDE):

```
/plugin marketplace add ITMERowe/exiles
```

```
/plugin install auto-route@exiles
```

From your terminal:

```bash
claude plugin marketplace add ITMERowe/exiles
```

```bash
claude plugin install auto-route@exiles
```

Then run `/reload-plugins`.

Optional: run `/advisor opus` to give the main session an Opus advisor. The rules tell Claude to consult it on hard work, before it hands that work to an Opus subagent.

## Change the routing

The table, the per-prompt keywords and the skill list are in `hooks/register.ts`:

- `ROUTES`: the agent for each kind of work. The first row whose keyword test matches a prompt is the one its note names.
- `SKILLS`: the skill keywords.

The notes come from a keyword list, so some prompts will match the wrong row or none. Claude treats a note as a hint, and the table decides.

## Test it yourself

Use `/usage` and compare two fresh sessions on the same job:

1. Pick one real job with several steps, such as "find every place X is used across the repo and summarize it". A one-line question will not show a saving: the plugin only delegates work that needs over about 20k tokens of reading.
2. Run `/plugin disable auto-route@exiles`, then `/reload-plugins`. Start a new session and run the job. Note the cost and the per-model rows in `/usage`.
3. Run `/plugin enable auto-route@exiles`, `/reload-plugins`, start another new session, and run the same job.
4. Compare. A win shows as a Haiku or Sonnet row taking tokens that Opus took before, and a lower total cost.

Run each side two or three times: one run is noisy. For a scripted version, run `claude -p "<job>" --output-format json` and read `total_cost_usd` and `modelUsage` from the result.

## Credits

The routing tiers come from [savvy-flow](https://github.com/JohnnyVizz/claude-kit) by JohnnyVizz: `heavy` and `fable` follow its savvy-heavy and savvy-fable workers. If [Hideout](https://github.com/ITMERowe/exiles/tree/main/plugins/hideout) is installed, its agents panel shows these agents with their models. Neither plugin is needed.
