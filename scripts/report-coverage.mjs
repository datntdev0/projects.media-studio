// Renders the Jest run as a GitHub step summary. Usage: node scripts/report-coverage.mjs [jest.log]
import { existsSync, readFileSync } from 'node:fs'

const COVERAGE = 'backend/coverage/coverage-summary.json'
const RESULTS = 'backend/coverage/test-results.json'
const METRICS = ['statements', 'branches', 'functions', 'lines']
const ANSI = new RegExp('\\u001b\\[[0-9;]*m', 'g')

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null)
const strip = (text) => text.replace(ANSI, '')
const badge = (pct) => (pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴')
const bar = (pct) => '█'.repeat(Math.round(pct / 10)).padEnd(10, '░')
const title = (name) => name[0].toUpperCase() + name.slice(1)
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`
const shortPath = (path) => path.replace(/\\/g, '/').replace(/^.*?\/backend\/src\//, '')

const out = []
const results = read(RESULTS)
const coverage = read(COVERAGE)

if (results) {
  const { numPassedTests: passed, numFailedTests: failed, numPendingTests: pending } = results
  const took = Math.max(...results.testResults.map((suite) => suite.endTime)) - results.startTime
  const counts = [`✅ ${passed} passed`]
  if (failed) counts.push(`❌ ${failed} failed`)
  if (pending) counts.push(`⏭️ ${pending} skipped`)

  out.push(`## ${results.success ? '✅' : '❌'} Unit tests`, '')
  out.push('| Result | Tests | Suites | Duration |', '| :-- | --: | --: | --: |')
  out.push(`| ${counts.join(' · ')} | ${results.numTotalTests} | ${results.numTotalTestSuites} | ${seconds(took)} |`, '')
}

if (coverage) {
  out.push('## 📊 Coverage', '')
  out.push('| | Metric | Covered | Total | Coverage |', '| :-: | :-- | --: | --: | :-- |')
  for (const metric of METRICS) {
    const { covered, total, pct } = coverage.total[metric]
    out.push(`| ${badge(pct)} | ${title(metric)} | ${covered} | ${total} | \`${bar(pct)}\` ${pct.toFixed(2)}% |`)
  }
  out.push('')

  const files = Object.entries(coverage)
    .filter(([path]) => path !== 'total')
    .map(([path, summary]) => ({ path: shortPath(path), pct: summary.statements.pct, lines: summary.lines }))
    .sort((a, b) => a.pct - b.pct)

  out.push('<details><summary>Coverage per file, least covered first</summary>', '')
  out.push('| | File | Statements | Lines |', '| :-: | :-- | --: | --: |')
  for (const file of files) {
    out.push(`| ${badge(file.pct)} | \`${file.path}\` | ${file.pct.toFixed(2)}% | ${file.lines.covered}/${file.lines.total} |`)
  }
  out.push('', '</details>', '')
}

// The failures, spelled out, so a red run reads without unfolding the log.
const failures = (results?.testResults ?? []).flatMap((suite) =>
  suite.assertionResults.filter((test) => test.status === 'failed').map((test) => ({ suite: shortPath(suite.name), test }))
)

if (failures.length) {
  out.push('## ❌ Failing tests', '')
  for (const { suite, test } of failures) {
    out.push(`<details><summary><code>${suite}</code> › ${test.fullName}</summary>`, '', '```')
    out.push(strip(test.failureMessages.join('\n')), '```', '', '</details>', '')
  }
}

const log = process.argv[2]
if (log && existsSync(log)) {
  out.push('<details><summary>Jest output</summary>', '', '```', strip(readFileSync(log, 'utf8').trim()), '```', '', '</details>', '')
}

if (!results && !coverage) out.push('_No Jest results were written._')

console.log(out.join('\n'))
