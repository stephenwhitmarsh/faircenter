// Synthetic POC dataset for faircenter, built at the job level with a scheduler.
//
// Jobs are generated as demand (submit time, GPU count, duration, lane), then a
// simple event-driven scheduler runs them against a fixed cluster capacity: a
// job starts only when enough GPUs are free, otherwise it waits in a priority
// queue. Demand is set to run the cluster near capacity, so jobs queue and the
// load bumps the capacity line, which is what gives the allocation policies
// something to do. Reservations hold GPUs for a window and are honoured by the
// scheduler and shown in the load. Everything is derived from the jobs, the way
// it would be from SLURM's accounting database.

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

const START = Date.UTC(2025, 4, 1)          // 2025-05-01
const NOW = Date.UTC(2026, 8, 12, 14, 0)    // 2026-09-12 14:00
const END = Date.UTC(2026, 11, 31)          // 2026-12-31

export const period = { name: 'May 2025 – Dec 2026', startMs: START, nowMs: NOW, endMs: END }
export const cluster = { gpus: 1024 }

// Capacity evolves — pods come online, expansions are planned ahead. Operations
// maintains this schedule in the app; the backend would reconcile it against the
// real cluster inventory. Each adjustment sets the total GPU count from `at` on.
export const capacity = {
  base: 896,
  adjustments: [
    { at: Date.UTC(2025, 8, 1), gpus: 1024, note: 'H100 pod #2 online' },
    { at: Date.UTC(2026, 9, 1), gpus: 1280, note: 'planned — Q4 expansion' },
    { at: Date.UTC(2026, 11, 1), gpus: 1536, note: 'planned — winter buildout' },
  ],
}

// Roll-out phase. Operations advances this one notch at a time; it names where the
// organisation sits on the arc from measuring to delegating (see the README).
// Each phase turns on a set of mechanisms (the Policy switches) and enforces budgets at
// a level. Selecting a phase applies this preset; operations can still override a switch.
// personPct is the share of governed capacity (the GPU-hours the cluster offers) set aside for the
// person pool: discretionary, individual work that draws best-effort and needs no
// reservation or approval. It starts large and is progressively dissolved into the
// team and project pools as the rollout advances. Operations can override it per phase.
export const GOV_PHASES = [
  { n: 1, key: 'observe', name: 'Observe', short: 'transparency only', enforce: 'none', personPct: 0.60, on: { lanes: false, timeOfUse: false, headroom: false, oversubscription: false, teamStanding: false, enfPerson: false, enfProject: false, enfTeam: false }, desc: 'No budgets. The app shows use, queues and waits; nothing is enforced.' },
  { n: 2, key: 'person', name: 'Person budgets', short: 'bounded per person', enforce: 'person', personPct: 0.45, on: { lanes: false, timeOfUse: true, headroom: true, oversubscription: true, teamStanding: false, enfPerson: true, enfProject: false, enfTeam: false }, desc: 'Each person gets a budget out of the person pool, sized so the allowances add up to it. The first real limit. Time-of-use weighting starts here.' },
  { n: 3, key: 'project', name: 'Project budgets', short: 'a budget per project, run by project leads', enforce: 'project', personPct: 0.22, on: { lanes: true, timeOfUse: true, headroom: true, oversubscription: true, teamStanding: false, enfPerson: true, enfProject: true, enfTeam: false }, desc: 'Projects get their own budgets on top of the person budgets, each run by its lead — requests, reservations and priority — as the person pool shrinks.' },
  { n: 4, key: 'team', name: 'Team budgets', short: 'a pool per team, run by team leads', enforce: 'team', personPct: 0.08, on: { lanes: true, timeOfUse: true, headroom: true, oversubscription: true, teamStanding: false, enfPerson: true, enfProject: true, enfTeam: true }, desc: 'The team gets a pool, handed to the team lead, who divides it across its projects and settles contention within the team.' },
  { n: 5, key: 'standing', name: 'Cross-team standing', short: 'standing arbitrates between teams', enforce: 'team', personPct: 0.08, on: { lanes: true, timeOfUse: true, headroom: true, oversubscription: true, teamStanding: true, enfPerson: true, enfProject: true, enfTeam: true }, desc: 'Standing between teams arbitrates across pools when the cluster is contended, biasing each team\'s share of GPU-time by its standing. Introduced after team budgets, not with them.' },
]
export const governance = { phase: 3 }
// a suggested per-person allowance for the Person-budgets phase: the person pool
// (a share of governed capacity, see parameters.pools) shared across the people who run jobs.
export function suggestedPersonBudget() {
  const n = people.filter((p) => (p.projectIds || []).length).length || 1
  return Math.round(personPoolHours() / n)
}

// Total GPUs in service at a given instant, from the capacity schedule.
export function effectiveGpus(atMs, sched = capacity) {
  let g = sched.base
  const adj = [...(sched.adjustments || [])].sort((a, b) => a.at - b.at)
  for (const a of adj) { if (a.at <= atMs) g = a.gpus }
  return g
}

export function fmtDate(ms) { return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) }
export function fmtDay(ms) { return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }
export function fmtDateTime(ms) {
  const d = new Date(ms)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
export function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10) }

function makeRng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff } }
const rng = makeRng(20260912)
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const chance = (p) => rng() < p
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function wpickR(items, r) { const total = items.reduce((s, i) => s + i[1], 0); let x = r() * total; for (const [v, w] of items) { x -= w; if (x <= 0) return v } return items[items.length - 1][0] }
function b2(r, a, b) { return a + r() * (b - a) }

// --- teams: flagship model-lines (biggest, longest) plus obvious support teams ---
const FLAGSHIP = ['Voxtral', 'Pixtral', 'Codestral', 'Devstral', 'Mathstral', 'Robustral', 'Shieldstral']
const SUPPORT = ['Pretraining', 'Fine-tuning', 'Evaluation', 'Alignment', 'Data curation', 'Serving',
  'Efficiency', 'Retrieval', 'Long-context', 'Red-team', 'Tokeniser', 'Research infra', 'Agents']
export const teams = [
  ...FLAGSHIP.map((name, i) => ({ id: 't' + i, name, flagship: true, budget: 0, phaseOverride: null })),
  ...SUPPORT.map((name, i) => ({ id: 't' + (FLAGSHIP.length + i), name, flagship: false, budget: 0, phaseOverride: null })),
]
const TEAM_HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#8b5cf6', '#e8368f', '#0ea5b7', '#eda100', '#6366f1',
  '#14b8a6', '#f43f5e', '#84cc16', '#06b6d4', '#a855f7', '#f97316', '#22c55e', '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#7c3aed']
export const teamHue = Object.fromEntries(teams.map((t, i) => [t.id, TEAM_HUES[i % TEAM_HUES.length]]))

// --- people ---
const FIRST = ['Ada', 'Alan', 'Grace', 'Ravi', 'Lena', 'Omar', 'Mei', 'Jonas', 'Sara', 'Nadia', 'Priya', 'Leo', 'Yuki', 'Ines', 'Tariq', 'Nina', 'Diego', 'Aisha', 'Karl', 'Sofia', 'Hassan', 'Marta', 'Ivan', 'Zara', 'Paulo', 'Emma', 'Noah', 'Lucia', 'Kofi', 'Wei', 'Anya', 'Ben', 'Chloe', 'Dmitri', 'Elena', 'Farid', 'Gita', 'Hugo', 'Iris', 'Jamal', 'Kira', 'Liam', 'Maya', 'Nils', 'Ola', 'Pia']
const LAST = ['Lovelace', 'Turing', 'Hopper', 'Patel', 'Hart', 'Diallo', 'Chen', 'Weber', 'Nkosi', 'Rahman', 'Nair', 'Rossi', 'Sato', 'Costa', 'Haddad', 'Kim', 'Silva', 'Bello', 'Berg', 'Moreau', 'Yilmaz', 'Novak', 'Petrov', 'Khan', 'Mendes', 'Olsen', 'Fischer', 'Ivanova', 'Mensah', 'Zhang', 'Park', 'Ali', 'Dubois', 'Green', 'Haas', 'Ibrahim', 'Jensen', 'Kaur', 'Lund', 'Marsh', 'Osei', 'Reyes']
const N_PEOPLE = 300
export const people = []
{
  const used = new Set()
  for (let i = 0; i < N_PEOPLE; i++) {
    let name
    do { name = pick(FIRST) + ' ' + pick(LAST) } while (used.has(name) && used.size < FIRST.length * LAST.length)
    used.add(name)
    const home = Math.floor(rng() * teams.length)
    const teamIds = [teams[home].id]
    if (chance(0.18)) { const t2 = pick(teams).id; if (t2 !== teamIds[0]) teamIds.push(t2) }
    people.push({ id: 'p' + i, name, teamIds, projectIds: [], budget: 0 })
  }
}
teams.forEach((t) => { const m = people.find((p) => p.teamIds[0] === t.id); if (m) m.role = 'lead' })
// operations sit outside the teams
for (let i = 0; i < 3; i++) { const p = people[N_PEOPLE - 1 - i]; p.role = 'ops'; p.teamIds = [] }
people.push({ id: 'p-stephen', name: 'Stephen Whitmarsh', teamIds: [], projectIds: [], budget: 0, role: 'ops' })

