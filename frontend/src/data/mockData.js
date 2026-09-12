// Synthetic POC dataset for faircenter, built at the job level.
//
// The whole picture is derived from individual jobs, the way it would be from
// SLURM's accounting database (sacct): each job has a submit, start and end
// time, a GPU count, an owning project and person, and a lane (QOS). The load
// on the cluster at any instant is the sum of GPUs held by jobs running then,
// which only changes when a job starts or ends, so the true series is an
// irregular step function. Projects start, run for varied spans and end across
// a 16-month window, so teams cycle through several over time.
//
// Everything here is generated deterministically from a seed, so it is stable
// across renders while being large and realistic enough to argue that, with
// this much history, forecasts and parameter tuning become an ML problem.

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

// --- timeline ---
const START = Date.UTC(2025, 4, 1)          // 2025-05-01
const NOW = Date.UTC(2026, 8, 12, 14, 0)    // 2026-09-12 14:00
const END = Date.UTC(2026, 11, 31)          // 2026-12-31 (planning horizon)

export const period = {
  name: 'May 2025 – Dec 2026',
  startMs: START,
  nowMs: NOW,
  endMs: END,
}

export const cluster = { gpus: 1024 }

// date/time formatting from a timestamp
export function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}
export function fmtDay(ms) {
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
export function fmtDateTime(ms) {
  const d = new Date(ms)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
export function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10) }

// --- deterministic RNG ---
function makeRng(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff }
}
const rng = makeRng(20260912)
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const between = (a, b) => a + rng() * (b - a)
const chance = (p) => rng() < p
// weighted pick: items [[value, weight], ...]
function wpick(items) {
  const total = items.reduce((s, i) => s + i[1], 0)
  let r = rng() * total
  for (const [v, w] of items) { r -= w; if (r <= 0) return v }
  return items[items.length - 1][0]
}

// --- teams ---
const TEAM_NAMES = [
  'Pretraining', 'Fine-tuning', 'Evaluation', 'Alignment', 'Multimodal', 'Speech',
  'Code models', 'Reasoning', 'Retrieval', 'Data curation', 'Efficiency', 'Serving',
  'Safety', 'Red-team', 'Agents', 'Long-context', 'Tokeniser', 'Distillation',
  'Robustness', 'Research infra',
]
export const teams = TEAM_NAMES.map((name, i) => ({ id: 't' + i, name, budget: 0 }))
const TEAM_HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#8b5cf6', '#e8368f', '#0ea5b7', '#eda100', '#6366f1',
  '#14b8a6', '#f43f5e', '#84cc16', '#06b6d4', '#a855f7', '#f97316', '#22c55e', '#3b82f6',
  '#ec4899', '#10b981', '#f59e0b', '#7c3aed']
export const teamHue = Object.fromEntries(teams.map((t, i) => [t.id, TEAM_HUES[i % TEAM_HUES.length]]))

// --- people ---
const FIRST = ['Ada', 'Alan', 'Grace', 'Ravi', 'Lena', 'Omar', 'Mei', 'Jonas', 'Sara', 'Nadia', 'Priya',
  'Leo', 'Yuki', 'Ines', 'Tariq', 'Nina', 'Diego', 'Aisha', 'Karl', 'Sofia', 'Hassan', 'Marta',
  'Ivan', 'Zara', 'Paulo', 'Emma', 'Noah', 'Lucia', 'Kofi', 'Wei', 'Anya', 'Ben', 'Chloe', 'Dmitri',
  'Elena', 'Farid', 'Gita', 'Hugo', 'Iris', 'Jamal', 'Kira', 'Liam', 'Maya', 'Nils', 'Ola', 'Pia']
const LAST = ['Lovelace', 'Turing', 'Hopper', 'Patel', 'Hart', 'Diallo', 'Chen', 'Weber', 'Nkosi', 'Rahman',
  'Nair', 'Rossi', 'Sato', 'Costa', 'Haddad', 'Kim', 'Silva', 'Bello', 'Berg', 'Moreau', 'Yilmaz',
  'Novak', 'Petrov', 'Khan', 'Mendes', 'Olsen', 'Fischer', 'Ivanova', 'Mensah', 'Zhang', 'Park',
  'Ali', 'Dubois', 'Green', 'Haas', 'Ibrahim', 'Jensen', 'Kaur', 'Lund', 'Marsh', 'Osei', 'Reyes']

