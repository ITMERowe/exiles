import { expect, test } from 'claude-code/testing'
import { gitRisk, isQuestion, isReadOnly, isSurvey, readsRepo, modelFor, routeFor, routeNote, RULES, RULES_LITE, skillsFor, splitCommand } from './register.ts'

test('reading a guide or link routes to the reader; changing code does not', () => {
  expect(isReadOnly('read this guide https://example.com/post and tell me the gist')).toBe(true)
  expect(isReadOnly('summarize the blog post')).toBe(true)
  expect(isReadOnly('read the docs then fix the bug')).toBe(false)
  expect(isReadOnly('fix the login page')).toBe(false)
})

test('every routing row is picked by its kind of ask', () => {
  const pick = (t: string) => routeFor(t)?.agent.replace('auto-route:', '')
  expect(pick('use fable on this bug')).toBe('fable')
  expect(pick('audit the login flow for security holes')).toBe('reviewer')
  expect(pick('add a login page')).toBeUndefined()
  expect(pick('analyze github.com/x repos for security issues')).toBe('explore')
  expect(pick('find the root cause of the crash')).toBe('heavy')
  expect(pick('summarize this post https://example.com')).toBe('reader')
  expect(pick('where is the band drawn?')).toBe('searcher')
  expect(pick('map the repo for me')).toBe('explore')
  expect(pick('rename crab to sprite')).toBeUndefined()
  expect(pick('hello there')).toBeUndefined()
  expect(pick('run the tests and the build')).toBe('verifier')
  expect(pick('how many files import the router?')).toBe('searcher')
  expect(pick('compare these repos for me')).toBe('explore')
  expect(pick('review the oauth login code')).toBe('reviewer')
  expect(pick('there is a memory leak in the poller')).toBe('heavy')
})

test('the full table rides with the first routed note only; the system prompt holds the short rule', () => {
  const hinted = new Set<string>()
  expect(routeNote('rename these 40 files', hinted)).toContain('| Work | Agent | Model |')
  expect(routeNote('rename these 40 files', hinted) ?? '').not.toContain('| Work | Agent | Model |')
  expect(routeNote('hello there', new Set())).toBeUndefined()
  expect(RULES_LITE.length).toBeLessThan(RULES.length / 2)
})

test('the rules hold the whole table', () => {
  for (const a of ['fable', 'reviewer', 'heavy', 'reader', 'searcher', 'explore', 'verifier', 'editor'].map(a => 'auto-route:' + a).concat('main session')) expect(RULES).toContain(a)
})

test('skills are picked from the ask, at most three', () => {
  expect(skillsFor('the band still shows, its broken')).toEqual(['superpowers:systematic-debugging'])
  expect(skillsFor('make a chart of my usage')).toEqual(['dataviz'])
  expect(routeNote('hello')).toBeUndefined()
})

test('the note rides along as context', async ($, on) => {
  const seen: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => { seen.push(e.context); return { text: e.text, context: e.context } })
  await $.prompt.submit({ text: 'summarize this post https://example.com', wait: false } as never)
  expect(seen[0]?.join('\n')).toContain('`auto-route:reader` subagent')
})

test('the routing table reaches only a prompt that can delegate', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  const base = { model: 'claude-sonnet-5-5', promptModel: 'claude-sonnet-5-5', surfaces: [], outputStyle: null, traits: [] }
  const main = await $.prompt.compose({ ...base, tools: ['Agent', 'Read'] } as never)
  expect(main.sections.map(s => s.id)).toEqual(['intro', 'auto-route:routing'])
  const sub = await $.prompt.compose({ ...base, tools: ['Read'] } as never)
  expect(sub.sections.map(s => s.id)).toEqual(['intro'])
})