// --- projects: flagship teams run bigger, longer projects across the window ---
// Early rollout: most work is still individual, so the person pool is the majority of use.
// As the rollout advances this share is meant to fall (see the person-pool target in Policy).
// two pools only: every funded project belongs to a team; the rest is individual (person) work
const FUND = [['team', 0.45], ['person', 0.55]]
const TIER = [['high', 0.28], ['medium', 0.44], ['low', 0.28]]
const WORDS = ['v2', 'v3', 'v4', 'base', 'large', 'mini', 'small', 'next', 'alpha', 'beta', 'phase 1', 'phase 2', 'sprint', 'sweep', 'pilot', 'scale', 'pro', 'turbo']
export const projects = []
let pid = 0
teams.forEach((t) => {
  const tr = makeRng(hashStr(t.id))
  // several projects per team with overlapping, randomly placed windows, so many
  // run concurrently and the cluster is kept busy
  const nProjects = t.flagship ? 6 + Math.floor(tr() * 4) : 4 + Math.floor(tr() * 4)
  for (let k = 0; k < nProjects; k++) {
    const durDays = t.flagship ? Math.round(b2(tr, 140, 420)) : Math.round(b2(tr, 45, 200))
    const startMs = START + Math.floor(tr() * (END - START - 20 * DAY))
    const endMs = Math.min(END, startMs + durDays * DAY)
    const funding = k === 0 ? 'team' : wpickR(FUND, tr)
    const avgGpus = t.flagship
      ? wpickR([[64, 3], [96, 4], [128, 3], [192, 2], [256, 1]], tr)
      : wpickR([[16, 4], [24, 5], [32, 3], [48, 3], [64, 1.5], [96, 0.6]], tr)
    projects.push({
      id: 'prj' + pid, name: `${t.name} ${WORDS[Math.floor(tr() * WORDS.length)]}`, funding,
      teamId: funding === 'person' ? undefined : t.id, personId: undefined,
      budget: 0, used: 0, priority: wpickR(TIER, tr), start: isoDate(startMs), end: isoDate(endMs), startMs, endMs, avgGpus,
    })
    pid++
  }
})
// cross-cutting/infra work is absorbed into a team too (kept simple for the POC — no org pool)
for (let k = 0; k < 4; k++) {
  const t = teams[Math.floor(rng() * teams.length)]
  const startMs = START + Math.floor(rng() * 300 * DAY)
  const endMs = Math.min(END, startMs + Math.round(b2(rng, 60, 220)) * DAY)
  projects.push({ id: 'prj' + pid, name: `${t.name} ${pick(['infra', 'platform', 'tooling'])}`, funding: 'team', teamId: t.id, personId: undefined, budget: 0, used: 0, priority: wpickR(TIER, rng), start: isoDate(startMs), end: isoDate(endMs), startMs, endMs, avgGpus: wpickR([[16, 3], [32, 3], [64, 2]], rng) })
  pid++
}
// personal work is a single bucket per person, not many projects: assign each personal-pool row
// to a distinct owner (without replacement), so no person holds more than one.
{
  const avail = [...people]
  for (const p of projects) {
    if (p.funding !== 'person') continue
    const o = avail.length ? avail.splice(Math.floor(rng() * avail.length), 1)[0] : pick(people)
    p.personId = o.id; p.name = o.name.split(' ')[0] + ' (personal)'; p.teamId = undefined; o.projectIds.push(p.id)
  }
}
projects.forEach((p) => {
  if (p.funding === 'person') return
  const pool = p.teamId ? people.filter((pp) => pp.teamIds.includes(p.teamId)) : people
  const n = 2 + Math.floor(rng() * 6)
  for (let i = 0; i < n; i++) { const person = pool.length ? pool[Math.floor(rng() * pool.length)] : pick(people); if (!person.projectIds.includes(p.id)) person.projectIds.push(p.id) }
})
// each real (team) project has a lead: the member responsible for planning and booking
// it. Prefer a member who is not the team lead, so the two roles are held by different
// people. Personal work has no lead (it is one person's own work, no team).
projects.forEach((p) => {
  if (p.funding === 'person') { p.leadPersonId = null; return }
  const members = people.filter((pp) => pp.projectIds.includes(p.id))
  const pref = members.filter((pp) => pp.role !== 'lead' && pp.role !== 'ops')
  p.leadPersonId = (pref[0] || members[0] || null)?.id ?? null
})
function projPerson(p, r) { const pool = people.filter((pp) => pp.projectIds.includes(p.id)); return pool.length ? pool[Math.floor(r() * pool.length)].id : (p.personId || people[0].id) }

// --- demand: generate job requests (not yet scheduled) ---
const GPU_SIZES = [[1, 3], [2, 3], [4, 4], [8, 5], [16, 4], [32, 2.5], [64, 1.2], [128, 0.5]]
const LANE_W = [['bulk', 3], ['standard', 5], ['fast', 2]]
const LANE_PRIO = { bulk: -50, standard: 0, fast: 100 }
const TIER_RANK = { high: 3, medium: 2, low: 1 }
function diurnal(ms) { const d = new Date(ms); const h = d.getUTCHours(), dow = d.getUTCDay(); const work = 0.5 + 0.5 * Math.max(0, Math.sin(((h - 6) / 24) * Math.PI * 2) * 0.5 + 0.5); return work * ((dow === 0 || dow === 6) ? 0.6 : 1) }
const INTENSITY = 0.95 // aggregate demand runs the cluster near capacity so jobs queue
const requests = []
let jid = 0
projects.forEach((p) => {
  if (p.startMs >= NOW) { p.budget = Math.round(p.avgGpus * (p.endMs - p.startMs) / HOUR); p.used = 0; return }
  const jr = makeRng(hashStr(p.id + ':jobs'))
  const activeEnd = Math.min(p.endMs, NOW)
  const span = activeEnd - p.startMs
  if (span <= 0) { p.budget = Math.round(p.avgGpus * (p.endMs - p.startMs) / HOUR); p.used = 0; return }
  const windowDays = (p.endMs - p.startMs) / DAY
  const count = Math.min(600, Math.round(windowDays * INTENSITY * (0.4 + p.avgGpus / 48)))
  for (let k = 0; k < count; k++) {
    let submit, tries = 0
    do { submit = p.startMs + jr() * span; tries++ } while (jr() > diurnal(submit) && tries < 6)
    const gpus = wpickR(GPU_SIZES, jr)
    const durMs = Math.exp(b2(jr, Math.log(0.5), Math.log(60))) * HOUR
    const lane = wpickR(LANE_W, jr)
    requests.push({ id: 'j' + (jid++), projectId: p.id, personId: projPerson(p, jr), gpus, durMs, submit, lane, prio: LANE_PRIO[lane] + TIER_RANK[p.priority] * 30 })
  }
})

// --- reservations across the whole timeline, varied size and length ---
export const reservations = []
{
  // person projects never hold reservations: personal work is best-effort within the person pool
  const started = projects.filter((p) => p.startMs < END && p.funding !== 'person')
  const RES_LABEL = ['Full-cluster run', 'Release eval', 'Audit sweep', 'Benchmark', 'Ablation', 'Scaling run', 'Safety eval']
  for (let i = 0; i < 34; i++) {
    const p = started[Math.floor(rng() * started.length)]
    const s = Math.max(p.startMs, p.startMs + rng() * Math.max(DAY, (p.endMs - p.startMs)))
    const durDays = wpickR([[2, 4], [4, 3], [7, 3], [14, 1.5], [21, 0.7]], rng)
    const e = Math.min(p.endMs, s + durDays * DAY)
    if (e <= s) continue
    const booker = personById(p.leadPersonId) || people.find((pp) => pp.projectIds.includes(p.id))
    const approver = people[N_PEOPLE - 1 - (i % 3)] // an operations person (reservations are approved by ops)
    reservations.push({ id: 'r' + i, projectId: p.id, label: pick(RES_LABEL), gpus: wpickR([[16, 3], [32, 3], [64, 2], [128, 1], [256, 0.4]], rng), startMs: s, endMs: e, start: isoDate(s), end: isoDate(e), bookedBy: booker?.name || '—', approvedBy: approver?.name || 'Operations' })
  }
  reservations.sort((a, b) => a.startMs - b.startMs)
}
const reservedGpusAt = (ms) => { let g = 0; for (const r of reservations) if (r.startMs <= ms && r.endMs > ms) g += r.gpus; return g }

