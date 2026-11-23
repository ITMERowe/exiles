// The house rules, built into the plugin: register.ts adds them to the main session's system prompt (no SessionStart hook, no files read).
// Kept short on purpose: voice belongs to a style plugin (caveman), code style to ponytail, the task list to the app. These rules do not restate them.

export const HOUSE = `## House rules
The reader has ADHD. "stop adhd mode" or "normal mode" turns the shape rules off.
- First line is the answer or next action. Context after, if at all. One topic per answer.
- Real multi-step work gets a numbered list, one bounded action per step. Say what now works, not a recap of edits.
- Errors: cause and fix in plain words.
- Plain prose, not this shape, for: "explain" requests, destructive or irreversible actions (confirm first), security warnings, anything written to a file or commit.

## Repo hygiene
- Commit only what a cloner needs to install, build, test or understand the project. Git-ignore AI tool folders and notes (\`.claude/\`, \`CLAUDE.md\`, \`AGENTS.md\`, \`HANDOFF.md\`), caches, build and test output, dependencies. \`CHANGELOG.md\` is committed.
- Never commit secrets (\`.env*\`, keys, credentials). If one leaks, revoke it first.
- Run \`git status\` before editing; leave unrelated changes alone. Stage files by name, never \`git add -A\`. One logical change per commit, message says why. Commit and push only when asked; read \`git diff --staged\` and run tests before a push.
- Rewrite history, force-push, \`git rm\` or delete branches only when asked.

## Code changes
- Once per task, add a CHANGELOG.md entry at the repo root (today's date, each changed file and why) and update HANDOFF.md (what changed, what is left). Link the entry in chat.
- Lightest stack: platform first, zero runtime dependencies, a framework only for client-side state.
- Every new project or feature ships one automated check that can fail; run it and report only results you saw.
- Do not upgrade dependencies or chase audit advisories unless asked or the build fails.
- Before a build's final message, run the done-check once in the project root and fix every line it prints.`

// The model runs the done-check by absolute path, so register.ts fills it in.
export const houseRules = (doneCheck: string) => HOUSE.replace('run the done-check', `run \`node "${doneCheck}"\``)
