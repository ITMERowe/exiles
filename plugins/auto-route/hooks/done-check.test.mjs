// node --test "plugins/auto-route/hooks/*.test.mjs"
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { check } from './done-check.mjs'

const project = files => {
  const dir = mkdtempSync(join(tmpdir(), 'done-check-'))
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), text)
  }
  return dir
}

test('a finished project passes the done-check', () => {
  const dir = project({
    'HANDOFF.md': 'Not verified: no placeholder.png left.',
    'README.md': '# Site',
    'astro.config.mjs': "export default { site: process.env.SITE_URL, base: import.meta.env.BASE_PATH ?? '/' }",
    'src/index.astro': '<img src="/me.png">',
    'node_modules/x/placeholder.png': '',
  })
  assert.deepEqual(check(dir), [])
  rmSync(dir, { recursive: true })
})

test('each miss is named with its file and line', () => {
  const dir = project({
    'astro.config.mjs': "export default {\n  site: 'https://me.github.io',\n  base: '/portfolio',\n}",
    'src/index.astro': '<img src="https://via.placeholder.com/300">',
    'public/img/card-placeholder.png': '',
  })
  assert.deepEqual(check(dir).sort(), [
    'HANDOFF.md missing: write what changed and what was not verified',
    'README missing',
    "hard-coded deployment setting, read it from the environment: astro.config.mjs:2: site: 'https://me.github.io',",
    "hard-coded deployment setting, read it from the environment: astro.config.mjs:3: base: '/portfolio',",
    'placeholder image file: public/img/card-placeholder.png',
    'placeholder image: src/index.astro:1: <img src="https://via.placeholder.com/300">',
  ])
  rmSync(dir, { recursive: true })
})

test('the script exits 1 with the decisive lines on a miss and 0 when done, in one call', () => {
  const script = join(import.meta.dirname, 'done-check.mjs')
  const bad = project({ 'README.md': '# x' })
  const r = spawnSync(process.execPath, [script, bad], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.equal(r.stdout.trim(), 'done-check: FAIL HANDOFF.md missing: write what changed and what was not verified')
  const good = project({ 'readme.md': '# x', 'handoff.md': 'ok' })
  const ok = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: good })
  assert.equal(ok.status, 0)
  assert.match(ok.stdout, /^done-check: ok/)
  rmSync(bad, { recursive: true })
  rmSync(good, { recursive: true })
})