// --- scheduler: run demand against capacity, honouring reservations ---
function heapPush(h, x) { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p].end <= h[i].end) break;[h[p], h[i]] = [h[i], h[p]]; i = p } }
function heapPop(h) { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < h.length && h[l].end < h[m].end) m = l; if (r < h.length && h[r].end < h[m].end) m = r; if (m === i) break;[h[m], h[i]] = [h[i], h[m]]; i = m } } return top }
export const jobs = []
{
  requests.sort((a, b) => a.submit - b.submit)
  const resEvents = []
  for (const r of reservations) { resEvents.push([r.startMs, r.gpus]); resEvents.push([r.endMs, -r.gpus]) }
  resEvents.sort((a, b) => a[0] - b[0])
  const C = cluster.gpus
  const ready = []
  const running = []
  let used = 0, reserved = 0, ri = 0, resi = 0
  const admit = (now) => {
    ready.sort((a, b) => b.prio - a.prio || a.submit - b.submit)
    let i = 0
    while (i < ready.length) {
      const j = ready[i]
      if (used + reserved + j.gpus <= C) { j.start = now; j.end = now + j.durMs; used += j.gpus; heapPush(running, j); jobs.push(j); ready.splice(i, 1) }
      else i++
    }
  }
  while (ri < requests.length || running.length || resi < resEvents.length) {
    const cand = []
    if (ri < requests.length) cand.push(requests[ri].submit)
    if (running.length) cand.push(running[0].end)
    if (resi < resEvents.length) cand.push(resEvents[resi][0])
    if (!cand.length) break
    const t = Math.min(...cand)
    if (t > NOW) break
    while (running.length && running[0].end <= t) { used -= heapPop(running).gpus }
    while (resi < resEvents.length && resEvents[resi][0] <= t) { reserved += resEvents[resi][1]; resi++ }
    while (ri < requests.length && requests[ri].submit <= t) { ready.push(requests[ri]); ri++ }
    admit(t)
  }
}
// clip running jobs at NOW for accounting of used
projects.forEach((p) => {
  let sum = 0
  for (const j of jobs) if (j.projectId === p.id) { const e = Math.min(j.end, NOW); if (e > j.start) sum += j.gpus * (e - j.start) / HOUR }
  p.used = Math.round(sum)
  const progress = Math.max(0.2, Math.min(1, (NOW - p.startMs) / (p.endMs - p.startMs)))
  // budget sized around projected full use; factor < 1 leaves a project over budget
  if (p.startMs < NOW) p.budget = Math.round(p.used / progress * b2(makeRng(hashStr(p.id + ':b')), 0.9, 1.3))
})
teams.forEach((t) => { t.budget = projects.filter((p) => p.teamId === t.id && p.funding !== 'person').reduce((s, p) => s + p.budget, 0) })
// Between-team standing for the fair-tree (used only from the last roll-out phase). Simulated
// here: roughly scaled to team size, with deliberate strategic exceptions. Operations set these
// in Policy in a later phase; for now they are defaults on a 1–9 scale.
const STANDING_OVERRIDE = { Voxtral: 9, Pixtral: 8, Shieldstral: 7, Codestral: 6 }
teams.forEach((t) => {
  const n = people.filter((p) => (p.teamIds || []).includes(t.id)).length
  t.standing = STANDING_OVERRIDE[t.name] ?? Math.max(1, Math.min(8, Math.round(n / 2.5)))
})
// Staged roll-out: operations can put a team on a different phase from the org baseline, so a
// mechanism (e.g. person budgets) is tried on willing teams — and thereby their people — before it
// applies to everyone. Seeded here with a couple of pilots ahead and one team held back.
teams.filter((t) => t.flagship).slice(0, 2).forEach((t) => { t.phaseOverride = 4 })
{ const held = teams.find((t) => !t.flagship); if (held) held.phaseOverride = 2 }

// load units = jobs + reservation holds (reserved GPUs run for their window)
export const RESV_SFX = '__r' // series-key suffix for the reservation part of a bucket
const jobUnits = jobs.map((j) => ({ projectId: j.projectId, gpus: j.gpus, start: j.start, end: j.end, kind: 'job' }))
const loadUnits = [...jobUnits,
  ...reservations.map((r) => ({ projectId: r.projectId, gpus: r.gpus, start: r.startMs, end: r.endMs, kind: 'resv' }))]
// live units (reads the reservations array at call time, so cancellations take effect)
export function splitUnits() {
  return [...jobUnits, ...reservations.map((r) => ({ projectId: r.projectId, gpus: r.gpus, start: r.startMs, end: r.endMs, kind: 'resv' }))]
}

// --- policy / requests ---
export const lanes = {
  bulk: { key: 'bulk', label: 'bulk', factor: 0.7, priority: -50, enabled: true },
  standard: { key: 'standard', label: 'standard', factor: 1.0, priority: 0, enabled: true },
  fast: { key: 'fast', label: 'fast', factor: 1.5, priority: 100, enabled: true },
}
export const parameters = {
  oversubscriptionFactor: 1.05,
  timeOfUse: { office: 1.0, off: 0.5 }, weights: { accountVsLane: 1.0, teamVsProject: 0.5 }, lanes,
  toggles: { lanes: true, timeOfUse: true, headroom: true, oversubscription: true, teamStanding: false, enfPerson: true, enfProject: true, enfTeam: false },
  // top-level split of governed capacity between the person pool and the projects pool.
  // personPct is set by operations and defaults from the rollout phase (see GOV_PHASES).
  pools: { personPct: (GOV_PHASES.find((g) => g.n === governance.phase) || GOV_PHASES[0]).personPct },
}
export const requestsList = [
  { id: 'req-1', type: 'budget change', subject: 'Voxtral v3 +40,000 GPU-h', note: 'Final pre-training run is larger than planned after the tokenizer change; need the extra budget to finish before the release freeze.', requestedBy: people[0].name, routedTo: 'Operations', status: 'pending', warning: 'Would take the Voxtral budget past its limit.' },
  { id: 'req-2', type: 'new project', subject: 'Long-context evaluation', note: 'New eval suite for 128k-context retrieval, feeding the next Voxtral and Codestral releases; ~3 weeks, mostly inference.', requestedBy: people[6].name, routedTo: 'Evaluation lead', status: 'pending', warning: null, startMs: Date.UTC(2026, 9, 1), endMs: Date.UTC(2026, 9, 22), amount: '80,000 GPU-h' },
  { id: 'req-3', type: 'priority change', subject: 'Raise Mathstral v2 to high', note: 'Slipping against the partner deadline; needs to clear the queue ahead of the ablations to hit the demo date.', requestedBy: people[1].name, routedTo: 'Direction', status: 'pending', warning: null },
  { id: 'req-4', type: 'budget change', subject: 'Red-team sweep +8,000 GPU-h', note: 'Extra safety sweep requested after the last checkpoint; small top-up to cover the additional adversarial runs.', requestedBy: people[8].name, routedTo: 'Evaluation lead', status: 'approved', warning: null },
  { id: 'req-5', type: 'reservation', subject: 'Reserve 128 GPUs for Voxtral v3, 2026-10-05 to 2026-10-19', note: 'Held burst for the final pre-training run so it is not preempted mid-epoch.', requestedBy: people[0].name, routedTo: 'Operations', status: 'pending', warning: null, startMs: Date.UTC(2026, 9, 5), endMs: Date.UTC(2026, 9, 19), amount: '128 GPU' },
  { id: 'req-6', type: 'extension', subject: 'Extend Codestral v4 to 2026-12-15', note: 'Two more weeks to finish the long-context ablations before the release freeze.', requestedBy: people[3].name, routedTo: 'Codestral lead', status: 'approved', warning: null, decidedBy: 'Ops', decisionComment: 'Fits within the pool; approved.', startMs: Date.UTC(2026, 10, 30), endMs: Date.UTC(2026, 11, 15), amount: 'extend' },
]
export { requestsList as requests }

