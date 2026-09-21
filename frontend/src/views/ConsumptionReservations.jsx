// Load tab: cluster load over time, reservations, and per-project consumption.
import { useState, useMemo, useEffect, useRef } from 'react'
import { fmt } from '../format.js'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
} from 'recharts'
import DataTable from '../components/DataTable.jsx'
import InfoTip from '../components/InfoTip.jsx'
import {
  capacity, effectiveGpus, projects, teams, people, reservations, parameters, period, teamHue,
  projectOwner, teamById, projectState, personProjects, primaryTeam, runningJobsAt,
  loadSeries, splitUnits, RESV_SFX, consumedGpuH, reservationUsage, runningAt, activeProjects, poolBars,
  fmtDay, fmtDateTime, isoDate,
} from '../data/mockData.js'
import { useSession } from '../session.jsx'

const DAY = 24 * 3600 * 1000
const floorDay = (ms) => Math.floor(ms / DAY) * DAY

// team colours by name, plus the special buckets
const NAME_HUE = Object.fromEntries(teams.map((t) => [t.name, teamHue[t.id]]))
function bucketColour(name) {
  if (NAME_HUE[name]) return NAME_HUE[name]
  if (name === 'Personal') return '#9085e9'
  if (name === 'No team') return '#7a8899'
  if (name === 'Other') return '#8a8f98'
  return '#888'
}
const DRILL_HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#8b5cf6', '#e8368f', '#0ea5b7', '#eda100', '#6366f1', '#14b8a6', '#f43f5e']

// the eight teams busiest recently get their own band; the rest fold into "Other"
const RECENT_FROM = period.nowMs - 45 * DAY
const TEAM_RANK = teams.map((t) => ({ name: t.name, load: consumedGpuH(projects.filter((p) => p.teamId === t.id), RECENT_FROM, period.nowMs) }))
  .sort((a, b) => b.load - a.load)
const TOP_TEAMS = new Set(TEAM_RANK.filter((x) => x.load > 0).slice(0, 8).map((x) => x.name))

function keyOfAll(p) {
  if (p.funding === 'person') return 'Personal'
  if (!p.teamId) return 'No team'
  const n = teamById(p.teamId)?.name
  return TOP_TEAMS.has(n) ? n : 'Other'
}

function projListForScope(scope) {
  if (scope === 'all') return projects
  const [k, id] = scope.split(':')
  if (k === 'team') return projects.filter((p) => p.teamId === id)
  if (k === 'person') { const per = people.find((pp) => pp.id === id); return projects.filter((p) => (per?.projectIds ?? []).includes(p.id) || p.personId === id) }
  if (k === 'project') return projects.filter((p) => p.id === id)
  return projects
}

// Range sets how much of the timeline to show. Trailing ranges end at "now";
// Total spans the whole period so upcoming reservations are visible past now.
function windowFor(range, custom) {
  const now = period.nowMs
  if (range === 'custom') {
    const t0 = Date.parse(custom.from), t1 = Date.parse(custom.to)
    return { t0: isNaN(t0) ? period.startMs : t0, fEnd: isNaN(t1) ? now : t1 }
  }
  if (range === 'today') return { t0: floorDay(now), fEnd: now }
  if (range === '7d') return { t0: now - 7 * DAY, fEnd: now }
  if (range === '30d') return { t0: now - 30 * DAY, fEnd: now }
  if (range === '90d') return { t0: now - 90 * DAY, fEnd: now }
  return { t0: period.startMs, fEnd: period.endMs } // total
}

// ordered bucket list and their colours for the current scope + rows
function orderedBuckets(scope, subset, presentSet) {
  if (scope === 'all') {
    // Personal first so it stacks at the bottom of the chart (it is the biggest band now)
    const order = ['Personal', ...TEAM_RANK.map((x) => x.name).filter((n) => TOP_TEAMS.has(n)), 'Other', 'No team']
    return order.filter((b) => presentSet.has(b)).map((b) => ({ key: b, colour: bucketColour(b) }))
  }
  return subset.filter((p) => presentSet.has(p.name)).map((p, i) => ({ key: p.name, colour: DRILL_HUES[i % DRILL_HUES.length] }))
}

function ScopePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const opts = useMemo(() => {
    const o = [{ value: 'all', label: 'All teams', group: '' }]
    for (const t of teams) o.push({ value: 'team:' + t.id, label: t.name, group: 'Team' })
    for (const p of people.filter((pp) => pp.projectIds.length)) o.push({ value: 'person:' + p.id, label: p.name, group: 'Person' })
    for (const p of projects) o.push({ value: 'project:' + p.id, label: p.name, group: 'Project' })
    return o
  }, [])
  const current = opts.find((o) => o.value === value)?.label ?? 'All teams'
  const ql = q.trim().toLowerCase()
  const shown = (ql ? opts.filter((o) => o.label.toLowerCase().includes(ql) || o.group.toLowerCase().includes(ql)) : opts).slice(0, 60)
  const pick = (v) => { onChange(v); setOpen(false); setQ('') }
  return (
    <span className="scopepick">
      <button type="button" className="scopepick-btn" onClick={() => setOpen((o) => !o)}>{current} <span className="scopepick-caret">▾</span></button>
      {open && (<>
        <div className="scopepick-backdrop" onClick={() => setOpen(false)} />
        <div className="scopepick-menu">
          <input autoFocus type="search" placeholder="Search team, person or project" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="scopepick-list">
            {shown.length === 0 && <div className="scopepick-empty">No match</div>}
            {shown.map((o, i) => {
              const head = o.group && (i === 0 || shown[i - 1].group !== o.group)
              return (<div key={o.value}>
                {head && <div className="scopepick-group">{o.group}</div>}
                <button type="button" className={'scopepick-opt' + (o.value === value ? ' sel' : '')} onClick={() => pick(o.value)}>{o.label}</button>
              </div>)
            })}
          </div>
        </div>
      </>)}
    </span>
  )
}