test('a question gets no agent note, and only a plain one may change model', () => {
  expect(routeNote('does this project tell claude what model to use when i rename a lot of files?') ?? '').not.toContain('row')
  expect(isQuestion('what model do you use?')).toBe(true)
  expect(isQuestion('rename these files')).toBe(false)
  expect(isQuestion('why does src/app.ts crash?')).toBe(false)
  const limits = { haiku: 100000, sonnet: 50000 }
  const opus = 'claude-opus-5-5'
  expect(modelFor('chat', 30000, limits, opus)).toBe('claude-haiku-5-5')
  expect(modelFor('chat', 150000, limits, opus)).toBeUndefined()
  expect(modelFor('tech-question', 30000, limits, opus)).toBe('claude-sonnet-5-5')
  expect(modelFor('tech-question', 80000, limits, opus)).toBeUndefined()
  expect(modelFor('chat', 0, limits, opus)).toBeUndefined()
  expect(modelFor('task', 1000, limits, opus)).toBeUndefined()
  // Never to the same or a dearer family, and not while the session model is unknown.
  expect(modelFor('tech-question', 30000, limits, 'claude-sonnet-5-5')).toBeUndefined()
  expect(modelFor('tech-question', 30000, limits, 'claude-haiku-5-5')).toBeUndefined()
  expect(modelFor('chat', 30000, limits)).toBeUndefined()
})

test('a technical question runs its turn on Sonnet once the context size is known', async ($, on) => {
  const models: string[] = []
  on('model.classify', () => ({ value: 'tech-question' }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.step', async function* (_, e) {
    models.push(e.model)
    return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: e.model, input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20000, cache_creation_input_tokens: 0 } } as never
  })
  const step = async (turnId: string) => {
    for await (const _ of ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId, index: 0, model: 'claude-opus-5-5', messageCount: 1 })) void _
  }
  // The first question comes before any request reported a size: it stays put.
  await $.turn.start({ text: 'what model do you use?', turnId: 't1' } as never)
  await step('t1')
  await $.turn.start({ text: 'what model do you use?', turnId: 't2' } as never)
  await step('t2')
  await $.turn.start({ text: 'rename these files', turnId: 't3' } as never)
  await step('t3')
  expect(models).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
})

test('the README examples route where it says', () => {
  const note = (t: string) => routeNote(t) ?? ''
  expect(note('where is the login handler?')).toContain('auto-route:searcher')
  expect(note('summarize this post')).toContain('auto-route:reader')
  expect(note('review the payment migration')).toContain('auto-route:reviewer')
  expect(note('find the root cause of the flaky build')).toContain('auto-route:heavy')
  expect(note('rework the readme so it is easier to read')).not.toContain('auto-route:reader')
})

test('a build task that starts by inspecting GitHub repos fans recon out to explore', () => {
  const t = 'Analyze my public GitHub profile and repositories: https://github.com/ITMERowe. Build a portfolio website.'
  expect(routeFor(t)?.agent).toBe('auto-route:explore')
  expect(routeNote(t)).toContain('claim you publish carries a file:line or a command count')
  expect(routeNote(t)).not.toContain('systematic-debugging')
  expect(routeNote(t)).toContain('For this survey, delegate the reading')
  expect(RULES).toContain('a survey of two or more repos, which always goes to subagents')
  expect(routeFor('rename these repositories')?.agent).toBe('auto-route:editor')
  // A targeted question about one codebase is not a survey: no recon checklist, the plain size rule instead.
  const q = routeNote('map the repo and trace the flow of a request through the router') ?? ''
  expect(q).toContain('auto-route:explore')
  expect(q).not.toContain('Per repo, gather')
  expect(q).toContain('over ~20k tokens')
})

test('a cheap-row agent spawned with no model gets the table model; a named model or a fork is left alone', async ($, on) => {
  const seen: (string | undefined)[] = []
  on('agent.spawn', (_, e) => { seen.push(e.model); return { model: e.model ?? 'parent', agentId: 'a1' } as never })
  const spawn = (subagentType: string, extra: object = {}) =>
    $.agent.spawn({ tool_use_id: 't', prompt: 'p', description: 'd', subagentType, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: true, fork: false, ...extra } as never)
  await spawn('auto-route:explore')
  await spawn('auto-route:verifier')
  await spawn('auto-route:editor')
  await spawn('auto-route:heavy')
  await spawn('auto-route:explore', { model: 'sonnet' })
  await spawn('auto-route:explore', { fork: true })
  expect(seen).toEqual(['haiku', 'haiku', 'sonnet', undefined, 'sonnet', undefined])
})