// --- pools: the person pool sits beside the projects pool (teams + org) as a sibling
// at the top of the fair-tree. The person pool is sized by policy (parameters.pools.personPct
// of governed capacity); the projects pool is the rest. Team budgets distribute the
// projects pool bottom-up. These helpers give both the allocated (policy) split and the
// realised (demand / consumption) split, whose gap tells operations if the pool is sized well.
export const personProjects = projects.filter((p) => p.funding === 'person')
export const projectProjects = projects.filter((p) => p.funding !== 'person')
export const teamProjectsList = projects.filter((p) => p.funding === 'team')
export const orgProjectsList = projects.filter((p) => p.funding === 'org')
// Personal budgets follow policy, not the demand-derived figure used for project budgets:
// the person pool is shared equally across the people who hold a personal budget, so the
// allocations add up to the pool. Each person now holds a single personal bucket.
{
  const byOwner = {}
  for (const p of personProjects) (byOwner[p.personId] = byOwner[p.personId] || []).push(p)
  const owners = Object.keys(byOwner).length || 1
  const allowance = Math.round(personPoolHours() / owners)
  for (const list of Object.values(byOwner)) { const each = Math.round(allowance / list.length); for (const p of list) p.budget = each }
}
// total GPU-hours the cluster offers over the period, and the share of it that is governed
export function capacityHours() { return effectiveGpus(period.nowMs) * (period.endMs - period.startMs) / HOUR }
export function govHours() { return capacityHours() }
export function personPct() { return parameters.pools?.personPct ?? 0 }
// allocated (policy) sizes, in GPU-hours
export function personPoolHours() { return Math.round(govHours() * personPct()) }
export function projectsPoolHours() { return Math.round(govHours() * (1 - personPct())) }
// realised: what each pool actually holds as budget (bottom-up demand) and has consumed
export function personDemand() { return personProjects.reduce((s, p) => s + p.budget, 0) }
export function projectsDemand() { return projectProjects.reduce((s, p) => s + p.budget, 0) }
// budget realisation to date, per pool: consumed against each pool's budget prorated to how far
// its projects' windows have run. Below 1 means the pool's budgets are over-requested so far.
export function poolRealisation(t0 = period.startMs, t1 = period.nowMs) {
  const planned = (list) => list.reduce((s, p) => { const a = Math.max(p.startMs, t0), b = Math.min(p.endMs, t1); return s + (b > a ? p.budget * (b - a) / ((p.endMs - p.startMs) || 1) : 0) }, 0)
  const projPl = planned(projectProjects), persPl = planned(personProjects)
  return {
    project: projPl > 0 ? consumedGpuH(projectProjects, t0, t1) / projPl : null,
    person: persPl > 0 ? consumedGpuH(personProjects, t0, t1) / persPl : null,
  }
}
export function poolConsumption(t0 = period.startMs, t1 = period.nowMs) {
  const person = consumedGpuH(personProjects, t0, t1)
  const proj = consumedGpuH(projectProjects, t0, t1)
  return { person, projects: proj, total: person + proj }
}
// the rollout KPI: person-pool share, both as allocated intent and as realised behaviour
export function personShareAllocated() { return personPct() }
export function personShareRealised(t0, t1) { const c = poolConsumption(t0, t1); return c.total ? c.person / c.total : 0 }

// two-pool split (team / person) of actual consumption, and the target it is read against:
// person is the ops-set pool share, teams are the rest.
export function consumptionByPool(t0 = period.startMs, t1 = period.nowMs) {
  const team = consumedGpuH(teamProjectsList, t0, t1)
  const person = consumedGpuH(personProjects, t0, t1)
  return { team, person, total: team + person }
}
export function targetByPool() {
  const person = personPct()
  return { team: 1 - person, person }
}
// GPU-hours the cluster actually offered over a window, integrating the stepped capacity schedule
export function capacityHoursBetween(t0, t1) {
  if (t1 <= t0) return 0
  const adj = [...(capacity.adjustments || [])].sort((a, b) => a.at - b.at)
  let g = capacity.base
  for (const a of adj) if (a.at <= t0) g = a.gpus
  let cursor = t0, total = 0
  for (const a of adj) if (a.at > t0 && a.at < t1) { total += g * (a.at - cursor) / HOUR; cursor = a.at; g = a.gpus }
  total += g * (t1 - cursor) / HOUR
  return total
}
export function capacityHoursToDate() { return capacityHoursBetween(period.startMs, period.nowMs) }
// data for the pool bars, over a trailing window that reflects current operation (the full
// period includes the early ramp, so lifetime utilisation reads far below the busy "now").
// Consumption and target are shares of the capacity offered in that window; the actual bar's
// slack below full is idle capacity. The allocated bar is measured against capacity, so committed
// budgets that fall short leave an uncommitted tail and budgets that exceed it overflow (over-committed).
export function poolBars(windowDays = 120) {
  const t0 = windowDays ? period.nowMs - windowDays * DAY : period.startMs
  const capBase = capacityHoursBetween(t0, period.nowMs) || 1
  const cons = consumptionByPool(t0, period.nowMs)
  const tgt = targetByPool()
  // allocated budget per pool: the team pools (all funded projects) and the person pool as sized by policy
  const teamB = teams.reduce((s, t) => s + (t.budget || 0), 0)
  const personB = personPoolHours()
  const totalB = teamB + personB || 1
  const capAlloc = capacityHours() || 1 // total GPU-h the cluster offers over the period; the 100% baseline for committed budgets
  const oversub = parameters?.oversubscriptionFactor ?? 1
  const defs = [
    { key: 'team', label: 'Teams', colour: 'var(--accent)', used: cons.team, targetFrac: tgt.team, budget: teamB },
    { key: 'person', label: 'Person', colour: '#9085e9', used: cons.person, targetFrac: tgt.person, budget: personB },
  ]
  const pools = defs.map((d) => ({
    ...d,
    usedPc: (d.used / capBase) * 100,
    targetPc: d.targetFrac * 100,          // the pool's policy share of capacity
    budgetPc: (d.budget / capAlloc) * 100, // committed budget as a share of capacity
    budgetSharePc: (d.budget / totalB) * 100, // share within the committed total (for the legend)
  }))
  const idlePc = Math.max(0, 100 - pools.reduce((s, p) => s + p.usedPc, 0))
  const committedPc = pools.reduce((s, p) => s + p.budgetPc, 0)
  const uncommittedPc = Math.max(0, 100 - committedPc)
  const overPc = Math.max(0, committedPc - 100)
  return { capBase, capAlloc, pools, idlePc, windowDays, consTotal: cons.total, allocTotal: totalB, committedPc, uncommittedPc, overPc, ceilingPc: oversub * 100, oversub }
}

// --- lookups ---
export const orgPool = projects.reduce((s, p) => s + p.budget, 0)
export function teamById(id) { return teams.find((t) => t.id === id) }
// the roll-out phase in force for a team: its own override, else the org baseline
export function teamPhase(t) { return (t && t.phaseOverride != null) ? t.phaseOverride : governance.phase }
export function teamPhaseInfo(t) { return GOV_PHASES.find((g) => g.n === teamPhase(t)) || GOV_PHASES[0] }
// the mechanisms actually in force for a team: the preset of its override phase when set,
// otherwise the org's applied toggles (which operations may have customised in Policy).
export function teamEnforcement(t) {
  if (t && t.phaseOverride != null) {
    const g = GOV_PHASES.find((x) => x.n === t.phaseOverride)
    if (g) return g.on
  }
  return parameters.toggles
}
// whether a project's budget is an enforced cap given its team's effective phase. When it is
// not, the budget is a target to read against, not a limit that stops jobs.
export function projectEnforced(p) {
  if (!p) return false
  if (p.funding === 'person') return !!parameters.toggles.enfPerson
  const t = p.teamId ? teamById(p.teamId) : null
  return !!(t ? teamEnforcement(t) : parameters.toggles).enfProject
}
export function teamProjectsOf(teamId) { return projects.filter((p) => p.teamId === teamId && p.funding !== 'person') }
export function personById(id) { return people.find((p) => p.id === id) }
export function projectById(id) { return projects.find((p) => p.id === id) }
export function teamsForPerson(person) { return (person.teamIds ?? []).map(teamById).filter(Boolean) }
export function primaryTeam(person) { return teamsForPerson(person)[0] }
export function projectsForPerson(person) { return (person.projectIds ?? []).map(projectById).filter(Boolean) }
export function peopleForProject(projectId) { return people.filter((p) => (p.projectIds ?? []).includes(projectId)) }
export const leads = people.filter((p) => p.role === 'lead')
export const opsPeople = people.filter((p) => p.role === 'ops')
// plain team members: no elevated role, so read-only viewers, but tied to a team
export const members = people.filter((p) => !p.role && (p.teamIds?.length))
export function projectsLedBy(personId) { return projects.filter((p) => p.leadPersonId === personId) }
// unique people who lead at least one project (for the role switcher)
export const projectLeads = [...new Set(projects.map((p) => p.leadPersonId).filter(Boolean))].map(personById).filter(Boolean)

// projects a person is part of that are running right now (started, not finished)
export function activeProjectsForPerson(person) {
  return projectsForPerson(person).filter((p) => projectState(p) === 'active')
}
// switcher helper: keep only people with part of an active project, and put those
// who also have a job running now first (so a demo actor's My view is never empty)
export function activeSwitcherPeople(cands, n = 12) {
  const running = new Set(runningJobsAt(NOW).map((j) => j.personId))
  return cands
    .filter((p) => activeProjectsForPerson(p).length)
    .sort((a, b) => (running.has(b.id) ? 1 : 0) - (running.has(a.id) ? 1 : 0))
    .slice(0, n)
}