function ChartTooltip({ active, payload, label, colourByKey, capGpus, mode }) {
  if (!active || !payload || !payload.length) return null
  const isCap = (p) => p.dataKey === 'cap' || p.name === 'capacity'
  const capItem = payload.find(isCap)
  const capNow = capItem ? capItem.value : capGpus
  // merge each bucket's job and reservation series back into one line
  const byKey = {}
  for (const p of payload) {
    if (isCap(p) || p.dataKey === 'forecast') continue
    const dk = String(p.dataKey || p.name || '')
    const isR = dk.endsWith(RESV_SFX)
    const base = isR ? dk.slice(0, -RESV_SFX.length) : dk
    const o = byKey[base] || (byKey[base] = { name: base, value: 0, resv: 0 })
    o.value += p.value || 0
    if (isR) o.resv += p.value || 0
  }
  const items = Object.values(byKey).filter((o) => o.value > 0).sort((a, b) => b.value - a.value)
  const total = items.reduce((s, o) => s + o.value, 0)
  const pct = (v) => Math.round((v / (capNow || 1)) * 100) + '%'
  const show = (v) => `${Math.round(v)} GPU · ${pct(v)}`
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '8px 10px', minWidth: 210 }}>
      <div style={{ color: 'var(--ink-2)', marginBottom: 5 }}>{mode === 'daily' ? fmtDay(label) : fmtDateTime(label)}</div>
      {items.slice(0, 12).map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '2px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: colourByKey[p.name] || p.color, display: 'inline-block' }} />{p.name}
            {p.resv > 0 && <span style={{ color: 'var(--ink-2)' }}>({Math.round(p.resv)} GPU reserved)</span>}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{show(p.value)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border)', marginTop: 5, paddingTop: 5, fontWeight: 600 }}>
        <span>Total load</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{show(total)}</span>
      </div>
      {capItem && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--ink-2)', marginTop: 2 }}><span>Capacity</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(capItem.value)} GPU</span></div>}
    </div>
  )
}

// Full-timeline navigator: the whole period drawn dim, the visible window drawn
// bright, reservations marked in their team's colour, draggable to move/resize.
function Navigator({ rows, startMs, endMs, nowMs, t0, t1, capGpus, reservations, onChange }) {
  const wrap = useRef(null)
  const drag = useRef(null)
  const span = (endMs - startMs) || 1
  const H = 64, PAD = 3
  const fr = (t) => (t - startMs) / span
  const xv = (t) => fr(t) * 1000
  const pct = (t) => Math.max(0, Math.min(100, fr(t) * 100))
  const maxY = Math.max(capGpus || 1, ...rows.map((r) => r.load || 0))
  const yv = (v) => H - (v / maxY) * (H - PAD * 2) - PAD
  let d = ''
  if (rows.length) {
    d = `M ${xv(rows[0].t).toFixed(1)} ${H} L ${xv(rows[0].t).toFixed(1)} ${yv(rows[0].load).toFixed(1)}`
    for (let i = 1; i < rows.length; i++) d += ` L ${xv(rows[i].t).toFixed(1)} ${yv(rows[i - 1].load).toFixed(1)} L ${xv(rows[i].t).toFixed(1)} ${yv(rows[i].load).toFixed(1)}`
    d += ` L ${xv(endMs).toFixed(1)} ${yv(rows[rows.length - 1].load).toFixed(1)} L ${xv(endMs).toFixed(1)} ${H} Z`
  }
  const selL = pct(t0), selR = pct(t1), selW = Math.max(0, selR - selL)
  const timeAt = (clientX) => { const el = wrap.current; if (!el) return null; const b = el.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (clientX - b.left) / b.width)); return startMs + f * span }
  const minWin = DAY
  const move = (e) => {
    const dg = drag.current; if (!dg) return
    const at = timeAt(e.clientX); if (at == null) return
    let a = dg.t0, b = dg.t1
    if (dg.mode === 'move') { const dt = at - dg.at, w = dg.t1 - dg.t0; a = dg.t0 + dt; b = dg.t1 + dt; if (a < startMs) { a = startMs; b = startMs + w } if (b > endMs) { b = endMs; a = endMs - w } }
    else if (dg.mode === 'l') { a = Math.max(startMs, Math.min(at, dg.t1 - minWin)) }
    else if (dg.mode === 'r') { b = Math.min(endMs, Math.max(at, dg.t0 + minWin)) }
    onChange(Math.round(a), Math.round(b))
  }
  const end = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
  const begin = (mode) => (e) => { e.preventDefault(); e.stopPropagation(); drag.current = { mode, t0, t1, at: timeAt(e.clientX) }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', end) }
  const onTrack = (e) => { const at = timeAt(e.clientX); if (at == null) return; const w = t1 - t0; let a = at - w / 2, b = at + w / 2; if (a < startMs) { a = startMs; b = startMs + w } if (b > endMs) { b = endMs; a = endMs - w } onChange(Math.round(a), Math.round(b)) }
  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%', height: H, userSelect: 'none', touchAction: 'none' }}>
      <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
        <path d={d} fill="var(--ink-2)" fillOpacity="0.28" />
        <clipPath id="nav-sel"><rect x={xv(t0)} y="0" width={Math.max(0, xv(t1) - xv(t0))} height={H} /></clipPath>
        <path d={d} fill="var(--accent)" fillOpacity="0.6" clipPath="url(#nav-sel)" />
        {reservations.map((r) => { const x = xv(Math.max(r.startMs, startMs)); const w = Math.max(2.5, xv(Math.min(r.endMs, endMs)) - x); return <rect key={r.id} x={x} y={H - 9} width={w} height="7" fill={r.colour} fillOpacity="0.95" /> })}
        <rect x={xv(nowMs) - 0.8} y="0" width="1.6" height={H} fill="var(--ink)" fillOpacity="0.65" />
      </svg>
      <div onPointerDown={onTrack} style={{ position: 'absolute', inset: 0, cursor: 'pointer' }} />
      <div onPointerDown={begin('move')} style={{ position: 'absolute', top: 0, bottom: 0, left: selL + '%', width: selW + '%', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid var(--accent)', boxSizing: 'border-box', cursor: 'grab' }} />
      <div onPointerDown={begin('l')} title="drag to resize" style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${selL}% - 5px)`, width: 10, cursor: 'ew-resize', background: 'var(--accent)', borderRadius: 2 }} />
      <div onPointerDown={begin('r')} title="drag to resize" style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${selR}% - 5px)`, width: 10, cursor: 'ew-resize', background: 'var(--accent)', borderRadius: 2 }} />
    </div>
  )
}