const N_PEOPLE = 300
export const people = []
{
  const used = new Set()
  for (let i = 0; i < N_PEOPLE; i++) {
    let name
    do { name = pick(FIRST) + ' ' + pick(LAST) } while (used.has(name) && used.size < FIRST.length * LAST.length)
    used.add(name)
    // most on one team, some on two
    const home = Math.floor(rng() * teams.length)
    const teamIds = [teams[home].id]
    if (chance(0.18)) { const t2 = pick(teams).id; if (t2 !== teamIds[0]) teamIds.push(t2) }
    people.push({ id: 'p' + i, name, teamIds, projectIds: [], budget: 0 })
  }
}
// one lead per team, plus a small ops group
teams.forEach((t) => {
  const member = people.find((p) => p.teamIds[0] === t.id)
  if (member) member.role = 'lead'
})
for (let i = 0; i < 4; i++) people[N_PEOPLE - 1 - i].role = 'ops'

// --- projects ---
// Each team runs a sequence of projects across the timeline, of varied length,
// so at any moment some are finished, some active and some planned. A handful
// are org-funded or personal.
const FUND = [['team', 0.82], ['org', 0.12], ['person', 0.06]]
const TIER = [['high', 0.25], ['medium', 0.45], ['low', 0.30]]
const PROJ_WORDS = ['v2', 'v3', 'v4', 'base', 'large', 'mini', 'turbo', 'pro', 'lite', 'next',
  'alpha', 'beta', 'phase 1', 'phase 2', 'sprint', 'sweep', 'audit', 'bench', 'pilot', 'scale']
export const projects = []
let pid = 0
teams.forEach((t) => {
  // fill the timeline with back-to-back-ish projects, overlapping a little
  let cursor = START + Math.floor(rng() * 40 * DAY)
  const nProjects = 3 + Math.floor(rng() * 3) // 3..5 per team over the window
  for (let k = 0; k < nProjects && cursor < END; k++) {
    const durDays = Math.round(between(30, 240)) // 1 to 8 months
    const startMs = cursor
    const endMs = Math.min(END, startMs + durDays * DAY)
    const funding = k === 0 ? 'team' : wpick(FUND)
    const avgGpus = wpick([[8, 4], [16, 5], [24, 3], [32, 3], [48, 2], [64, 1.5], [96, 0.8], [128, 0.4]])
    const windowHours = (endMs - startMs) / HOUR
    const budget = Math.round(avgGpus * windowHours) // GPU-h over its life
    const p = {
      id: 'prj' + pid, name: `${t.name} ${pick(PROJ_WORDS)}`, funding,
      teamId: funding === 'person' ? undefined : t.id,
      personId: undefined,
      budget, used: 0, priority: wpick(TIER),
      start: isoDate(startMs), end: isoDate(endMs), startMs, endMs, avgGpus,
    }
    projects.push(p); pid++
    // next project starts a little before/after this one ends
    cursor = endMs - Math.floor(rng() * 20 * DAY) + Math.floor(rng() * 40 * DAY)
  }
})
// a few org-level projects with no owning team
for (let k = 0; k < 4; k++) {
  const startMs = START + Math.floor(rng() * 300 * DAY)
  const durDays = Math.round(between(60, 220))
  const endMs = Math.min(END, startMs + durDays * DAY)
  const avgGpus = wpick([[16, 3], [32, 3], [64, 2], [96, 1]])
  const windowHours = (endMs - startMs) / HOUR
  projects.push({
    id: 'prj' + pid, name: `Infra ${pick(PROJ_WORDS)}`, funding: 'org', teamId: undefined, personId: undefined,
    budget: Math.round(avgGpus * windowHours), used: 0, priority: wpick(TIER),
    start: isoDate(startMs), end: isoDate(endMs), startMs, endMs, avgGpus,
  })
  pid++
}
// assign people to projects (staffing) and set personal-project owners
projects.forEach((p) => {
  if (p.funding === 'person') {
    const owner = pick(people)
    p.personId = owner.id
    p.name = owner.name.split(' ')[0] + ' (personal)'
    p.teamId = undefined
    owner.projectIds.push(p.id)
    return
  }
  const pool = p.teamId ? people.filter((pp) => pp.teamIds.includes(p.teamId)) : people
  const n = 2 + Math.floor(rng() * 6)
  for (let i = 0; i < n; i++) {
    const person = pool.length ? pool[Math.floor(rng() * pool.length)] : pick(people)
    if (!person.projectIds.includes(p.id)) person.projectIds.push(p.id)
  }
})