test('a multi-repo survey refuses the main session its own clone until explore agents are spawned', async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  expect(isSurvey('Analyze my public GitHub profile and repositories: https://github.com/ITMERowe. Build a site.')).toBe(true)
  expect(isSurvey('Inspect the repo https://github.com/ITMERowe/CNTR and fix the typo')).toBe(false)
  expect(isSurvey('where is the login handler?')).toBe(false)
  expect(readsRepo('cd /tmp && git clone https://github.com/x/y')).toBe(true)
  expect(readsRepo('curl -s https://raw.githubusercontent.com/x/y/main/README.md')).toBe(true)
  expect(readsRepo('npm install')).toBe(false)
  expect(readsRepo('gh api repos/ITMERowe/CNTR/contents/package.json')).toBe(true)
  expect(isSurvey('how many repos does github.com/ITMERowe have?')).toBe(false)
  await $.prompt.submit({ text: 'Analyze my public GitHub profile and repositories: https://github.com/ITMERowe. Build a site.', wait: false } as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'git clone https://github.com/ITMERowe/CNTR' } as never)
  expect((r as { deny?: string }).deny).toContain('auto-route:explore')
})

test('the survey gate lifts when an explore agent is spawned, gives way after 2 refusals, and spares a single repo', async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'parent', agentId: 'a1' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as never)
  const bash = (command: string, extra: object = {}) => $.tool.call({ tool: 'Bash', command, ...extra } as never) as Promise<{ deny?: string }>
  const survey = 'Analyze my public GitHub profile and repositories: https://github.com/ITMERowe. Build a site.'
  await $.prompt.submit({ text: survey, wait: false } as never)
  expect((await bash('git clone https://github.com/a/b')).deny).toBeDefined()
  // a subagent's own clone is never refused
  expect((await bash('git clone https://github.com/a/b', { agentId: 'sub1' })).deny).toBeUndefined()
  expect((await bash('git clone https://github.com/a/c')).deny).toBeDefined()
  // the third refusal would be a trap: it gives way
  expect((await bash('git clone https://github.com/a/d')).deny).toBeUndefined()
  // a new survey re-arms it, spawning an explore agent lifts it
  await $.prompt.submit({ text: survey, wait: false } as never)
  expect((await bash('git clone https://github.com/a/b')).deny).toBeDefined()
  await $.agent.spawn({ tool_use_id: 't', prompt: 'p', description: 'd', subagentType: 'auto-route:explore', provider: 'engine', parentModel: 'claude-sonnet-5-5', background: true, fork: false } as never)
  expect((await bash('git clone https://github.com/a/b')).deny).toBeUndefined()
  // one named repo is not a survey
  await $.prompt.submit({ text: 'Inspect https://github.com/ITMERowe/CNTR and tell me its stack', wait: false } as never)
  expect((await bash('git clone https://github.com/ITMERowe/CNTR')).deny).toBeUndefined()
})

test('the gate splits a command only at unquoted separators, and words in a text-only command run nothing', () => {
  expect(splitCommand('echo "a;b|c"')).toEqual(['echo "a;b|c"'])
  expect(splitCommand("echo 'a && b'")).toEqual(["echo 'a && b'"])
  expect(splitCommand('a; b | c')).toEqual(['a', 'b', 'c'])
  expect(splitCommand('a && b || c & d')).toEqual(['a', 'b', 'c', 'd'])
  expect(splitCommand('git clone x 2>&1 | tail -3')).toEqual(['git clone x 2>&1', 'tail -3'])
  expect(splitCommand('echo a\\;b; c')).toEqual(['echo a\\;b', 'c'])
  expect(splitCommand('echo "say \\"x;y\\""; c')).toEqual(['echo "say \\"x;y\\""', 'c'])
  expect(readsRepo('grep -c "x; git clone https://github.com/a/b" log.txt')).toBe(false)
  expect(readsRepo('echo "git clone https://github.com/a/b"')).toBe(false)
  expect(readsRepo('echo start && git clone https://github.com/a/b')).toBe(true)
  expect(readsRepo('cat notes | git clone https://github.com/a/b')).toBe(true)
})