// External systems faircenter reads from and writes to. Operations configures these;
// values here are placeholders for the proof of concept, secrets are never stored in
// the front end (the real app keeps them server-side). status is illustrative.
export const connectors = [
  { id: 'slurm', name: 'SLURM', kind: 'Scheduler', role: 'source & destination', enabled: false, status: 'connected',
    fields: [
      { key: 'restHost', label: 'slurmrestd host', type: 'text', value: 'slurm-ctld.cluster.internal' },
      { key: 'restPort', label: 'Port', type: 'number', value: '6820' },
      { key: 'acct', label: 'Accounting (slurmdbd)', type: 'text', value: 'slurmdbd.cluster.internal:6819' },
      { key: 'auth', label: 'Auth', type: 'select', value: 'munge', options: ['munge', 'JWT'] },
      { key: 'token', label: 'JWT token', type: 'password', value: '', placeholder: 'set server-side' },
      { key: 'poll', label: 'Poll interval', type: 'number', value: '30', suffix: 's' },
    ] },
  { id: 'notion', name: 'Notion', kind: 'Project register', role: 'source', enabled: false, status: 'connected',
    fields: [
      { key: 'token', label: 'Integration token', type: 'password', value: '', placeholder: 'secret_…' },
      { key: 'projDb', label: 'Projects database ID', type: 'text', value: '', placeholder: '32-char id' },
      { key: 'budgetDb', label: 'Budgets database ID', type: 'text', value: '' },
      { key: 'sync', label: 'Sync', type: 'select', value: 'read-only', options: ['read-only', 'two-way'] },
    ] },
  { id: 'slack', name: 'Slack', kind: 'Notifications', role: 'destination', enabled: false, status: 'connected',
    fields: [
      { key: 'workspace', label: 'Workspace', type: 'text', value: 'your-org' },
      { key: 'auth', label: 'Auth', type: 'select', value: 'Bot token', options: ['Bot token', 'Incoming webhook'] },
      { key: 'token', label: 'Bot token', type: 'password', value: '', placeholder: 'xoxb-… (set server-side)' },
      { key: 'channel', label: 'Default channel', type: 'text', value: '#gpu-allocation' },
      { key: 'route', label: 'Route by', type: 'select', value: 'per-team channel', options: ['single channel', 'per-team channel', 'direct message'] },
      { key: 'events', label: 'Notify on', type: 'select', value: 'approvals + alerts', options: ['approvals only', 'approvals + alerts', 'everything'] },
    ] },
  { id: 'email', name: 'Email (SMTP)', kind: 'Notifications', role: 'destination', enabled: false, status: 'connected',
    fields: [
      { key: 'host', label: 'SMTP host', type: 'text', value: 'smtp.your-org.internal' },
      { key: 'port', label: 'Port', type: 'number', value: '587' },
      { key: 'security', label: 'Security', type: 'select', value: 'STARTTLS', options: ['none', 'STARTTLS', 'TLS'] },
      { key: 'from', label: 'From address', type: 'text', value: 'faircenter@your-org.example' },
      { key: 'user', label: 'Username', type: 'text', value: 'faircenter' },
      { key: 'pass', label: 'Password', type: 'password', value: '', placeholder: 'set server-side' },
    ] },
  { id: 'sso', name: 'Identity (SSO)', kind: 'Authentication', role: 'source', enabled: false, status: 'not configured',
    fields: [
      { key: 'protocol', label: 'Protocol', type: 'select', value: 'OIDC', options: ['OIDC', 'SAML', 'LDAP'] },
      { key: 'issuer', label: 'Issuer URL', type: 'text', value: '', placeholder: 'https://sso.your-org…' },
      { key: 'clientId', label: 'Client ID', type: 'text', value: '' },
      { key: 'secret', label: 'Client secret', type: 'password', value: '' },
    ] },
  { id: 'storage', name: 'Object storage', kind: 'Data', role: 'destination', enabled: false, status: 'not configured',
    fields: [
      { key: 'endpoint', label: 'S3 endpoint', type: 'text', value: '', placeholder: 'https://s3.your-org…' },
      { key: 'bucket', label: 'Bucket', type: 'text', value: '' },
      { key: 'accessKey', label: 'Access key', type: 'text', value: '' },
      { key: 'secretKey', label: 'Secret key', type: 'password', value: '' },
    ] },
]
export function projectOwner(prj) { if (prj.funding === 'team') return teamById(prj.teamId)?.name ?? 'team'; if (prj.funding === 'person') return personById(prj.personId)?.name ?? 'person'; return 'Organisation' }
export function ownerBucket(prj) { if (prj.funding === 'team') return teamById(prj.teamId)?.name; if (prj.funding === 'person') return 'Personal'; return 'Organisation' }
export function pctOfOrg(v) { return Math.round((v / orgPool) * 100) }
export function priorityTier(project) { return project.funding === 'person' ? null : (project.priority || 'medium') }
export function projectState(p) { if (p.startMs > NOW) return 'planned'; if (p.endMs < NOW) return 'finished'; return 'active' }
export function activeProjects(atMs = NOW) { return projects.filter((p) => p.startMs <= atMs && p.endMs >= atMs) }

export function runningAt(projIds, atMs) { const set = new Set(projIds); let g = 0; for (const u of loadUnits) if (set.has(u.projectId) && u.start <= atMs && u.end > atMs) g += u.gpus; return g }
export function recentDailyRate(project, days = 14) {
  const from = NOW - days * DAY; let g = 0
  for (const j of jobs) { if (j.projectId !== project.id) continue; const s = Math.max(j.start, from), e = Math.min(j.end, NOW); if (e > s) g += j.gpus * (e - s) / HOUR }
  return g / days
}
export function consumedGpuH(projList, t0, t1) { const set = new Set(projList.map((p) => p.id)); let g = 0; for (const j of jobs) { if (!set.has(j.projectId)) continue; const s = Math.max(j.start, t0), e = Math.min(j.end, t1); if (e > s) g += j.gpus * (e - s) / HOUR } return Math.round(g) }
// How much of a reservation was actually used: the holding project's GPU-hours inside the
// reservation window, against the reserved GPU-hours (reserved GPUs x window length). Usage is
// clipped to the window, so work run outside it or the idle part of a partial overlap does not
// count. For a reservation still running, it measures use to date.
export function reservationUsage(r) {
  const effEnd = Math.min(r.endMs, NOW)
  const hours = Math.max(0, (effEnd - r.startMs) / HOUR)
  const reservedGpuH = Math.round(r.gpus * hours)
  const usedGpuH = hours > 0 ? consumedGpuH([{ id: r.projectId }], r.startMs, effEnd) : 0
  const utilPct = reservedGpuH > 0 ? Math.min(100, Math.round((usedGpuH / reservedGpuH) * 100)) : 0
  return { reservedGpuH, usedGpuH, utilPct, ended: r.endMs < NOW }
}

// --- queue and waits (scheduler transparency) ---
export const priorityTierOf = priorityTier
// jobs submitted by `atMs` that have not started running: the live waiting queue,
// ordered the way the scheduler orders them (standing/priority first, then age).
export function queueSnapshot(atMs = NOW) {
  return requests
    .filter((r) => r.submit <= atMs && (r.start == null || r.start > atMs))
    .map((r) => ({ id: r.id, projectId: r.projectId, personId: r.personId, gpus: r.gpus, durMs: r.durMs, lane: r.lane, prio: r.prio, submit: r.submit, waited: atMs - r.submit }))
    .sort((a, b) => b.prio - a.prio || a.submit - b.submit)
}
// Project when each waiting job will start by running the scheduler forward from `atMs`:
// admit queued jobs in priority order as running jobs finish and capacity frees, honouring
// reservations and the capacity schedule. Returns the queue with an `eta` (start ms) each.
export function queueForecast(atMs = NOW) {
  const queue = queueSnapshot(atMs)
  const resHolds = reservations.filter((r) => r.endMs > atMs).map((r) => ({ start: Math.max(r.startMs, atMs), end: r.endMs, gpus: r.gpus }))
  const reservedAt = (t) => resHolds.reduce((s, h) => (h.start <= t && h.end > t ? s + h.gpus : s), 0)
  let inflight = runningJobsAt(atMs).map((j) => ({ end: j.end, gpus: j.gpus }))
  const pending = queue.map((r) => ({ id: r.id, gpus: r.gpus, durMs: r.durMs || HOUR }))
  const eta = new Map()
  let t = atMs, guard = 0
  while (pending.length && guard < 20000) {
    guard++
    inflight = inflight.filter((j) => j.end > t)
    const cap = effectiveGpus(t)
    for (let i = 0; i < pending.length;) {
      const used = inflight.reduce((s, x) => s + x.gpus, 0)
      const avail = cap - reservedAt(t) - used
      if (pending[i].gpus <= avail) { eta.set(pending[i].id, t); inflight.push({ end: t + pending[i].durMs, gpus: pending[i].gpus }); pending.splice(i, 1) }
      else i++
    }
    if (!pending.length) break
    let next = Infinity
    for (const j of inflight) if (j.end > t) next = Math.min(next, j.end)
    for (const h of resHolds) { if (h.start > t) next = Math.min(next, h.start); if (h.end > t) next = Math.min(next, h.end) }
    if (!isFinite(next) || next <= t) break
    t = next
  }
  return queue.map((r) => ({ ...r, eta: eta.get(r.id) ?? null }))
}
// jobs running at `atMs`.
export function runningJobsAt(atMs = NOW) {
  return jobs.filter((j) => j.start != null && j.start <= atMs && j.end > atMs)
    .map((j) => ({ id: j.id, projectId: j.projectId, personId: j.personId, gpus: j.gpus, lane: j.lane, start: j.start, end: j.end }))
}
// median wait in minutes over jobs that started in the recent window, by lane,
// optionally filtered to one person. Used to show a person their waits vs the cluster.
export function waitStats(personId = null, days = 30) {
  const since = NOW - days * DAY
  const buckets = { fast: [], standard: [], bulk: [], all: [] }
  for (const j of jobs) {
    if (j.start == null || j.start < since || j.start > NOW) continue
    if (personId && j.personId !== personId) continue
    const w = (j.start - j.submit) / 60000
    if (buckets[j.lane]) buckets[j.lane].push(w)
    buckets.all.push(w)
  }
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null)
  const mn = (a) => (a.length ? Math.min(...a) : null)
  const mx = (a) => (a.length ? Math.max(...a) : null)
  return {
    fast: med(buckets.fast), standard: med(buckets.standard), bulk: med(buckets.bulk), all: med(buckets.all),
    min: { fast: mn(buckets.fast), standard: mn(buckets.standard), bulk: mn(buckets.bulk), all: mn(buckets.all) },
    max: { fast: mx(buckets.fast), standard: mx(buckets.standard), bulk: mx(buckets.bulk), all: mx(buckets.all) },
    counts: { fast: buckets.fast.length, standard: buckets.standard.length, bulk: buckets.bulk.length, all: buckets.all.length },
  }
}

