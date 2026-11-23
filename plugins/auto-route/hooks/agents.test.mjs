// node --test "plugins/auto-route/hooks/*.test.mjs"
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// A frontmatter that fails to parse loses every field but the name, silently (D1: explore ran on Sonnet).
// Agent frontmatter is flat `key: value` lines; a plain YAML value may not hold ": " or " #" nor start with an indicator.
const problems = text => {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text)?.[1]
  if (fm === undefined) return ['no frontmatter']
  const out = []
  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue
    const m = /^([\w-]+):(?: (.*))?$/.exec(line)
    if (!m) { out.push(`not a key: value line: ${line}`); continue }
    const v = (m[2] ?? '').trim()
    if (/^["']/.test(v)) { if (!/^("([^"\\]|\\.)*"|'([^']|'')*')$/.test(v)) out.push(`${m[1]}: unclosed quote`); continue }
    if (/^[[{&*!|>%@`]|^[-?,](\s|$)/.test(v)) out.push(`${m[1]}: starts with a YAML indicator`)
    if (/:(\s|$)/.test(v) || /\s#/.test(v)) out.push(`${m[1]}: unquoted ": " or " #" in the value (quote it or reword)`)
  }
  if (!/^name: \S/m.test(fm) || !/^description: \S/m.test(fm)) out.push('name or description missing')
  return out
}

const root = join(import.meta.dirname, '..')
const files = [
  ...readdirSync(join(root, 'agents')).filter(f => f.endsWith('.md')).map(f => join(root, 'agents', f)),
  join(root, 'seed', 'agents', 'Explore.md'),
]
const ending = (text, eol) => text.replace(/\r?\n/g, eol)

test('every agent file frontmatter parses with LF and with CRLF line endings', () => {
  assert.equal(files.length, 9)
  for (const f of files)
    for (const eol of ['\n', '\r\n']) assert.deepEqual(problems(ending(readFileSync(f, 'utf8'), eol)), [], `${f} (${eol === '\n' ? 'LF' : 'CRLF'})`)
})

test('the lint catches the colon that dropped the explore model, under both endings', () => {
  const bad = '---\nname: explore\ndescription: Locates code. Say how broad: "medium" or "very thorough".\nmodel: haiku\n---\nbody\n'
  for (const eol of ['\n', '\r\n']) assert.deepEqual(problems(ending(bad, eol)), ['description: unquoted ": " or " #" in the value (quote it or reword)'])
  assert.deepEqual(problems('---\nname: x\ndescription: "quoted: fine"\n---\n'), [])
  assert.deepEqual(problems('---\nname: x\ndescription: "open\n---\n'), ['description: unclosed quote'])
})