test('a survey refuses the main session git clone and gh api contents until an explore agent exists, then allows both', async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'parent', agentId: 'a1' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as never)
  const bash = (command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>
  await $.prompt.submit({ text: 'Analyze my public GitHub profile and repositories: https://github.com/ITMERowe. Build a site.', wait: false } as never)
  expect((await bash('git clone https://github.com/x/y')).deny).toContain('auto-route:explore')
  expect((await bash('gh api repos/x/y/contents')).deny).toContain('auto-route:explore')
  await $.agent.spawn({ tool_use_id: 't', prompt: 'p', description: 'd', subagentType: 'auto-route:explore', provider: 'engine', parentModel: 'claude-sonnet-5-5', background: true, fork: false } as never)
  expect((await bash('git clone https://github.com/x/y')).deny).toBeUndefined()
  expect((await bash('gh api repos/x/y/contents')).deny).toBeUndefined()
})

test('the rules split delegation by read size, keep builds in this session and budget helper calls', () => {
  expect(RULES_LITE).toContain('Delegate by read size')
  expect(RULES_LITE).toContain('a build and dependent steps stay here with no helpers')
  expect(RULES_LITE).toContain('call budget')
  expect(RULES).toContain('spawn no helper for them')
  expect(RULES).toContain('a call budget (about 10 calls')
})

test('judging code gets ponytail; plain code work gets no hint, and a skill is hinted once', () => {
  expect(skillsFor('implement a retry helper')).toEqual([])
  const hinted = new Set<string>()
  expect(routeNote('review my PR', hinted)).toContain('ponytail:ponytail-review')
  expect(routeNote('review my PR', hinted)).toBeUndefined()
  expect(skillsFor('review my PR')[0]).toBe('ponytail:ponytail-review')
  expect(skillsFor('audit the whole repo')[0]).toBe('ponytail:ponytail-audit')
  expect(skillsFor('list the shortcuts we took')).toContain('ponytail:ponytail-debt')
  expect(skillsFor('what is the weather like')).toEqual([])
})

test('a polite order is not a question; a plain question still is', () => {
  expect(isQuestion('Can you add tests for the parser?')).toBe(false)
  expect(isQuestion('could you find the root cause of the flaky test?')).toBe(false)
  expect(isQuestion('can this run offline?')).toBe(true)
  expect(routeFor('Can you find the root cause of the crash?')?.agent).toBe('auto-route:heavy')
})

test('the survey gate also refuses a PowerShell clone', async ($, on) => {
  expect(readsRepo('git clone https://github.com/a/b; Write-Output done')).toBe(true)
})

test('git moves the house rules forbid are caught; clean ones and quoted text are not', () => {
  expect(gitRisk('git add .env')?.absolute).toBe(true)
  expect(gitRisk('git add -A')?.absolute).toBe(false)
  expect(gitRisk('git add src/a.ts && git push --force')?.why).toContain('force-push')
  expect(gitRisk('git push --force-with-lease')).toBeUndefined()
  expect(gitRisk('git add src/a.ts')).toBeUndefined()
  expect(gitRisk('git commit --amend')).toBeDefined()
  expect(gitRisk('echo "git add -A"')).toBeUndefined()
  expect(gitRisk('git commit -m x

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>')?.absolute).toBe(true)
  expect(gitRisk('gh pr create --body "🤖 Generated with [Claude Code](https://claude.com/claude-code)"')?.absolute).toBe(true)
  expect(gitRisk('git commit -m "fix band"')).toBeUndefined()
})
