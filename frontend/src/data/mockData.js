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
  ...FLAGSHIP.map((name, i) => ({ id: 't' + i, name, flagship: true, budget: 0 })),
  ...SUPPORT.map((name, i) => ({ id: 't' + (FLAGSHIP.length + i), name, flagship: false, budget: 0 })),
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
const FUND = [['team', 0.84], ['org', 0.1], ['person', 0.06]]
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
for (let k = 0; k < 4; k++) {
  const startMs = START + Math.floor(rng() * 300 * DAY)
  const endMs = Math.min(END, startMs + Math.round(b2(rng, 60, 220)) * DAY)
  projects.push({ id: 'prj' + pid, name: `Infra ${pick(WORDS)}`, funding: 'org', teamId: undefined, personId: undefined, budget: 0, used: 0, priority: wpickR(TIER, rng), start: isoDate(startMs), end: isoDate(endMs), startMs, endMs, avgGpus: wpickR([[16, 3], [32, 3], [64, 2]], rng) })
  pid++
}
projects.forEach((p) => {
  if (p.funding === 'person') { const o = pick(people); p.personId = o.id; p.name = o.name.split(' ')[0] + ' (personal)'; p.teamId = undefined; o.projectIds.push(p.id); return }
  const pool = p.teamId ? people.filter((pp) => pp.teamIds.includes(p.teamId)) : people
  const n = 2 + Math.floor(rng() * 6)
  for (let i = 0; i < n; i++) { const person = pool.length ? pool[Math.floor(rng() * pool.length)] : pick(people); if (!person.projectIds.includes(p.id)) person.projectIds.push(p.id) }
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
  const started = projects.filter((p) => p.startMs < END)
  const RES_LABEL = ['Full-cluster run', 'Release eval', 'Audit sweep', 'Benchmark', 'Ablation', 'Scaling run', 'Safety eval']
  for (let i = 0; i < 34; i++) {
    const p = started[Math.floor(rng() * started.length)]
    const s = Math.max(p.startMs, p.startMs + rng() * Math.max(DAY, (p.endMs - p.startMs)))
    const durDays = wpickR([[2, 4], [4, 3], [7, 3], [14, 1.5], [21, 0.7]], rng)
    const e = Math.min(p.endMs, s + durDays * DAY)
    if (e <= s) continue
    reservations.push({ id: 'r' + i, projectId: p.id, label: pick(RES_LABEL), gpus: wpickR([[16, 3], [32, 3], [64, 2], [128, 1], [256, 0.4]], rng), startMs: s, endMs: e, start: isoDate(s), end: isoDate(e) })
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

// load units = jobs + reservation holds (reserved GPUs run for their window)
const loadUnits = [...jobs.map((j) => ({ projectId: j.projectId, gpus: j.gpus, start: j.start, end: j.end })),
  ...reservations.map((r) => ({ projectId: r.projectId, gpus: r.gpus, start: r.startMs, end: r.endMs }))]

// --- policy / requests ---
export const lanes = {
  bulk: { key: 'bulk', label: 'bulk', factor: 0.7, priority: -50, enabled: true },
  standard: { key: 'standard', label: 'standard', factor: 1.0, priority: 0, enabled: true },
  fast: { key: 'fast', label: 'fast', factor: 1.5, priority: 100, enabled: true },
}
export const parameters = {
  headroom: { org: 0.10, team: 0.10, project: 0.05 }, oversubscriptionFactor: 1.1,
  timeOfUse: { office: 1.0, off: 0.5 }, weights: { accountVsLane: 1.0, teamVsProject: 0.5 }, lanes,
  toggles: { lanes: true, timeOfUse: true, headroom: true, oversubscription: true, teamStanding: false },
}
export const requestsList = [
  { id: 'req-1', type: 'budget change', subject: 'Voxtral v3 +40,000 GPU-h', requestedBy: people[0].name, routedTo: 'Operations', status: 'pending', warning: 'Would take the Voxtral budget past its limit.' },
  { id: 'req-2', type: 'new project', subject: 'Long-context evaluation', requestedBy: people[6].name, routedTo: 'Evaluation lead', status: 'pending', warning: null },
  { id: 'req-3', type: 'priority change', subject: 'Raise Mathstral v2 to high', requestedBy: people[1].name, routedTo: 'Direction', status: 'pending', warning: null },
  { id: 'req-4', type: 'budget change', subject: 'Red-team sweep +8,000 GPU-h', requestedBy: people[8].name, routedTo: 'Evaluation lead', status: 'approved', warning: null },
]
export { requestsList as requests }

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

export function loadSeries(projList, t0, t1, keyOf) {
  const bucketOf = {}; for (const p of projList) bucketOf[p.id] = keyOf(p)
  const set = new Set(projList.map((p) => p.id))
  const buckets = [...new Set(projList.map((p) => keyOf(p)))]
  const raw = (t1 - t0) <= 14 * DAY
  if (raw) {
    const evts = []
    for (const u of loadUnits) { if (!set.has(u.projectId) || u.end <= t0 || u.start >= t1) continue; evts.push([Math.max(u.start, t0), u.gpus, bucketOf[u.projectId]]); evts.push([Math.min(u.end, t1), -u.gpus, bucketOf[u.projectId]]) }
    evts.sort((a, b) => a[0] - b[0])
    const cur = Object.fromEntries(buckets.map((b) => [b, 0])); const rows = [{ t: t0, ...cur }]; let i = 0
    while (i < evts.length) { const time = evts[i][0]; while (i < evts.length && evts[i][0] === time) { cur[evts[i][2]] += evts[i][1]; i++ } rows.push({ t: time, ...cur }) }
    rows.push({ t: t1, ...cur })
    return { rows, buckets, mode: 'raw' }
  }
  const d0 = Math.floor(t0 / DAY), d1 = Math.ceil(t1 / DAY), nDays = d1 - d0
  const grid = new Map(); for (let d = 0; d < nDays; d++) grid.set(d, Object.fromEntries(buckets.map((b) => [b, 0])))
  for (const u of loadUnits) {
    if (!set.has(u.projectId) || u.end <= t0 || u.start >= t1) continue
    const b = bucketOf[u.projectId]; let s = Math.max(u.start, t0); const e = Math.min(u.end, t1)
    while (s < e) { const di = Math.floor(s / DAY) - d0; const de = (Math.floor(s / DAY) + 1) * DAY; const seg = Math.min(e, de) - s; if (grid.has(di)) grid.get(di)[b] += u.gpus * seg / HOUR; s = de }
  }
  const rows = []
  for (let d = 0; d < nDays; d++) { const row = { t: (d0 + d) * DAY }; const g = grid.get(d); for (const b of buckets) row[b] = +(g[b] / 24).toFixed(1); rows.push(row) }
  return { rows, buckets, mode: 'daily' }
}

// Per-project projection rate (GPU-h/day) under the chosen model.
export function projRate(project, method = 'recent') {
  if (method === 'linear') { const days = Math.max(1, (Math.min(NOW, project.endMs) - project.startMs) / DAY); return project.used / days }
  return recentDailyRate(project)
}

export function forecastSeries(projList, tNow, t1, keyOf, method = 'recent') {
  const buckets = [...new Set(projList.map(keyOf))]
  const d0 = Math.floor(tNow / DAY), d1 = Math.ceil(t1 / DAY)
  const remaining = {}, rate = {}
  for (const p of projList) { remaining[p.id] = Math.max(0, p.budget - p.used); rate[p.id] = projRate(p, method) }
  const rows = []
  for (let d = d0; d < d1; d++) {
    const dayStart = d * DAY, dayEnd = (d + 1) * DAY
    const acc = Object.fromEntries(buckets.map((b) => [b, 0]))
    for (const p of projList) {
      const b = keyOf(p); let meanG = 0
      if (dayEnd > p.startMs && dayStart < p.endMs) { const gpuh = Math.min(rate[p.id], remaining[p.id]); remaining[p.id] -= gpuh; meanG = gpuh / 24 }
      let resG = 0; for (const r of reservations) if (r.projectId === p.id && r.endMs > dayStart && r.startMs < dayEnd) resG = Math.max(resG, r.gpus)
      acc[b] += Math.max(meanG, resG)
    }
    const row = { t: Math.max(dayStart, tNow), forecast: true }; for (const b of buckets) row[b] = +acc[b].toFixed(1); rows.push(row)
  }
  return { rows, buckets }
}

// --- KPIs computed monthly from the jobs ---
function median(arr) { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }
function monthRange(y, m) { return [Date.UTC(y, m, 1), Date.UTC(y, m + 1, 1)] }
export const KPIS = [
  { key: 'util', label: 'Utilisation', unit: '%', better: 'high' },
  { key: 'consumed', label: 'Consumed', unit: 'GPU-h', better: 'neutral' },
  { key: 'committed', label: 'Committed demand', unit: 'GPU-h', better: 'neutral' },
  { key: 'waitFast', label: 'Median wait, fast lane', unit: 'min', better: 'low' },
  { key: 'waitStd', label: 'Median wait, standard', unit: 'min', better: 'low' },
  { key: 'waitBulk', label: 'Median wait, bulk lane', unit: 'min', better: 'low' },
  { key: 'queued', label: 'Jobs queued > 1h', unit: '%', better: 'low' },
  { key: 'active', label: 'Active projects', unit: '', better: 'neutral' },
  { key: 'overBudget', label: 'Projects over budget', unit: '', better: 'low' },
]
export const kpiHistory = (() => {
  const out = []
  let y = 2025, m = 4 // May 2025
  while (Date.UTC(y, m, 1) <= END) {
    const [ms0, ms1] = monthRange(y, m)
    const hrs = (ms1 - ms0) / HOUR
    const forecast = ms0 > NOW
    const label = new Date(ms0).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    if (forecast) {
      // simple projection from the last actual month
      const last = out[out.length - 1] || {}
      out.push({ period: label, forecast: true, util: Math.min(99, Math.round((last.util || 80) + 1)), consumed: Math.round((last.consumed || 0) * 1.02), committed: last.committed || 0, waitFast: last.waitFast || 0, waitStd: last.waitStd || 0, waitBulk: last.waitBulk || 0, queued: last.queued || 0, active: last.active || 0, overBudget: last.overBudget || 0 })
    } else {
      const effEnd = Math.min(ms1, NOW)
      const hrsEl = Math.max(1, (effEnd - ms0) / HOUR)
      let gpuh = 0
      for (const u of loadUnits) { const s = Math.max(u.start, ms0), e = Math.min(u.end, effEnd); if (e > s) gpuh += u.gpus * (e - s) / HOUR }
      const wf = [], ws = [], wb = []; let over1h = 0, jn = 0
      for (const j of jobs) {
        if (j.submit >= ms0 && j.submit < ms1) { const w = (j.start - j.submit) / 60000; jn++; if (w > 60) over1h++; if (j.lane === 'fast') wf.push(w); else if (j.lane === 'bulk') wb.push(w); else ws.push(w) }
      }
      const activeP = projects.filter((p) => p.startMs < ms1 && p.endMs > ms0)
      const over = activeP.filter((p) => p.used > p.budget).length
      out.push({
        period: label, forecast: false,
        util: Math.round((gpuh / (cluster.gpus * hrsEl)) * 100),
        consumed: Math.round(gpuh),
        committed: activeP.reduce((s, p) => s + p.budget, 0),
        waitFast: Math.round(median(wf)), waitStd: Math.round(median(ws)), waitBulk: Math.round(median(wb)),
        queued: jn ? Math.round((over1h / jn) * 100) : 0,
        active: activeP.length, overBudget: over,
      })
    }
    m++; if (m > 11) { m = 0; y++ }
  }
  return out
})()
export const paramEvents = [
  { period: 'Jan 26', label: 'fast lane +50 priority' },
  { period: 'May 26', label: 'headroom 10% → 8%' },
]