export default function ConsumptionReservations() {
  const [scope, setScope] = useState('all')
  const [range, setRange] = useState('30d')
  const [custom, setCustom] = useState({ from: '2026-08-01', to: '2026-10-15' })
  const { can, session } = useSession()
  const [rev, setRev] = useState(0) // bump to recompute after a reservation is cancelled
  // team groups in the projects table: top (coloured) teams and Personal open by default
  const [openGroups, setOpenGroups] = useState(() => new Set()) // all team groups collapsed by default
  const toggleGroup = (key) => setOpenGroups((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const [projView, setProjView] = useState('grouped') // 'grouped' by team, or 'flat' sortable across all
  const [personOpen, setPersonOpen] = useState(false) // personal-work overview, collapsed by default
  const canCancelResv = (r) => {
    if (session.role === 'ops') return true
    const p = projects.find((pp) => pp.id === r.projectId)
    if (session.role === 'lead') return p?.teamId === session.teamId
    if (session.role === 'projlead') return p?.leadPersonId === session.personId
    return false
  }
  const cancelResv = (id) => { const i = reservations.findIndex((r) => r.id === id); if (i >= 0) reservations.splice(i, 1); setRev((v) => v + 1) }
  // capacity schedule (operations-editable); seeded from the model
  const [cap, setCap] = useState(() => ({ base: capacity.base, adjustments: capacity.adjustments.map((a) => ({ ...a })) }))
  const [capApplied, setCapApplied] = useState(false)
  const [sel, setSel] = useState(null) // {a,b} table window painted on the chart
  const [dragSel, setDragSel] = useState(null) // live drag highlight
  const dragRef = useRef(null)
  // the visible window; presets/forecast set it, and the navigator strip pans/zooms it
  const [viewWin, setViewWin] = useState(() => windowFor('30d', { from: '', to: '' }))
  useEffect(() => { setViewWin(windowFor(range, custom)) }, [range, custom.from, custom.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const subset = projListForScope(scope)
  const keyOf = scope === 'all' ? keyOfAll : (p) => p.name
  const { t0, fEnd } = viewWin

  const chart = useMemo(() => {
    // one pass over the whole window: jobs draw as steps up to "now", reservations
    // draw wherever they fall, so anything past "now" is booked reservations only.
    const act = loadSeries(subset, t0, fEnd, keyOf, { units: splitUnits(), split: true })
    const present = new Set()
    for (const r of act.rows) for (const k of Object.keys(r)) { if (k === 't' || !(r[k] > 0)) continue; present.add(k.endsWith(RESV_SFX) ? k.slice(0, -RESV_SFX.length) : k) }
    const units = orderedBuckets(scope, subset, present)
    return { rows: act.rows, units, mode: act.mode }
  }, [scope, t0, fEnd, rev]) // eslint-disable-line react-hooks/exhaustive-deps

  const colourByKey = Object.fromEntries(chart.units.map((u) => [u.key, u.colour]))
  const effGpus = (ms) => effectiveGpus(ms, cap)
  const capGpus = effGpus(period.nowMs)
  // stepped capacity value at each plotted point, so scheduled changes show on the chart
  const chartRows = useMemo(() => chart.rows.map((r) => ({ ...r, cap: effGpus(r.t) })), [chart.rows, cap]) // eslint-disable-line react-hooks/exhaustive-deps
  // shared y-axis max: the load in view (auto-scales, incl. when drilled), and the capacity
  // line at cluster scope. Both the GPU (left) and % (right) axes use this domain.
  const yMax = useMemo(() => {
    let m = 0
    for (const r of chartRows) { let s = 0; for (const u of chart.units) s += (r[u.key] || 0) + (r[u.key + RESV_SFX] || 0); if (s > m) m = s }
    if (scope === 'all') m = Math.max(m, capGpus)
    return Math.max(64, Math.ceil(m / 64) * 64)
  }, [chartRows, chart.units, capGpus, scope])
  // full-range overview for the navigator strip
  const overviewRows = useMemo(() => loadSeries(projects, period.startMs, period.endMs, () => 'load').rows, [])
  const drilled = scope !== 'all'
  const resvColour = (r) => { const p = projects.find((pp) => pp.id === r.projectId); const key = p ? keyOf(p) : 'No team'; return colourByKey[key] || bucketColour(key) }

  // all reservations across the full timeline, coloured, for the navigator marks
  const resvNav = useMemo(() => reservations.map((r) => ({ id: r.id, startMs: r.startMs, endMs: r.endMs, colour: resvColour(r) })), [rev, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  // capacity schedule editing
  const capDirty = JSON.stringify(cap) !== JSON.stringify({ base: capacity.base, adjustments: capacity.adjustments })
  const setCapBase = (v) => { setCap((c) => ({ ...c, base: Math.max(0, Number(v) || 0) })); setCapApplied(false) }
  const setCapAdj = (i, patch) => { setCap((c) => ({ ...c, adjustments: c.adjustments.map((a, j) => (j === i ? { ...a, ...patch } : a)) })); setCapApplied(false) }
  const addCapAdj = () => { setCap((c) => ({ ...c, adjustments: [...c.adjustments, { at: period.nowMs, gpus: c.adjustments.length ? c.adjustments[c.adjustments.length - 1].gpus : c.base, note: '' }] })); setCapApplied(false) }
  const rmCapAdj = (i) => { setCap((c) => ({ ...c, adjustments: c.adjustments.filter((_, j) => j !== i) })); setCapApplied(false) }
  const applyCapacity = () => {
    const sorted = [...cap.adjustments].sort((a, b) => a.at - b.at)
    capacity.base = cap.base
    capacity.adjustments.splice(0, capacity.adjustments.length, ...sorted.map((a) => ({ ...a })))
    setCap({ base: cap.base, adjustments: sorted.map((a) => ({ ...a })) })
    setCapApplied(true)
  }

  // a dragged selection drives the tables; with none, default to the current moment
  useEffect(() => { setSel(null) }, [range, scope, custom.from, custom.to])
  const selLabel = sel ? `${fmtDay(sel.a)} – ${fmtDay(sel.b)}` : `now (${fmtDay(period.nowMs)})`
  // the projects-pool projects (teams + org): personal work is best-effort with no enforced
  // budget, so it does not belong in the budget/forecast table — it lives in the Budgets person pool
  const projRows = (sel
    ? projects.filter((p) => p.endMs >= sel.a && p.startMs <= sel.b)
    : projects.filter((p) => p.startMs <= period.nowMs && p.endMs >= period.nowMs)
  ).filter((p) => p.funding !== 'person')
  // reservations follow the dragged selection, else the window currently shown on the chart
  const resvA = sel ? sel.a : t0, resvB = sel ? sel.b : fEnd
  const resvRows = reservations.filter((r) => r.endMs >= resvA && r.startMs <= resvB)
  const resvLabel = sel ? `${fmtDay(sel.a)} – ${fmtDay(sel.b)}` : `${fmtDay(t0)} – ${fmtDay(fEnd)}`
  // budget/used/left reflect the dragged window when there is one, else the whole project
  const winBudget = (p) => {
    if (!sel) return p.budget
    const ov = Math.max(0, Math.min(sel.b, p.endMs) - Math.max(sel.a, p.startMs))
    const dur = (p.endMs - p.startMs) || 1
    return Math.round(p.budget * Math.min(1, ov / dur))
  }
  const winUsed = (p) => (sel ? consumedGpuH([p], sel.a, sel.b) : p.used)
  const winLeft = (p) => Math.max(0, winBudget(p) - winUsed(p))
  // group the projects by team, the way the graph buckets them: top teams get their
  // graph colour, the smaller teams (the grey "Other" band) get a grey swatch.
  const projGroups = (() => {
    const groups = []
    const byTeam = new Map()
    const personal = [], noTeam = []
    for (const p of projRows) {
      if (p.funding === 'person') { personal.push(p); continue }
      if (!p.teamId) { noTeam.push(p); continue }
      if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, [])
      byTeam.get(p.teamId).push(p)
    }
    for (const [teamId, rows] of byTeam) {
      const name = teamById(teamId)?.name || 'team'
      const top = TOP_TEAMS.has(name)
      groups.push({ key: 't:' + teamId, name, rows, top, colour: top ? bucketColour(name) : bucketColour('Other') })
    }
    // top teams first (in graph rank order), then the rest by size
    const rank = TEAM_RANK.map((x) => x.name)
    groups.sort((a, b) => (b.top - a.top) || (a.top ? rank.indexOf(a.name) - rank.indexOf(b.name) : b.rows.length - a.rows.length))
    if (personal.length) groups.push({ key: 'personal', name: 'Personal', rows: personal, top: false, colour: bucketColour('Personal') })
    if (noTeam.length) groups.push({ key: 'org', name: 'Organisation', rows: noTeam, top: false, colour: bucketColour('No team') })
    return groups
  })()
  const projColumns = [
    { key: 'name', label: 'Project', render: (p) => (p.funding === 'person' ? <span className="tag">personal</span> : p.name) },
    { key: 'owner', label: 'Owner', sortValue: (p) => projectOwner(p), render: (p) => projectOwner(p) },
    { key: 'budget', label: 'Budget', num: true, sortValue: (p) => winBudget(p), render: (p) => fmt(winBudget(p)) },
    { key: 'used', label: 'Used', num: true, sortValue: (p) => winUsed(p), render: (p) => fmt(winUsed(p)) },
    { key: 'left', label: 'Left', num: true, sortValue: (p) => winLeft(p), render: (p) => fmt(winLeft(p)) },
    { key: 'prog', label: 'Consumption', sortable: false, render: (p) => { const b = winBudget(p) || 1; const pc = Math.min(100, (winUsed(p) / b) * 100); return (<div className="meter" title={`${Math.round((winUsed(p) / b) * 100)}%`}><span style={{ width: pc + '%' }} /></div>) } },
    { key: 'status', label: 'Budget status', sortValue: (p) => winUsed(p) - winBudget(p), render: (p) => { const over = winUsed(p) - winBudget(p); if (over > 0) return <span className="tag warn">over by {fmt(Math.round(over))}</span>; if (projectState(p) === 'finished') return <span className="hint">ended, within budget</span>; return <span className="hint">within budget</span> } },
  ]
  const rowClick = (p) => setScope('project:' + p.id)
  const selId = scope.startsWith('project:') ? scope.split(':')[1] : null
  // fixed, shared column widths so every team's table lines up (order matches projColumns)
  const PROJ_COLW = [160, 120, 92, 92, 92, 128, 130]
  const PROJ_COLW_TOTAL = PROJ_COLW.reduce((a, b) => a + b, 0)

  // personal work summarised by person: everyone running individual (person-pool) jobs
  const personRunGpus = useMemo(() => {
    const m = {}
    for (const j of runningJobsAt()) { const pr = projects.find((p) => p.id === j.projectId); if (pr?.funding === 'person') m[j.personId] = (m[j.personId] || 0) + j.gpus }
    return m
  }, [rev])
  const personPeople = useMemo(() => {
    const byId = new Map()
    for (const p of personProjects) {
      const o = byId.get(p.personId) || { id: p.personId, name: projectOwner(p), team: (primaryTeam(people.find((pp) => pp.id === p.personId) || {}) || {}).name || '—', budget: 0, used: 0, n: 0 }
      o.budget += p.budget; o.used += p.used; o.n += 1
      byId.set(p.personId, o)
    }
    return [...byId.values()].map((o) => ({ ...o, running: personRunGpus[o.id] || 0 }))
  }, [personRunGpus])
  const personUsed = personPeople.reduce((s, r) => s + r.used, 0)
  const personBudgetTotal = personPeople.reduce((s, r) => s + r.budget, 0)

  // regular, aligned x-axis ticks so dense actual data does not crush the labels
  const span = fEnd - t0
  const tickStep = span <= 2 * DAY ? 6 * 3600 * 1000 : span <= 18 * DAY ? DAY : span <= 130 * DAY ? 7 * DAY : 30 * DAY
  const ticks = []
  for (let tk = Math.ceil(t0 / tickStep) * tickStep; tk <= fEnd; tk += tickStep) ticks.push(tk)
  const tickFmt = (v) => (tickStep < DAY
    ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : fmtDay(v))

  return (
    <section>
      {can('editCapacity') && (
        <div className="card">
          <div className="card-title">
            Capacity schedule <span className="rolechip ops">ops</span>
            <InfoTip text="GPUs in service over time. The count steps up on the dates pods or expansions come online." />
          </div>
          <div className="editbar" style={{ border: 'none', padding: 0, marginBottom: 4 }}>
            <label>Base (from {fmtDay(period.startMs)})</label>
            <span className="numin"><input type="number" min="0" step="64" value={cap.base} onChange={(e) => setCapBase(e.target.value)} style={{ width: 80 }} /><span className="numin-suffix">GPUs</span></span>
            <span className="hint">Now in service: <b>{fmt(capGpus)}</b> GPUs</span>
          </div>
          <table className="capsched">
            <thead><tr><th>Effective from</th><th>GPUs</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {cap.adjustments.map((a, i) => (
                <tr key={i}>
                  <td><input type="date" value={isoDate(a.at)} onChange={(e) => setCapAdj(i, { at: Date.parse(e.target.value + 'T00:00:00Z') })} /></td>
                  <td><input type="number" min="0" step="64" value={a.gpus} onChange={(e) => setCapAdj(i, { gpus: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 90 }} /></td>
                  <td><input value={a.note} onChange={(e) => setCapAdj(i, { note: e.target.value })} placeholder="e.g. H200 pod online" style={{ width: 220 }} /></td>
                  <td><button className="btn" style={{ padding: '2px 8px' }} onClick={() => rmCapAdj(i)}>Remove</button></td>
                </tr>
              ))}
              {cap.adjustments.length === 0 && (<tr><td colSpan={4} className="hint">No scheduled changes — capacity stays at the base.</td></tr>)}
            </tbody>
          </table>
          <div className="apply-bar" style={{ marginTop: 6 }}>
            <button className="btn" onClick={addCapAdj}>Add change</button>
            <button className="btn primary" disabled={!capDirty} onClick={applyCapacity}>Apply</button>
            <span className="hint">{capDirty ? 'Staged — not yet applied.' : capApplied ? 'Applied.' : ''}</span>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ width: '100%', height: 330 }}>
          <ResponsiveContainer>
            <AreaChart data={chartRows} margin={{ top: 20, right: 14, left: 8, bottom: 4 }}
              onMouseDown={(e) => { if (e && e.activeLabel != null) { dragRef.current = { a: e.activeLabel, b: e.activeLabel }; setDragSel({ a: e.activeLabel, b: e.activeLabel }) } }}
              onMouseMove={(e) => { if (dragRef.current && e && e.activeLabel != null) { dragRef.current.b = e.activeLabel; setDragSel({ a: dragRef.current.a, b: e.activeLabel }) } }}
              onMouseUp={() => { const d = dragRef.current; dragRef.current = null; setDragSel(null); if (d) { const a = Math.min(d.a, d.b), b = Math.max(d.a, d.b); setSel(b - a > 30 * 60 * 1000 ? { a, b } : null) } }}
              onMouseLeave={() => { const d = dragRef.current; dragRef.current = null; setDragSel(null); if (d) { const a = Math.min(d.a, d.b), b = Math.max(d.a, d.b); if (b - a > 30 * 60 * 1000) setSel({ a, b }) } }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={[t0, fEnd]} ticks={ticks} tick={{ fill: 'var(--ink-2)', fontSize: 11 }}
                tickLine={false} axisLine={{ stroke: 'var(--line)' }} tickFormatter={tickFmt} />
              <YAxis yAxisId="gpu" domain={[0, yMax]} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54}
                tickFormatter={(v) => fmt(v)} label={{ value: 'GPUs', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, yMax]} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={48}
                tickFormatter={(v) => Math.round((v / (capGpus || 1)) * 100) + '%'} label={{ value: '% of capacity', angle: 90, position: 'insideRight', fill: 'var(--muted)', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip colourByKey={colourByKey} capGpus={capGpus} mode={chart.mode} />} cursor={{ stroke: 'var(--ink-2)', strokeWidth: 1 }} />
              {fEnd > period.nowMs && (
                <ReferenceArea yAxisId="gpu" x1={period.nowMs} x2={fEnd} fill="var(--ink-2)" fillOpacity={0.08} />
              )}
              {/* reservations first, so they sit at the bottom of each bucket's stack; jobs drape over.
                  No stroke: a dashed outline on every bucket's (often zero-height) reservation layer
                  draws stray horizontal lines across the chart. Reservations read as the lighter band. */}
              {chart.units.map((u) => (
                <Area key={u.key + '_r'} yAxisId="gpu" type="stepAfter" dataKey={u.key + RESV_SFX} name={u.key + ' · reserved'} stackId="load"
                  stroke="none" fill={u.colour} fillOpacity={0.5} activeDot={false} isAnimationActive={false} connectNulls />
              ))}
              {chart.units.map((u) => (
                <Area key={u.key} yAxisId="gpu" type="stepAfter" dataKey={u.key} name={u.key} stackId="load"
                  stroke="var(--surface)" strokeWidth={0.4} fill={u.colour} fillOpacity={0.95} activeDot={false} isAnimationActive={false} connectNulls />
              ))}
              {/* capacity line, bound to the right (%) axis so that axis always renders; hidden when drilled */}
              <Area yAxisId="pct" type="stepAfter" dataKey="cap" stroke={drilled ? 'none' : 'var(--ink-2)'} strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} activeDot={false} isAnimationActive={false} legendType="none" name="capacity" />
              {sel && !dragSel && (
                <ReferenceArea yAxisId="gpu" x1={sel.a} x2={sel.b} fill="var(--accent)" fillOpacity={0.1} stroke="var(--accent)" strokeOpacity={0.5} strokeWidth={1} />
              )}
              {dragSel && (
                <ReferenceArea yAxisId="gpu" x1={Math.min(dragSel.a, dragSel.b)} x2={Math.max(dragSel.a, dragSel.b)} fill="var(--accent)" fillOpacity={0.18} />
              )}
              {fEnd > period.nowMs && t0 < period.nowMs && (
                <ReferenceLine yAxisId="gpu" x={period.nowMs} stroke="var(--ink)" strokeWidth={2} label={{ value: 'now', fill: 'var(--ink)', fontSize: 11, fontWeight: 600, position: 'top' }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-2)', marginTop: 4 }}>
          <span>{fmtDay(period.startMs)}</span><span>{fmtDay(period.endMs)}</span>
        </div>
        <Navigator rows={overviewRows} startMs={period.startMs} endMs={period.endMs} nowMs={period.nowMs}
          t0={t0} t1={fEnd} capGpus={capGpus} reservations={resvNav}
          onChange={(a, b) => setViewWin({ t0: a, fEnd: b })} />
        <div className="legend-grouped" style={{ marginTop: 8 }}><div className="lg-row">
          {chart.units.map((u) => <span className="lg-item" key={u.key}><i className="swatch" style={{ background: u.colour }} />{u.key}</span>)}
        </div></div>
        <div className="controls" style={{ marginTop: 10, marginBottom: 0 }}>
          <label>Scope</label>
          <ScopePicker value={scope} onChange={setScope} />
          <label style={{ marginLeft: 8 }}>Range</label>
          <div className="seg">
            <button className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>Today</button>
            <button className={range === '7d' ? 'active' : ''} onClick={() => setRange('7d')}>7d</button>
            <button className={range === '30d' ? 'active' : ''} onClick={() => setRange('30d')}>30d</button>
            <button className={range === '90d' ? 'active' : ''} onClick={() => setRange('90d')}>90d</button>
            <button className={range === 'total' ? 'active' : ''} onClick={() => setRange('total')}>Total</button>
            <button className={range === 'custom' ? 'active' : ''} onClick={() => setRange('custom')}>Custom</button>
          </div>
          {range === 'custom' && (<>
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span className="hint">to</span>
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </>)}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Projects — {selLabel} <span className="th-unit">{projRows.length} team projects</span><InfoTip text="Projects active in the selected window, or active now if none is selected. Drag on the chart to set the window; select a row to scope the chart to that project." /></span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <div className="seg">
              <button className={projView === 'grouped' ? 'active' : ''} onClick={() => setProjView('grouped')}>By team</button>
              <button className={projView === 'flat' ? 'active' : ''} onClick={() => setProjView('flat')}>All projects</button>
            </div>
            {projView === 'grouped' && <>
              <button className="btn" onClick={() => setOpenGroups(new Set(projGroups.map((g) => g.key)))}>Expand all</button>
              <button className="btn" onClick={() => setOpenGroups(new Set())}>Collapse all</button>
            </>}
          </span>
        </div>
        {(sel || drilled) && (
          <p className="hint" style={{ marginTop: 0 }}>
            {sel && <button className="linkbtn" onClick={() => setSel(null)}>Clear selection</button>}
            {sel && drilled && ' · '}
            {drilled && <button className="linkbtn" onClick={() => setScope('all')}>Back to all teams</button>}
          </p>
        )}
        {projView === 'flat' ? (
          <div className="tbl-scroll">
            <DataTable onRowClick={rowClick} selectedId={selId} initialSort={{ key: 'used', dir: 'desc' }} columns={projColumns} rows={projRows} colWidths={PROJ_COLW} />
          </div>
        ) : (
        <div className="tbl-scroll">
          {projGroups.map((g) => {
            const open = openGroups.has(g.key)
            const gUsed = g.rows.reduce((s, p) => s + winUsed(p), 0)
            const gBudget = g.rows.reduce((s, p) => s + winBudget(p), 0)
            const gPct = gBudget ? Math.round((gUsed / gBudget) * 100) : 0
            return (
              <div className="proj-group" key={g.key}>
                <button className="other-head" style={{ minWidth: PROJ_COLW_TOTAL }} onClick={() => toggleGroup(g.key)}>
                  <span className="oh-label">
                    <span className="acc-chev">{open ? '▾' : '▸'}</span>
                    <i style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: g.colour, margin: '0 8px 0 2px', flex: '0 0 auto' }} />
                    <b>{g.name}</b>
                    <span className="th-unit" style={{ marginLeft: 8 }}>{g.rows.length} project{g.rows.length === 1 ? '' : 's'}</span>
                  </span>
                  <span className="meter" title={`${fmt(gUsed)} / ${fmt(gBudget)} GPU-h · ${gPct}% of budget used`} style={{ width: 200, flex: '0 0 auto' }}>
                    <span style={{ width: Math.min(100, gPct) + '%', background: g.colour }} />
                  </span>
                </button>
                {open && <DataTable onRowClick={rowClick} selectedId={selId} initialSort={{ key: 'used', dir: 'desc' }} columns={projColumns} rows={g.rows} colWidths={PROJ_COLW} />}
              </div>
            )
          })}
        </div>
        )}

        {/* personal work: one more group at the bottom, with an aggregate use-of-budget meter */}
        {(() => {
          const pPct = personBudgetTotal ? Math.round((personUsed / personBudgetTotal) * 100) : 0
          const pOver = personUsed > personBudgetTotal
          return (
            <div className="proj-group" style={{ marginTop: 4 }}>
              <button className="other-head" style={{ minWidth: PROJ_COLW_TOTAL }} onClick={() => setPersonOpen((o) => !o)}>
                <span className="oh-label">
                  <span className="acc-chev">{personOpen ? '▾' : '▸'}</span>
                  <i style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: bucketColour('Personal'), margin: '0 8px 0 2px', flex: '0 0 auto' }} />
                  <b>Personal</b>
                  <span className="th-unit" style={{ marginLeft: 8 }}>{personPeople.length} people</span>
                </span>
                <span className="meter" title={`${fmt(personUsed)} / ${fmt(personBudgetTotal)} GPU-h · ${pPct}% of the person pool used`} style={{ width: 200, flex: '0 0 auto' }}>
                  <span style={{ width: Math.min(100, pPct) + '%', background: pOver ? 'var(--warning)' : bucketColour('Personal') }} />
                </span>
              </button>
              {personOpen && (
                <DataTable
                  initialSort={{ key: 'used', dir: 'desc' }}
                  colWidths={[210, 150, 230, 130]}
                  columns={[
                    { key: 'name', label: 'Person', sortValue: (r) => r.name, render: (r) => r.name },
                    { key: 'team', label: 'Home team', sortValue: (r) => r.team, render: (r) => <span className="hint">{r.team}</span> },
                    { key: 'used', label: <>Used <span className="th-unit">of budget</span></>, sortValue: (r) => r.used, render: (r) => {
                      const frac = r.budget > 0 ? r.used / r.budget : 0
                      const over = frac > 1
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 210 }} title={Math.round(frac * 100) + '% of budget'}>
                          <span className="meter" style={{ flex: 1 }}><span style={{ width: Math.min(1, frac) * 100 + '%', background: over ? 'var(--warning)' : 'var(--good)' }} /></span>
                          <span style={{ width: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.used)}</span>
                        </span>
                      )
                    } },
                    { key: 'running', label: 'Running now', num: true, sortValue: (r) => r.running, render: (r) => r.running ? <span className="tag ok">{fmt(r.running)} GPU</span> : <span className="hint">—</span> },
                  ]}
                  rows={personPeople}
                />
              )}
            </div>
          )
        })()}
      </div>

      <div className="card">
        <div className="card-title">Reservations — {resvLabel} <span className="th-unit">{resvRows.length} shown</span><InfoTip text="Reservations overlapping the window shown above. Used is the share of the reserved GPU-time actually consumed in the window. Cancelling one returns its GPUs to the pool." /></div>
        <DataTable
          initialSort={{ key: 'start', dir: 'asc' }}
          columns={[
            { key: 'team', label: 'Team', sortValue: (r) => projTeam(r.projectId).name, render: (r) => { const t = projTeam(r.projectId); return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: t.colour, flex: '0 0 auto' }} />{t.name}</span> } },
            { key: 'project', label: 'Project', sortValue: (r) => projName(r.projectId), render: (r) => projName(r.projectId) },
            { key: 'label', label: 'Description' },
            { key: 'start', label: 'Window', sortValue: (r) => r.startMs, render: (r) => `${fmtDay(r.startMs)} – ${fmtDay(r.endMs)}` },
            { key: 'gpus', label: 'GPUs', num: true },
            { key: 'used', label: 'Used', num: true, sortValue: (r) => reservationUsage(r).utilPct, render: (r) => {
              const u = reservationUsage(r)
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 150 }} title={`${fmt(u.usedGpuH)} of ${fmt(u.reservedGpuH)} GPU-h used in the window`}>
                  <span className="meter" style={{ flex: 1 }}><span style={{ width: u.utilPct + '%', background: 'var(--accent)' }} /></span>
                  <span style={{ width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.utilPct}%</span>
                </span>
              )
            } },
            { key: 'bookedBy', label: 'Booked by', sortValue: (r) => r.bookedBy || '', render: (r) => r.bookedBy || '—' },
            { key: 'approvedBy', label: 'Approved by', sortValue: (r) => r.approvedBy || '', render: (r) => r.approvedBy || '—' },
            { key: 'act', label: 'Action', sortable: false, render: (r) => {
              if (r.endMs < period.nowMs) return <span className="hint">ended</span>
              if (canCancelResv(r)) return <button className="btn" style={{ padding: '2px 8px' }} onClick={() => cancelResv(r.id)}>Cancel</button>
              return <span className="hint" title="Only operations, the holding team's lead, or the project lead can cancel">—</span>
            } },
          ]}
          rows={resvRows}
        />
      </div>
    </section>
  )
}

function projName(id) { return projects.find((p) => p.id === id)?.name ?? id }
// team name + swatch colour for a reservation's project, stable regardless of chart scope
function projTeam(id) {
  const p = projects.find((pp) => pp.id === id)
  if (!p) return { name: '—', colour: '#888' }
  if (p.funding === 'person') return { name: 'Personal', colour: bucketColour('Personal') }
  if (!p.teamId) return { name: 'Organisation', colour: bucketColour('No team') }
  const name = teamById(p.teamId)?.name || 'team'
  return { name, colour: bucketColour(name) }
}

function StateTag({ p }) {
  const s = projectState(p)
  if (s === 'active') return <span className="tag ok">active</span>
  if (s === 'planned') return <span className="tag">planned</span>
  return <span className="hint">finished</span>
}

function Tile({ label, value, note }) {
  return (<div className="tile"><div className="tile-label">{label}</div><div className="tile-value">{value}</div>{note && <div className="tile-note">{note}</div>}</div>)
}