// --- jobs ---
// For each project, generate jobs across its window up to now, with diurnal and
// weekday weighting, until the project has consumed roughly the share of its
// budget its elapsed fraction implies. Future projects have no jobs yet.
const GPU_SIZES = [[1, 3], [2, 3], [4, 4], [8, 5], [16, 4], [32, 2.5], [64, 1.2], [128, 0.5]]
const LANE_W = [['bulk', 3], ['standard', 5], ['fast', 2]]
export const jobs = []
let jid = 0
function diurnalWeight(ms) {
  const d = new Date(ms)
  const hour = d.getUTCHours()
  const dow = d.getUTCDay() // 0 Sun..6 Sat
  const work = 0.5 + 0.5 * Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.5 + 0.5)
  const week = (dow === 0 || dow === 6) ? 0.55 : 1
  return work * week
}
projects.forEach((p) => {
  const jr = makeRng(hashStr(p.id))
  const windowHours = (p.endMs - p.startMs) / HOUR
  if (p.startMs >= NOW) { // planned, no jobs yet
    p.used = 0
    p.budget = Math.round(p.avgGpus * windowHours)
    return
  }
  const activeEnd = Math.min(p.endMs, NOW)
  const span = activeEnd - p.startMs
  const windowDays = (p.endMs - p.startMs) / DAY
  // a realistic-but-bounded number of jobs; bigger/longer projects run more
  const jobCount = Math.min(220, 12 + Math.floor(jr() * windowDays * (0.6 + p.avgGpus / 64)))
  let sum = 0
  for (let k = 0; k < jobCount; k++) {
    let submit, tries = 0
    do { submit = p.startMs + jr() * span; tries++ } while (jr() > diurnalWeight(submit) && tries < 6)
    const start = submit + jr() * 40 * 60 * 1000 // up to 40 min queue
    const gpus = wpickR(GPU_SIZES, jr)
    const durH = Math.exp(between2(jr, Math.log(0.5), Math.log(60))) // 0.5h .. ~60h
    const end = Math.min(activeEnd + 2 * HOUR, start + durH * HOUR)
    if (end <= start) continue
    jobs.push({ id: 'j' + jid, projectId: p.id, personId: pickProjectPerson(p, jr), gpus, lane: wpickR(LANE_W, jr), submit, start, end })
    jid++
    sum += gpus * (end - start) / HOUR
  }
  p.used = Math.round(sum)
  const progress = Math.max(0.2, Math.min(1, (NOW - p.startMs) / (p.endMs - p.startMs)))
  // budget derived so the project sits at a plausible fraction of it now
  p.budget = Math.max(p.used, Math.round(p.used / progress * between2(jr, 1.0, 1.35)))
})

function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function wpickR(items, r) { const total = items.reduce((s, i) => s + i[1], 0); let x = r() * total; for (const [v, w] of items) { x -= w; if (x <= 0) return v } return items[items.length - 1][0] }
function between2(r, a, b) { return a + r() * (b - a) }
function pickProjectPerson(p, r) {
  const pool = people.filter((pp) => pp.projectIds.includes(p.id))
  if (pool.length) return pool[Math.floor(r() * pool.length)].id
  return p.personId || people[Math.floor(r() * people.length)].id
}

// team budgets = sum of their (non-personal) project budgets
teams.forEach((t) => {
  t.budget = projects.filter((p) => p.teamId === t.id && p.funding !== 'person').reduce((s, p) => s + p.budget, 0)
})