// opts.units overrides the source units; opts.split emits jobs as `bucket` and
// reservations as `bucket+RESV_SFX` (a separate stack layer) instead of summing them.
export function loadSeries(projList, t0, t1, keyOf, opts) {
  const units = (opts && opts.units) || loadUnits
  const split = !!(opts && opts.split)
  const bucketOf = {}; for (const p of projList) bucketOf[p.id] = keyOf(p)
  const set = new Set(projList.map((p) => p.id))
  const buckets = [...new Set(projList.map((p) => keyOf(p)))]
  // a reservation is a hold: usage under it is absorbed inside the reservation, and only
  // usage above it adds its own band. Job band = max(0, used - reserved); total = max(used, reserved).
  const emit = (cj, cr) => { const row = {}; for (const b of buckets) { const over = Math.max(0, cj[b] - cr[b]); if (split) { row[b] = over; row[b + RESV_SFX] = cr[b] } else { row[b] = cr[b] + over } } return row }
  const raw = (t1 - t0) <= 14 * DAY
  if (raw) {
    const evts = []
    for (const u of units) { if (!set.has(u.projectId) || u.end <= t0 || u.start >= t1) continue; const r = u.kind === 'resv'; evts.push([Math.max(u.start, t0), u.gpus, bucketOf[u.projectId], r]); evts.push([Math.min(u.end, t1), -u.gpus, bucketOf[u.projectId], r]) }
    evts.sort((a, b) => a[0] - b[0])
    const cj = Object.fromEntries(buckets.map((b) => [b, 0])); const cr = Object.fromEntries(buckets.map((b) => [b, 0]))
    const rows = [{ t: t0, ...emit(cj, cr) }]; let i = 0
    while (i < evts.length) { const time = evts[i][0]; while (i < evts.length && evts[i][0] === time) { const e = evts[i]; if (e[3]) cr[e[2]] += e[1]; else cj[e[2]] += e[1]; i++ } rows.push({ t: time, ...emit(cj, cr) }) }
    rows.push({ t: t1, ...emit(cj, cr) })
    return { rows, buckets, mode: 'raw' }
  }
  const d0 = Math.floor(t0 / DAY), d1 = Math.ceil(t1 / DAY), nDays = d1 - d0
  const gj = new Map()  // jobs: mean GPUs over the day (GPU-hours / 24)
  const gr = new Map()  // reservations: the reserved level, kept as a rectangular block
  for (let d = 0; d < nDays; d++) { gj.set(d, Object.fromEntries(buckets.map((b) => [b, 0]))); gr.set(d, Object.fromEntries(buckets.map((b) => [b, 0]))) }
  // jobs -> time-averaged GPUs per day (actual usage genuinely varies within a day)
  for (const u of units) {
    if (u.kind === 'resv' || !set.has(u.projectId) || u.end <= t0 || u.start >= t1) continue
    const b = bucketOf[u.projectId]; let s = Math.max(u.start, t0); const e = Math.min(u.end, t1)
    while (s < e) { const di = Math.floor(s / DAY) - d0; const de = (Math.floor(s / DAY) + 1) * DAY; const seg = Math.min(e, de) - s; if (gj.has(di)) gj.get(di)[b] += u.gpus * seg / HOUR; s = de }
  }
  // reservations -> the reserved GPU level, not a time-average: a hold is a rectangular
  // block, so per day and bucket take the peak concurrent reserved GPUs. A single
  // reservation then reads flat at its size across every day it is active.
  const resvUnits = units.filter((u) => u.kind === 'resv' && set.has(u.projectId) && u.end > t0 && u.start < t1)
  for (let d = 0; d < nDays; d++) {
    const dayS = (d0 + d) * DAY, dayE = dayS + DAY
    for (const b of buckets) {
      const ev = []
      for (const u of resvUnits) {
        if (bucketOf[u.projectId] !== b) continue
        const s = Math.max(u.start, dayS, t0), e = Math.min(u.end, dayE, t1)
        if (e <= s) continue
        ev.push([s, u.gpus]); ev.push([e, -u.gpus])
      }
      if (!ev.length) continue
      ev.sort((x, y) => x[0] - y[0])
      let cur = 0, peak = 0
      for (const [, g] of ev) { cur += g; if (cur > peak) peak = cur }
      gr.get(d)[b] = peak
    }
  }
  const rows = []
  for (let d = 0; d < nDays; d++) { const cj = Object.fromEntries(buckets.map((b) => [b, +(gj.get(d)[b] / 24).toFixed(1)])); const cr = Object.fromEntries(buckets.map((b) => [b, +gr.get(d)[b].toFixed(1)])); rows.push({ t: (d0 + d) * DAY, ...emit(cj, cr) }) }
  return { rows, buckets, mode: 'daily' }
}

// Per-project projection rate (GPU-h/day) under the chosen model.
export function projRate(project, method = 'recent') {
  if (method === 'linear') { const days = Math.max(1, (Math.min(NOW, project.endMs) - project.startMs) / DAY); return project.used / days }
  return recentDailyRate(project)
}

export function forecastSeries(projList, tNow, t1, keyOf, method = 'recent', split = false) {
  const buckets = [...new Set(projList.map(keyOf))]
  const d0 = Math.floor(tNow / DAY), d1 = Math.ceil(t1 / DAY)
  const remaining = {}, rate = {}
  for (const p of projList) { remaining[p.id] = Math.max(0, p.budget - p.used); rate[p.id] = projRate(p, method) }
  const rows = []
  for (let d = d0; d < d1; d++) {
    const dayStart = d * DAY, dayEnd = (d + 1) * DAY
    const accJ = Object.fromEntries(buckets.map((b) => [b, 0]))
    const accR = Object.fromEntries(buckets.map((b) => [b, 0]))
    for (const p of projList) {
      const b = keyOf(p); let meanG = 0
      if (dayEnd > p.startMs && dayStart < p.endMs) { const gpuh = Math.min(rate[p.id], remaining[p.id]); remaining[p.id] -= gpuh; meanG = gpuh / 24 }
      let resG = 0; for (const r of reservations) if (r.projectId === p.id && r.endMs > dayStart && r.startMs < dayEnd) resG = Math.max(resG, r.gpus)
      // reservation is the guaranteed floor; job forecast fills above it. Total = max(job, reserved).
      accR[b] += resG; accJ[b] += Math.max(0, meanG - resG)
    }
    const row = { t: Math.max(dayStart, tNow), forecast: true }
    for (const b of buckets) { if (split) { row[b] = +accJ[b].toFixed(1); row[b + RESV_SFX] = +accR[b].toFixed(1) } else { row[b] = +(accJ[b] + accR[b]).toFixed(1) } }
    rows.push(row)
  }
  return { rows, buckets }
}

