// Done-check before a build's final message, in one call: node done-check.mjs [project dir]
// Prints one line per miss and exits 1, or one ok line and exits 0. Checks: HANDOFF.md and a README exist,
// per-deployment settings (site URL, base path) in a framework config come from the environment, no placeholder images.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.astro', '.svelte-kit', '.vercel', 'coverage', 'bin', 'obj', 'target', 'vendor', '.venv', 'venv', '__pycache__'])
// HANDOFF and CHANGELOG name gaps in prose; lockfiles name packages, not assets.
const SKIP_FILES = /^(HANDOFF\.md|CHANGELOG\.md|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i
const TEXT = /\.(html?|astro|mdx?|[cm]?[jt]sx?|vue|svelte|css|scss|json|xaml|cs|py|ya?ml|toml)$/i
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i
const PLACEHOLDER = /\b(via\.placeholder\.com|placehold\.(co|it)|placekitten\.com|picsum\.photos|dummyimage\.com|fakeimg\.pl|loremflickr\.com)\b|[\w-]*placeholder[\w-]*\.(png|jpe?g|gif|webp|avif|svg)\b/i
const CONFIG = /^((astro|vite|next|nuxt|svelte|docusaurus|remix)\.config|gatsby-config)\.[cm]?[jt]s$/
// shortcut: one line per setting; a value on the next line is not seen. Upgrade to a parser if a config splits it.
const SETTING = /\b(site|siteUrl|base|basePath|assetPrefix|publicPath)\b["']?\s*:\s*["'`]/
const FROM_ENV = /\benv\b|\.env\b|getenv|loadEnv/i

function* walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) { if (!SKIP_DIRS.has(d.name)) yield* walk(join(dir, d.name)) }
    else if (d.isFile() && !SKIP_FILES.test(d.name)) yield join(dir, d.name)
  }
}

/** Every miss in a project folder, one line each; empty when done. */
export const check = root => {
  const misses = []
  const top = readdirSync(root)
  if (!top.some(n => /^handoff\.md$/i.test(n))) misses.push('HANDOFF.md missing: write what changed and what was not verified')
  if (!top.some(n => /^readme(\.|$)/i.test(n))) misses.push('README missing')
  for (const p of walk(root)) {
    const rel = relative(root, p).replaceAll('\\', '/')
    const name = rel.split('/').pop()
    if (IMAGE.test(name) && /placeholder/i.test(name)) { misses.push(`placeholder image file: ${rel}`); continue }
    if (!TEXT.test(name) || statSync(p).size > 1_000_000) continue
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const at = `${rel}:${i + 1}: ${line.trim().slice(0, 120)}`
      if (PLACEHOLDER.test(line)) misses.push(`placeholder image: ${at}`)
      if (CONFIG.test(name) && SETTING.test(line) && !FROM_ENV.test(line)) misses.push(`hard-coded deployment setting, read it from the environment: ${at}`)
    })
  }
  return misses
}

if (process.argv[1]?.endsWith('done-check.mjs')) {
  const misses = check(process.argv[2] || process.cwd())
  if (!misses.length) console.log('done-check: ok (HANDOFF.md, README, deployment settings, placeholder images)')
  else {
    for (const m of misses.slice(0, 20)) console.log(`done-check: FAIL ${m}`)
    if (misses.length > 20) console.log(`done-check: and ${misses.length - 20} more`)
    process.exitCode = 1
  }
}