// --- reservations (near now and future) ---
export const reservations = []
{
  const activeish = projects.filter((p) => p.endMs > NOW - 10 * DAY && p.startMs < NOW + 40 * DAY)
  for (let i = 0; i < 10 && i < activeish.length; i++) {
    const p = activeish[Math.floor(rng() * activeish.length)]
    const s = NOW - 5 * DAY + Math.floor(rng() * 30 * DAY)
    const dur = (1 + Math.floor(rng() * 3)) * DAY
    reservations.push({
      id: 'r' + i, projectId: p.id, label: pick(['Full-cluster run', 'Release eval', 'Audit sweep', 'Benchmark', 'Ablation']),
      gpus: wpick([[16, 3], [32, 3], [64, 2], [128, 1]]), startMs: s, endMs: s + dur,
      start: isoDate(s), end: isoDate(s + dur),
    })
  }
}

// --- policy parameters ---
export const lanes = {
  bulk: { key: 'bulk', label: 'bulk', factor: 0.7, priority: -50, enabled: true },
  standard: { key: 'standard', label: 'standard', factor: 1.0, priority: 0, enabled: true },
  fast: { key: 'fast', label: 'fast', factor: 1.5, priority: 100, enabled: true },
}
export const parameters = {
  headroom: { org: 0.10, team: 0.10, project: 0.05 },
  oversubscriptionFactor: 1.1,
  timeOfUse: { office: 1.0, off: 0.5 },
  weights: { accountVsLane: 1.0, teamVsProject: 0.5 },
  lanes,
  toggles: { lanes: true, timeOfUse: true, headroom: true, oversubscription: true, teamStanding: false },
}

export const requests = [
  { id: 'req-1', type: 'budget change', subject: 'Pretraining v4 +40,000 GPU-h', requestedBy: people[0].name, routedTo: 'Operations', status: 'pending', warning: 'Would take the Pretraining budget past its limit.' },
  { id: 'req-2', type: 'new project', subject: 'Long-context evaluation', requestedBy: people[6].name, routedTo: 'Evaluation lead', status: 'pending', warning: null },
  { id: 'req-3', type: 'priority change', subject: 'Raise Reasoning v3 to high', requestedBy: people[1].name, routedTo: 'Direction', status: 'pending', warning: null },
  { id: 'req-4', type: 'budget change', subject: 'Red-team sweep +8,000 GPU-h', requestedBy: people[8].name, routedTo: 'Evaluation lead', status: 'approved', warning: null },
]

// --- lookups ---
export const orgPool = projects.reduce((s, p) => s + p.budget, 0)
export function teamById(id) { return teams.find((t) => t.id === id) }
export function personById(id) { return people.find((p) => p.id === id) }
export function projectById(id) { return projects.find((p) => p.id === id) }
export function teamsForPerson(person) { return (person.teamIds ?? []).map(teamById).filter(Boolean) }
export function primaryTeam(person) { return teamsForPerson(person)[0] }
export function projectsForPerson(person) { return (person.projectIds ?? []).map(projectById).filter(Boolean) }
export function peopleForProject(projectId) { return people.filter((p) => (p.projectIds ?? []).includes(projectId)) }
export const leads = people.filter((p) => p.role === 'lead')
export const opsPeople = people.filter((p) => p.role === 'ops')

export function projectOwner(prj) {
  if (prj.funding === 'team') return teamById(prj.teamId)?.name ?? 'team'
  if (prj.funding === 'person') return personById(prj.personId)?.name ?? 'person'
  return 'Organisation'
}
export function ownerBucket(prj) {
  if (prj.funding === 'team') return teamById(prj.teamId)?.name
  if (prj.funding === 'person') return 'Personal'
  return 'Organisation'
}
export function pctOfOrg(v) { return Math.round((v / orgPool) * 100) }
export function priorityTier(project) { return project.funding === 'person' ? null : (project.priority || 'medium') }

// project state at `now`
export function projectState(p) {
  if (p.startMs > NOW) return 'planned'
  if (p.endMs < NOW) return 'finished'
  return 'active'
}
export function activeProjects(atMs = NOW) { return projects.filter((p) => p.startMs <= atMs && p.endMs >= atMs) }

// --- job-derived series ---
// Concurrent GPUs held at an instant across a set of projects.
export function runningAt(projIds, atMs) {
  const set = new Set(projIds)
  let g = 0
  for (const j of jobs) { if (set.has(j.projectId) && j.start <= atMs && j.end > atMs) g += j.gpus }
  return g
}