// --- KPIs computed monthly from the jobs ---
function median(arr) { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }
function monthRange(y, m) { return [Date.UTC(y, m, 1), Date.UTC(y, m + 1, 1)] }
export const KPIS = [
  { key: 'util', label: 'Utilisation', unit: '%', better: 'high' },
  { key: 'capacity', label: 'Capacity', unit: 'GPUs', better: 'neutral' },
  { key: 'projects', label: 'Nr. of projects', unit: '', better: 'neutral' },
  { key: 'planned', label: 'Project budgets', unit: 'GPU-h', better: 'neutral' },
  { key: 'usedProj', label: 'Project budgets actualised', unit: 'GPU-h', better: 'neutral' },
  { key: 'committed', label: 'Committed demand', unit: 'GPU-h', better: 'neutral' },
  { key: 'wait', label: 'Mean wait', unit: 'min', better: 'low' },
  { key: 'queued', label: 'Jobs queued > 1h', unit: '%', better: 'low' },
  { key: 'overBudget', label: 'Projects over budget', unit: '%', better: 'low' },
  { key: 'personPct', label: 'Person pool %', unit: '%', better: 'neutral' },
  { key: 'oversub', label: 'Over-subscription', unit: '×', better: 'neutral' },
]
// time buckets for the analytics series, at a chosen cadence. Buckets run past the period end
// so the forecast has room to project (up to ~13 months beyond "now").
function mkBuckets(cadence) {
  const out = []
  const BEND = Math.max(END, NOW + 13 * (365.25 / 12) * DAY)
  if (cadence === 'week') {
    for (let t = START; t <= BEND; t += 7 * DAY) {
      const t1 = t + 7 * DAY
      out.push({ t0: t, t1, label: new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }), forecast: t > NOW, partial: t <= NOW && t1 > NOW })
    }
  } else if (cadence === 'quarter') {
    let y = new Date(START).getUTCFullYear(), qm = Math.floor(new Date(START).getUTCMonth() / 3) * 3
    while (Date.UTC(y, qm, 1) <= BEND) {
      const a = Date.UTC(y, qm, 1), b = Date.UTC(y, qm + 3, 1)
      out.push({ t0: a, t1: b, label: `Q${qm / 3 + 1} ${String(y).slice(2)}`, forecast: a > NOW, partial: a <= NOW && b > NOW })
      qm += 3; if (qm > 11) { qm = 0; y++ }
    }
  } else {
    let y = 2025, m = 4
    while (Date.UTC(y, m, 1) <= BEND) {
      const [a, b] = monthRange(y, m)
      out.push({ t0: a, t1: b, label: new Date(a).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), forecast: a > NOW, partial: a <= NOW && b > NOW })
      m++; if (m > 11) { m = 0; y++ }
    }
  }
  return out
}
function kpiBucket(ms0, ms1) {
  const effEnd = Math.min(ms1, NOW)
  const hrsEl = Math.max(1, (effEnd - ms0) / HOUR)
  let gpuh = 0
  for (const u of loadUnits) { const s = Math.max(u.start, ms0), e = Math.min(u.end, effEnd); if (e > s) gpuh += u.gpus * (e - s) / HOUR }
  const allW = []; let over1h = 0, jn = 0
  for (const j of jobs) { if (j.submit >= ms0 && j.submit < ms1) { const w = (j.start - j.submit) / 60000; jn++; if (w > 60) over1h++; allW.push(w) } }
  const activeP = projects.filter((p) => p.startMs < ms1 && p.endMs > ms0)
  const teamActive = activeP.filter((p) => p.funding !== 'person')
  // utilisation is realised GPU-hours over the GPU-hours the cluster actually offered in the window,
  // integrating the scheduled capacity so a capacity change moves it. cluster.gpus is not used here.
  const capH = capacityHoursBetween(ms0, effEnd) || 1
  return {
    util: Math.round((gpuh / capH) * 100),
    demandGpuh: Math.round(gpuh),
    committed: activeP.reduce((s, p) => s + p.budget, 0),
    wait: allW.length ? Math.round(allW.reduce((s, w) => s + w, 0) / allW.length) : 0,
    queued: jn ? Math.round((over1h / jn) * 100) : 0,
    overBudget: teamActive.length ? Math.round((teamActive.filter((p) => p.used > p.budget).length / teamActive.length) * 100) : 0,
  }
}
// Policy / mechanism timeline: dated points where operations changed a mechanism or a value,
// each carrying the parameter state in force from then on. Drives the policy-value indicators
// and the vertical event markers on the analytics trend. (Illustrative for the POC.)
export const policyTimeline = [
  { at: START, kind: 'phase', label: 'Observe phase', personPct: 0.60, oversub: 0.90 },
  { at: Date.UTC(2025, 8, 1), kind: 'mechanism', label: 'Person budgets on', personPct: 0.45, oversub: 0.90 },
  { at: Date.UTC(2026, 0, 15), kind: 'value', label: 'Fast lane +50 priority', personPct: 0.45, oversub: 0.95 },
  { at: Date.UTC(2026, 2, 1), kind: 'mechanism', label: 'Project budgets on', personPct: 0.22, oversub: 1.00 },
  { at: Date.UTC(2026, 4, 10), kind: 'value', label: 'Over-subscription 1.00 → 1.05', personPct: 0.22, oversub: 1.05 },
]
export function policyAt(t) { let s = policyTimeline[0]; for (const e of policyTimeline) { if (e.at <= t) s = e; else break } return s }
// the vertical markers on the trend: policy timeline points past the baseline, plus
// capacity changes (known ahead from the fleet schedule; some are still planned)
export const paramEvents = [
  ...policyTimeline.slice(1).map((e) => ({ at: e.at, label: e.label, kind: e.kind })),
  ...(capacity.adjustments || []).map((a) => ({ at: a.at, label: `${a.note} → ${a.gpus} GPUs`, kind: 'capacity' })),
].sort((a, b) => a.at - b.at)

// planned / actual GPU-h for the projects pool in a bucket (planned works for forecast too)
function plannedProjBucket(t0, t1) {
  let planned = 0
  for (const p of projectProjects) { const s = Math.max(p.startMs, t0), e = Math.min(p.endMs, t1); if (e > s) { const dur = (p.endMs - p.startMs) || 1; planned += p.budget * (e - s) / dur } }
  return Math.round(planned)
}
function usedProjBucket(t0, t1) {
  const eff = Math.min(t1, NOW); if (eff <= t0) return 0
  const ids = new Set(projectProjects.map((p) => p.id)); let g = 0
  for (const u of loadUnits) { if (!ids.has(u.projectId)) continue; const s = Math.max(u.start, t0), e = Math.min(u.end, eff); if (e > s) g += u.gpus * (e - s) / HOUR }
  return Math.round(g)
}
// committed demand: total budget of projects active in the bucket (known ahead from windows)
function committedBucket(t0, t1) { return projects.filter((p) => p.startMs < t1 && p.endMs > t0).reduce((s, p) => s + p.budget, 0) }
// KPI series at a cadence ('week' | 'month'). Job-based KPIs hold the last actual flat in the
// forecast; capacity and policy values are computed for every bucket (they are known ahead).
export function kpiSeries(cadence = 'month') {
  const out = []; let lastK = null
  for (const b of mkBuckets(cadence)) {
    const mid = (b.t0 + b.t1) / 2
    const pol = policyAt(mid)
    const plannedV = plannedProjBucket(b.t0, b.t1)
    const usedV = b.forecast ? null : usedProjBucket(b.t0, b.t1)
    const extra = {
      capacity: Math.round(effectiveGpus(mid)),
      projects: projectProjects.filter((p) => p.startMs < b.t1 && p.endMs > b.t0).length,
      planned: plannedV,
      committed: committedBucket(b.t0, b.t1),
      usedProj: usedV,
      personPct: Math.round(pol.personPct * 100),
      oversub: +pol.oversub.toFixed(2),
    }
    if (!b.forecast) { lastK = kpiBucket(b.t0, b.t1); out.push({ period: b.label, t0: b.t0, t1: b.t1, forecast: false, partial: !!b.partial, ...lastK, ...extra }) }
    else out.push({ period: b.label, t0: b.t0, t1: b.t1, forecast: true, partial: false, ...(lastK || {}), ...extra })
  }
  return out
}

// Planned vs actual GPU-hours for the projects pool (teams + org) at a cadence. Planned is each
// project's budget spread evenly over its window; actual is what its jobs consumed. Personal work
// is excluded, having no per-project budget to plan against.
export function pvaSeries(cadence = 'month') {
  const ppIds = new Set(projectProjects.map((p) => p.id))
  const out = []
  for (const b of mkBuckets(cadence)) {
    let planned = 0
    for (const p of projectProjects) { const s = Math.max(p.startMs, b.t0), e = Math.min(p.endMs, b.t1); if (e > s) { const dur = (p.endMs - p.startMs) || 1; planned += p.budget * (e - s) / dur } }
    let actual = null
    if (!b.forecast) { const effEnd = Math.min(b.t1, NOW); actual = 0; for (const u of loadUnits) { if (!ppIds.has(u.projectId)) continue; const s = Math.max(u.start, b.t0), e = Math.min(u.end, effEnd); if (e > s) actual += u.gpus * (e - s) / HOUR } }
    out.push({ period: b.label, t0: b.t0, forecast: b.forecast, planned: Math.round(planned), actual: actual == null ? null : Math.round(actual) })
  }
  return out
}
// on-pace expected consumption to date: the project's budget prorated to how far through its window it is
export function expectedToDate(p) {
  const frac = Math.max(0, Math.min(1, (NOW - p.startMs) / ((p.endMs - p.startMs) || 1)))
  return Math.round(p.budget * frac)
}

// ---- forecasting for analytics ----
// KPIs whose future is known from the schedule or from committed budgets, so they are drawn as
// known lines, never extrapolated. Everything else is forecast from its own history.
export const KNOWN_KEYS = new Set(['capacity', 'personPct', 'oversub', 'committed', 'projects', 'planned'])
const HOURS_MONTH = (365.25 / 12) * 24

function _stdev(a) { if (a.length < 2) return 0; const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) }
function _linreg(ys) { const n = ys.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxx += i * i; sxy += i * ys[i] } const d = (n * sxx - sx * sx) || 1; const slope = (n * sxy - sx * sy) / d; return { slope, intercept: (sy - slope * sx) / n } }
// how many periods make up the fit window, from a lookback in months (0 = use all history).
// Kept as a fixed duration so weekly, monthly and quarterly all look back a comparable span
// and short-window noise does not dominate at fine cadence.
export function lookbackPeriods(cadence, months) {
  if (!months || months <= 0) return Infinity
  if (cadence === 'week') return Math.max(4, Math.round(months * (365.25 / 12) / 7))
  if (cadence === 'quarter') return Math.max(2, Math.round(months / 3))
  return Math.max(2, Math.round(months))
}
// fit a model to the history; returns a predictor for h steps past the last point, the per-step
// slope, and the residual spread used for the band. method: 'last' | 'linear' | 'smooth'.
// `seg` is the already-windowed history.
function _fit(seg, method) {
  const n = seg.length
  if (method === 'last') { const diffs = seg.slice(1).map((v, i) => v - seg[i]); return { predict: () => seg[n - 1], slope: 0, sigma: _stdev(diffs) } }
  if (method === 'smooth') {
    const a = 0.4, b = 0.15; let level = seg[0], trend = (seg[1] ?? seg[0]) - seg[0]; const err = []
    for (let i = 1; i < n; i++) { err.push(seg[i] - (level + trend)); const nl = a * seg[i] + (1 - a) * (level + trend); trend = b * (nl - level) + (1 - b) * trend; level = nl }
    return { predict: (h) => level + trend * h, slope: trend, sigma: _stdev(err) }
  }
  const { slope, intercept } = _linreg(seg)
  const resid = seg.map((y, i) => y - (intercept + slope * i))
  return { predict: (h) => intercept + slope * (n - 1 + h), slope, sigma: _stdev(resid) }
}
// forecast nAhead points with an ~p10/p90 band (widening with horizon). W = fit-window length.
export function forecastValues(ysIn, nAhead, method = 'linear', W = Infinity) {
  const ys = ysIn.filter((v) => v != null)
  if (ys.length < 2) { const last = ys.length ? ys[ys.length - 1] : 0; return { point: Array(nAhead).fill(last), lo: Array(nAhead).fill(last), hi: Array(nAhead).fill(last), slope: 0 } }
  const seg = W === Infinity ? ys : ys.slice(-Math.min(W, ys.length))
  const f = _fit(seg, method); const point = [], lo = [], hi = []
  for (let h = 1; h <= nAhead; h++) { const p = f.predict(h); const band = 1.28 * f.sigma * Math.sqrt(h); point.push(p); lo.push(p - band); hi.push(p + band) }
  return { point, lo, hi, slope: f.slope }
}
// per-KPI forecast aligned to the forecast buckets of kpiSeries(cadence); null for known keys.
// lookMonths sets the fit window as a fixed duration (0 = all history).
// horizonMonths caps how far ahead the forecast runs (0 = to the end of the period)
function horizonCutoff(months) { return months > 0 ? NOW + months * HOURS_MONTH * HOUR : Infinity }
export function kpiForecast(key, cadence = 'month', method = 'linear', lookMonths = 6, horizonMonths = 0) {
  if (KNOWN_KEYS.has(key)) return null
  const s = kpiSeries(cadence)
  const cut = horizonCutoff(horizonMonths)
  // utilisation is demand over capacity, and capacity is known ahead. Forecast the demand, then
  // divide by each future bucket's scheduled capacity, so a planned capacity increase lowers it.
  if (key === 'util') {
    const dem = s.filter((p) => !p.forecast && !p.partial).map((p) => p.demandGpuh)
    const futs = s.filter((p) => (p.forecast || p.partial) && p.t0 < cut)
    if (!futs.length) return { point: [], lo: [], hi: [], slope: 0 }
    const fc = forecastValues(dem, futs.length, method, lookbackPeriods(cadence, lookMonths))
    const toPct = (arr) => arr.map((v, i) => Math.round((v / (capacityHoursBetween(futs[i].t0, futs[i].t1) || 1)) * 100))
    return { point: toPct(fc.point), lo: toPct(fc.lo), hi: toPct(fc.hi), slope: fc.slope }
  }
  // the in-progress period is incomplete, so it neither seeds the fit nor is drawn as an actual;
  // the forecast covers it plus the future buckets, up to the chosen horizon.
  const act = s.filter((p) => !p.forecast && !p.partial).map((p) => p[key])
  const nAhead = s.filter((p) => (p.forecast || p.partial) && p.t0 < cut).length
  if (!nAhead) return { point: [], lo: [], hi: [], slope: 0 }
  return forecastValues(act, nAhead, method, lookbackPeriods(cadence, lookMonths))
}

// Resource outlook: capacity, committed entitlement and realised demand as average GPUs, with a
// forecast of realised demand, plus the decision statistics for acquisition (growth, runway to the
// saturation threshold, whether that runway is inside the procurement lead time).
export function resourceOutlook(cadence = 'month', method = 'linear', leadMonths = 3, lookMonths = 6, horizonMonths = 0) {
  const THRESH = 0.85
  const cut = horizonCutoff(horizonMonths)
  const perMonth = cadence === 'week' ? ((365.25 / 12) / 7) : cadence === 'quarter' ? (1 / 3) : 1
  const rows = mkBuckets(cadence).map((b) => {
    const mid = (b.t0 + b.t1) / 2
    const hours = (b.t1 - b.t0) / HOUR
    let use = null
    if (!b.forecast) { const effEnd = Math.min(b.t1, NOW); const eh = Math.max(1, (effEnd - b.t0) / HOUR); let g = 0; for (const u of loadUnits) { const s = Math.max(u.start, b.t0), e = Math.min(u.end, effEnd); if (e > s) g += u.gpus * (e - s) / HOUR } use = Math.round(g / eh) }
    return { period: b.label, t0: b.t0, forecast: b.forecast, partial: !!b.partial, capacity: Math.round(effectiveGpus(mid)), threshold: Math.round(effectiveGpus(mid) * THRESH), committed: Math.round(plannedProjBucket(b.t0, b.t1) / hours), use }
  })
  // exclude the in-progress (partial) period from the fit; forecast covers it plus the future,
  // up to the chosen horizon
  const actUse = rows.filter((r) => !r.forecast && !r.partial).map((r) => r.use)
  const nAhead = rows.filter((r) => (r.forecast || r.partial) && r.t0 < cut).length
  const fc = forecastValues(actUse, nAhead, method, lookbackPeriods(cadence, lookMonths))
  const lastIdx = rows.map((r) => r.forecast || r.partial).lastIndexOf(false)
  let fi = 0
  for (const r of rows) { if (r.forecast || r.partial) { if (fi < nAhead) { r.useFc = Math.max(0, Math.round(fc.point[fi])); r.useLo = Math.max(0, Math.round(fc.lo[fi])); r.useHi = Math.max(0, Math.round(fc.hi[fi])) } fi++; if (r.partial) r.use = null } }
  if (lastIdx >= 0) { rows[lastIdx].useFc = rows[lastIdx].use; rows[lastIdx].useLo = rows[lastIdx].use; rows[lastIdx].useHi = rows[lastIdx].use }
  const capNow = rows[lastIdx]?.capacity || Math.round(effectiveGpus(NOW))
  const useNow = rows[lastIdx]?.use || 0
  const cross = (field, factorField) => { for (const r of rows) { if ((r.forecast || r.partial) && r[field] != null && r[field] >= r[factorField]) return r } return null }
  const xThresh = cross('useFc', 'threshold')
  const xThreshHigh = cross('useHi', 'threshold')
  const xFull = cross('useFc', 'capacity')
  const monthsTo = (r) => (r ? Math.max(0, Math.round((r.t0 - NOW) / (HOURS_MONTH * HOUR))) : null)
  const runway = monthsTo(xThresh)
  return {
    rows,
    stats: {
      capNow, useNow, idlePct: Math.round((1 - useNow / (capNow || 1)) * 100),
      utilNow: Math.round((useNow / (capNow || 1)) * 100),
      growthPerMonth: Math.round(fc.slope * perMonth),
      growthPct: useNow ? +(((fc.slope * perMonth) / useNow) * 100).toFixed(1) : null,
      thresholdPct: Math.round(THRESH * 100),
      crossThresh: xThresh?.period || null, crossThreshHigh: xThreshHigh?.period || null, crossFull: xFull?.period || null,
      runwayMonths: runway, runwayHighMonths: monthsTo(xThreshHigh), leadMonths, atRisk: runway != null && runway <= leadMonths,
    },
  }
}