// Recent daily consumption rate (GPU-h/day) of a project over the last `days`.
export function recentDailyRate(project, days = 14) {
  const from = NOW - days * DAY
  let gpuH = 0
  for (const j of jobs) {
    if (j.projectId !== project.id) continue
    const s = Math.max(j.start, from), e = Math.min(j.end, NOW)
    if (e > s) gpuH += j.gpus * (e - s) / HOUR
  }
  return gpuH / days
}

// Build a stacked load series (concurrent GPUs) for the given projects over
// [t0, t1], keyed into buckets by keyOf(project). Narrow windows return the raw
// step function from job events; wide windows return a daily mean-concurrency
// series. Either way the points are real, to be drawn as steps with no
// interpolation between them.
export function loadSeries(projList, t0, t1, keyOf) {
  const bucketOf = {}
  for (const p of projList) bucketOf[p.id] = keyOf(p)
  const set = new Set(projList.map((p) => p.id))
  const buckets = [...new Set(projList.map((p) => keyOf(p)))]
  const raw = (t1 - t0) <= 14 * DAY

  if (raw) {
    const evts = []
    for (const j of jobs) {
      if (!set.has(j.projectId)) continue
      if (j.end <= t0 || j.start >= t1) continue
      evts.push([Math.max(j.start, t0), j.gpus, bucketOf[j.projectId]])
      evts.push([Math.min(j.end, t1), -j.gpus, bucketOf[j.projectId]])
    }
    evts.sort((a, b) => a[0] - b[0])
    const cur = Object.fromEntries(buckets.map((b) => [b, 0]))
    const rows = []
    let i = 0
    // initial row at t0
    rows.push({ t: t0, ...cur })
    while (i < evts.length) {
      const time = evts[i][0]
      while (i < evts.length && evts[i][0] === time) { cur[evts[i][2]] += evts[i][1]; i++ }
      rows.push({ t: time, ...cur })
    }
    rows.push({ t: t1, ...cur })
    return { rows, buckets, mode: 'raw' }
  }

  // daily mean concurrency
  const d0 = Math.floor(t0 / DAY), d1 = Math.ceil(t1 / DAY)
  const nDays = d1 - d0
  const grid = new Map() // dayIndex -> {bucket: gpuH}
  for (let d = 0; d < nDays; d++) grid.set(d, Object.fromEntries(buckets.map((b) => [b, 0])))
  for (const j of jobs) {
    if (!set.has(j.projectId)) continue
    if (j.end <= t0 || j.start >= t1) continue
    const b = bucketOf[j.projectId]
    let s = Math.max(j.start, t0), e = Math.min(j.end, t1)
    // distribute the job's GPU-hours into the day buckets it spans
    while (s < e) {
      const dayIdx = Math.floor(s / DAY) - d0
      const dayEnd = (Math.floor(s / DAY) + 1) * DAY
      const seg = Math.min(e, dayEnd) - s
      if (grid.has(dayIdx)) grid.get(dayIdx)[b] += j.gpus * seg / HOUR
      s = dayEnd
    }
  }
  const rows = []
  for (let d = 0; d < nDays; d++) {
    const row = { t: (d0 + d) * DAY }
    const g = grid.get(d)
    for (const b of buckets) row[b] = +(g[b] / 24).toFixed(1) // mean concurrency that day
    rows.push(row)
  }
  return { rows, buckets, mode: 'daily' }
}

// Forecast future load (mean concurrent GPUs, daily) from each project's recent
// rate, capped at the budget it has left, with reservations flooring their days.
export function forecastSeries(projList, tNow, t1, keyOf) {
  const buckets = [...new Set(projList.map(keyOf))]
  const d0 = Math.floor(tNow / DAY), d1 = Math.ceil(t1 / DAY)
  const remaining = {}, rate = {}
  for (const p of projList) { remaining[p.id] = Math.max(0, p.budget - p.used); rate[p.id] = recentDailyRate(p) }
  const rows = []
  for (let d = d0; d < d1; d++) {
    const dayStart = d * DAY, dayEnd = (d + 1) * DAY
    const acc = Object.fromEntries(buckets.map((b) => [b, 0]))
    for (const p of projList) {
      const b = keyOf(p)
      let meanG = 0
      if (dayEnd > p.startMs && dayStart < p.endMs) {
        let gpuh = Math.min(rate[p.id], remaining[p.id])
        remaining[p.id] -= gpuh
        meanG = gpuh / 24
      }
      let resG = 0
      for (const r of reservations) if (r.projectId === p.id && r.endMs > dayStart && r.startMs < dayEnd) resG = Math.max(resG, r.gpus)
      acc[b] += Math.max(meanG, resG)
    }
    const row = { t: Math.max(dayStart, tNow), forecast: true }
    for (const b of buckets) row[b] = +acc[b].toFixed(1)
    rows.push(row)
  }
  return { rows, buckets }
}

// Consumed GPU-hours across projects within a window.
export function consumedGpuH(projList, t0, t1) {
  const set = new Set(projList.map((p) => p.id))
  let g = 0
  for (const j of jobs) {
    if (!set.has(j.projectId)) continue
    const s = Math.max(j.start, t0), e = Math.min(j.end, t1)
    if (e > s) g += j.gpus * (e - s) / HOUR
  }
  return Math.round(g)
}

// --- cross-period KPI history for Analytics (independent, illustrative) ---
export const kpiHistory = [
  { period: 'Apr', forecast: false, util: 61, consumed: 290000, committed: 330000, waitFast: 15, waitStd: 44, spent50: 47, changes: 21, overBudget: 3, unusedHeadroom: 9, alignment: 0.72 },
  { period: 'May', forecast: false, util: 66, consumed: 310000, committed: 360000, waitFast: 13, waitStd: 42, spent50: 49, changes: 24, overBudget: 4, unusedHeadroom: 8, alignment: 0.75 },
  { period: 'Jun', forecast: false, util: 72, consumed: 340000, committed: 380000, waitFast: 11, waitStd: 41, spent50: 51, changes: 26, overBudget: 5, unusedHeadroom: 7, alignment: 0.78 },
  { period: 'Jul', forecast: false, util: 78, consumed: 370000, committed: 410000, waitFast: 9, waitStd: 40, spent50: 52, changes: 22, overBudget: 6, unusedHeadroom: 7, alignment: 0.80 },
  { period: 'Aug', forecast: false, util: 83, consumed: 400000, committed: 440000, waitFast: 8, waitStd: 41, spent50: 52, changes: 28, overBudget: 6, unusedHeadroom: 6, alignment: 0.83 },
  { period: 'Sep', forecast: false, util: 86, consumed: 420000, committed: 460000, waitFast: 7, waitStd: 41, spent50: 52, changes: 27, overBudget: 5, unusedHeadroom: 6, alignment: 0.84 },
  { period: 'Oct', forecast: true, util: 88, consumed: 440000, committed: 470000, waitFast: 8, waitStd: 42, spent50: 53, changes: 25, overBudget: 6, unusedHeadroom: 6, alignment: 0.84 },
  { period: 'Nov', forecast: true, util: 90, consumed: 455000, committed: 480000, waitFast: 8, waitStd: 43, spent50: 54, changes: 25, overBudget: 6, unusedHeadroom: 5, alignment: 0.85 },
]
export const paramEvents = [
  { period: 'Jun', label: 'fast lane +50 priority' },
  { period: 'Aug', label: 'headroom 10% → 8%' },
]
export const KPIS = [
  { key: 'util', label: 'Utilisation', unit: '%', better: 'high' },
  { key: 'consumed', label: 'Consumed', unit: 'GPU-h', better: 'neutral' },
  { key: 'committed', label: 'Committed demand', unit: 'GPU-h', better: 'neutral' },
  { key: 'waitFast', label: 'Median wait, fast lane', unit: 'min', better: 'low' },
  { key: 'waitStd', label: 'Median wait, standard', unit: 'min', better: 'low' },
  { key: 'spent50', label: 'Budget spent at mid-period', unit: '%', better: 'neutral' },
  { key: 'changes', label: 'Change requests', unit: '', better: 'low' },
  { key: 'overBudget', label: 'Projects over budget', unit: '', better: 'low' },
  { key: 'unusedHeadroom', label: 'Unused headroom', unit: '%', better: 'low' },
  { key: 'alignment', label: 'Priority–usage alignment', unit: '', better: 'high' },
]
