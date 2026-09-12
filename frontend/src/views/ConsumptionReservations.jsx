import { useState, useMemo, useEffect, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea, Brush,
} from 'recharts'
import DataTable from '../components/DataTable.jsx'
import InfoTip from '../components/InfoTip.jsx'
import {
  cluster, projects, teams, people, reservations, parameters, period, teamHue,
  projectOwner, teamById, priorityTier, recentDailyRate, projRate, projectState,
  loadSeries, forecastSeries, consumedGpuH, runningAt, activeProjects,
  fmtDay, fmtDateTime,
} from '../data/mockData.js'
import { useSession } from '../session.jsx'

const DAY = 24 * 3600 * 1000
const fmt = (n) => Math.round(n).toLocaleString('en-GB')
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

// Range sets how much history to show; the forecast extends forward by a
// fraction of that same history span, so it scales with the chosen period.
function windowFor(range, custom, fcPct) {
  const now = period.nowMs
  if (range === 'custom') {
    const t0 = Date.parse(custom.from), t1 = Date.parse(custom.to)
    return { t0: isNaN(t0) ? period.startMs : t0, fEnd: isNaN(t1) ? now : t1 }
  }
  let t0
  if (range === 'today') t0 = floorDay(now)
  else if (range === '7d') t0 = now - 7 * DAY
  else if (range === '30d') t0 = now - 30 * DAY
  else if (range === '90d') t0 = now - 90 * DAY
  else t0 = period.startMs // total
  const hist = now - t0
  const fEnd = Math.min(period.endMs, now + fcPct * hist)
  return { t0, fEnd }
}

// ordered bucket list and their colours for the current scope + rows
function orderedBuckets(scope, subset, presentSet) {
  if (scope === 'all') {
    const order = [...TEAM_RANK.map((x) => x.name).filter((n) => TOP_TEAMS.has(n)), 'Other', 'Personal', 'No team']
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

function ChartTooltip({ active, payload, label, colourByKey, yUnit, capGpus }) {
  if (!active || !payload || !payload.length) return null
  const items = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value)
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  const show = (v) => (yUnit === 'pct' ? Math.round((v / capGpus) * 100) + '%' : Math.round(v) + ' GPU')
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '8px 10px', minWidth: 190 }}>
      <div style={{ color: 'var(--ink-2)', marginBottom: 5 }}>{fmtDateTime(label)}</div>
      {items.slice(0, 12).map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '2px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: colourByKey[p.name] || p.color, display: 'inline-block' }} />{p.name}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{show(p.value)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 5, paddingTop: 5, fontWeight: 600 }}>
        <span>Total load</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{show(total)}</span>
      </div>
    </div>
  )
}

export default function ConsumptionReservations() {
  const [scope, setScope] = useState('all')
  const [range, setRange] = useState('30d')
  const [fcPct, setFcPct] = useState(0.5) // forecast horizon as a fraction of the shown history
  const [fcMethod, setFcMethod] = useState('recent')
  const [yUnit, setYUnit] = useState('gpus')
  const [custom, setCustom] = useState({ from: '2026-08-01', to: '2026-10-15' })
  const { can } = useSession()
  const [headroomPct, setHeadroomPct] = useState(Math.round(parameters.headroom.org * 100))
  const [oversub, setOversub] = useState(parameters.oversubscriptionFactor)
  const [admApplied, setAdmApplied] = useState(false)
  const [sel, setSel] = useState(null) // {a,b} table window painted on the chart
  const [dragSel, setDragSel] = useState(null) // live drag highlight
  const dragRef = useRef(null)
  // the visible window; presets/forecast set it, and the navigator strip pans/zooms it
  const [viewWin, setViewWin] = useState(() => windowFor('30d', { from: '', to: '' }, 0.5))
  useEffect(() => { setViewWin(windowFor(range, custom, fcPct)) }, [range, custom.from, custom.to, fcPct]) // eslint-disable-line react-hooks/exhaustive-deps

  const subset = projListForScope(scope)
  const keyOf = scope === 'all' ? keyOfAll : (p) => p.name
  const fcOn = fcPct > 0
  const { t0, fEnd } = viewWin
  const tActualEnd = Math.min(fEnd, period.nowMs)

  const chart = useMemo(() => {
    const act = loadSeries(subset, t0, tActualEnd, keyOf)
    const fc = fcOn && fEnd > period.nowMs ? forecastSeries(subset, period.nowMs, fEnd, keyOf, fcMethod) : { rows: [], buckets: [] }
    const present = new Set()
    for (const r of [...act.rows, ...fc.rows]) for (const k of Object.keys(r)) if (k !== 't' && k !== 'forecast' && r[k] > 0) present.add(k)
    const units = orderedBuckets(scope, subset, present)
    return { rows: [...act.rows, ...fc.rows], units, mode: act.mode }
  }, [scope, t0, fEnd, fcOn, fcMethod]) // eslint-disable-line react-hooks/exhaustive-deps

  const colourByKey = Object.fromEntries(chart.units.map((u) => [u.key, u.colour]))
  const capGpus = cluster.gpus
  // full-range overview for the navigator strip
  const overviewRows = useMemo(() => loadSeries(projects, period.startMs, period.endMs, () => 'load').rows, [])
  const ov0 = overviewRows.length ? overviewRows[0].t : period.startMs
  const ovIdx = (t) => Math.max(0, Math.min(overviewRows.length - 1, Math.round((t - ov0) / DAY)))
  const navStart = ovIdx(t0)
  const navEnd = Math.min(overviewRows.length - 1, Math.max(ovIdx(fEnd), navStart + 1))
  const onNav = (r) => {
    if (!r || r.startIndex == null || r.endIndex == null || r.endIndex <= r.startIndex) return
    const a = overviewRows[r.startIndex].t, b = overviewRows[r.endIndex].t
    if (a !== t0 || b !== fEnd) setViewWin({ t0: a, fEnd: b })
  }
  const drilled = scope !== 'all'

  // reservations visible in this scope + window
  const resvViz = reservations.map((r) => {
    const p = projects.find((pp) => pp.id === r.projectId)
    if (!p || !subset.some((s) => s.id === p.id)) return null
    if (r.endMs < t0 || r.startMs > fEnd) return null
    const key = keyOf(p)
    return { ...r, colour: colourByKey[key] || bucketColour(key), team: key, proj: p.name }
  }).filter(Boolean)

  // tiles
  const runningNow = runningAt(projects.map((p) => p.id), period.nowMs)
  const active = activeProjects().length
  const consumed = consumedGpuH(subset, t0, tActualEnd)
  const headroomGpus = Math.round(cluster.gpus * (headroomPct / 100))
  const admDirty = headroomPct !== Math.round(parameters.headroom.org * 100) || oversub !== parameters.oversubscriptionFactor
  const applyAdmission = () => { parameters.headroom.org = headroomPct / 100; parameters.oversubscriptionFactor = oversub; setAdmApplied(true) }

  // a dragged selection drives the tables; with none, default to the current moment
  useEffect(() => { setSel(null) }, [range, scope, custom.from, custom.to, fcPct])
  const selLabel = sel ? `${fmtDay(sel.a)} – ${fmtDay(sel.b)}` : `now (${fmtDay(period.nowMs)})`
  const projRows = sel
    ? projects.filter((p) => p.endMs >= sel.a && p.startMs <= sel.b)
    : projects.filter((p) => p.startMs <= period.nowMs && p.endMs >= period.nowMs)
  const resvRows = sel
    ? reservations.filter((r) => r.endMs >= sel.a && r.startMs <= sel.b)
    : reservations.filter((r) => r.endMs >= period.nowMs && r.startMs <= fEnd)
  // budget/used/left reflect the dragged window when there is one, else the whole project
  const winBudget = (p) => {
    if (!sel) return p.budget
    const ov = Math.max(0, Math.min(sel.b, p.endMs) - Math.max(sel.a, p.startMs))
    const dur = (p.endMs - p.startMs) || 1
    return Math.round(p.budget * Math.min(1, ov / dur))
  }
  const winUsed = (p) => (sel ? consumedGpuH([p], sel.a, sel.b) : p.used)
  const winLeft = (p) => Math.max(0, winBudget(p) - winUsed(p))

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
      <div className="view-head">
        <h2 className="view-title">Planning</h2>
        <p className="view-intro">
          GPU load over time, built from individual jobs the way it comes from SLURM: the
          band is the number of GPUs held by running jobs, so it steps up and down as jobs
          start and finish. Scope to a team, project or person; past “now” the load is
          forecast. Reservations hold GPUs for set windows and show as blocks.
        </p>
      </div>

      <div className="controls">
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
        <label style={{ marginLeft: 8 }} title="Forecast horizon, as a fraction of the history shown">Forecast</label>
        <div className="seg">
          <button className={fcPct === 0 ? 'active' : ''} onClick={() => setFcPct(0)}>Off</button>
          <button className={fcPct === 0.25 ? 'active' : ''} onClick={() => setFcPct(0.25)}>25%</button>
          <button className={fcPct === 0.5 ? 'active' : ''} onClick={() => setFcPct(0.5)}>50%</button>
          <button className={fcPct === 1 ? 'active' : ''} onClick={() => setFcPct(1)}>100%</button>
        </div>
        <select value={fcMethod} onChange={(e) => setFcMethod(e.target.value)} disabled={!fcOn} title="Forecast model">
          <option value="recent">Recent rate</option>
          <option value="linear">Linear from start</option>
          <option value="spline" disabled>Spline / trend (planned)</option>
          <option value="ml" disabled>Learned model (planned)</option>
        </select>
        <label style={{ marginLeft: 8 }}>Y-axis</label>
        <div className="seg">
          <button className={yUnit === 'gpus' ? 'active' : ''} onClick={() => setYUnit('gpus')}>GPUs</button>
          <button className={yUnit === 'pct' ? 'active' : ''} onClick={() => setYUnit('pct')}>% capacity</button>
        </div>
      </div>

      <div className="tiles">
        <Tile label="Cluster" value={fmt(cluster.gpus)} note="GPUs" />
        <Tile label="Running now" value={Math.round((runningNow / cluster.gpus) * 100) + '%'} note={`${fmt(runningNow)} GPUs in use`} />
        <Tile label="Active projects" value={fmt(active)} note={`of ${projects.length}`} />
        <Tile label="Consumed (in view)" value={fmt(consumed)} note="GPU-h in the window" />
        <Tile label="Headroom" value={fmt(headroomGpus)} note={`${headroomPct}% of GPUs held back`} />
      </div>

      {can('editHeadroom') && (
        <div className="editbar">
          <span className="perm-note perm-on">Operations · admission control</span>
          <label>Headroom</label>
          <span className="numin"><input type="number" min="0" max="50" step="1" value={headroomPct} onChange={(e) => { setHeadroomPct(Number(e.target.value)); setAdmApplied(false) }} style={{ width: 60 }} /><span className="numin-suffix">% held back</span></span>
          <label>Over-subscription</label>
          <span className="numin"><input type="number" min="1" max="2" step="0.05" value={oversub} onChange={(e) => { setOversub(Number(e.target.value)); setAdmApplied(false) }} style={{ width: 60 }} /><span className="numin-suffix">×</span></span>
          <button className="btn primary" disabled={!admDirty} onClick={applyAdmission}>Apply to SLURM</button>
          <span className="hint">{admDirty ? 'Staged.' : admApplied ? 'Applied.' : 'A grant is allowed while committed demand ≤ capacity × (over-subscription − headroom).'}</span>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          Load over time — {drilled ? 'by project' : 'by team'}
          <span className="th-unit" style={{ marginLeft: 8 }}>{chart.mode === 'raw' ? 'job-level steps' : 'daily mean concurrency'}</span>
        </div>
        <div style={{ width: '100%', height: 330 }}>
          <ResponsiveContainer>
            <AreaChart data={chart.rows} margin={{ top: 20, right: 14, left: 8, bottom: 4 }}
              onMouseDown={(e) => { if (e && e.activeLabel != null) { dragRef.current = { a: e.activeLabel, b: e.activeLabel }; setDragSel({ a: e.activeLabel, b: e.activeLabel }) } }}
              onMouseMove={(e) => { if (dragRef.current && e && e.activeLabel != null) { dragRef.current.b = e.activeLabel; setDragSel({ a: dragRef.current.a, b: e.activeLabel }) } }}
              onMouseUp={() => { const d = dragRef.current; dragRef.current = null; setDragSel(null); if (d) { const a = Math.min(d.a, d.b), b = Math.max(d.a, d.b); setSel(b - a > 30 * 60 * 1000 ? { a, b } : null) } }}
              onMouseLeave={() => { const d = dragRef.current; dragRef.current = null; setDragSel(null); if (d) { const a = Math.min(d.a, d.b), b = Math.max(d.a, d.b); if (b - a > 30 * 60 * 1000) setSel({ a, b }) } }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={[t0, fEnd]} ticks={ticks} tick={{ fill: 'var(--ink-2)', fontSize: 11 }}
                tickLine={false} axisLine={{ stroke: 'var(--line)' }} tickFormatter={tickFmt} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54}
                tickFormatter={(v) => (yUnit === 'pct' ? Math.round((v / capGpus) * 100) + '%' : fmt(v))}
                label={{ value: yUnit === 'pct' ? '% capacity' : 'GPUs', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip colourByKey={colourByKey} yUnit={yUnit} capGpus={capGpus} />} cursor={{ stroke: 'var(--ink-2)', strokeWidth: 1 }} />
              {fcOn && fEnd > period.nowMs && (
                <ReferenceArea x1={period.nowMs} x2={fEnd} fill="var(--ink-2)" fillOpacity={0.12} />
              )}
              {chart.units.map((u) => (
                <Area key={u.key} type="stepAfter" dataKey={u.key} name={u.key} stackId="load"
                  stroke="var(--surface)" strokeWidth={0.4} fill={u.colour} fillOpacity={0.95} activeDot={false} isAnimationActive={false} connectNulls />
              ))}
              <ReferenceLine y={capGpus} stroke="var(--ink-2)" strokeDasharray="4 4" label={{ value: 'capacity', fill: 'var(--muted)', fontSize: 11, position: 'insideBottomRight' }} />
              {resvViz.map((r) => (
                <ReferenceArea key={r.id} x1={Math.max(r.startMs, t0)} x2={Math.min(r.endMs, fEnd)} y1={0} y2={r.gpus}
                  fill={r.colour} fillOpacity={0.9} stroke="var(--surface)" strokeWidth={1} />
              ))}
              {sel && !dragSel && (
                <ReferenceArea x1={sel.a} x2={sel.b} fill="var(--accent)" fillOpacity={0.1} stroke="var(--accent)" strokeOpacity={0.5} strokeWidth={1} />
              )}
              {dragSel && (
                <ReferenceArea x1={Math.min(dragSel.a, dragSel.b)} x2={Math.max(dragSel.a, dragSel.b)} fill="var(--accent)" fillOpacity={0.18} />
              )}
              {fEnd > period.nowMs && t0 < period.nowMs && (
                <ReferenceLine x={period.nowMs} stroke="var(--ink)" strokeWidth={2} label={{ value: 'now', fill: 'var(--ink)', fontSize: 11, fontWeight: 600, position: 'top' }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ width: '100%', height: 56 }}>
          <ResponsiveContainer>
            <AreaChart data={overviewRows} margin={{ top: 2, right: 14, left: 8, bottom: 0 }}>
              <XAxis dataKey="t" type="number" domain={[period.startMs, period.endMs]} hide />
              <YAxis hide domain={[0, capGpus]} />
              <Area type="stepAfter" dataKey="load" stroke="none" fill="var(--ink-2)" fillOpacity={0.3} isAnimationActive={false} />
              <ReferenceLine x={period.nowMs} stroke="var(--ink-2)" strokeDasharray="2 2" />
              <Brush dataKey="t" height={28} travellerWidth={9} stroke="var(--accent)" fill="var(--surface)" tickFormatter={fmtDay}
                startIndex={navStart} endIndex={navEnd} onChange={onNav} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="hint" style={{ marginTop: 2 }}>
          Drag the strip to move or resize the visible window across the full timeline
          (May 2025 – Dec 2026). Drag directly on the chart above to select a period for the tables.
        </p>
        <div className="legend-grouped"><div className="lg-row">
          {chart.units.map((u) => <span className="lg-item" key={u.key}><i className="swatch" style={{ background: u.colour }} />{u.key}</span>)}
        </div></div>
        <p className="note">
          Each step is a job starting or ending. Actuals are drawn as steps with no
          smoothing between known points; right of the “now” line is forecast. Wide ranges
          switch to a daily mean so the picture stays legible; zoom in (7d, Today) for the
          job-level detail. Reservations show as solid blocks in their team’s colour.
        </p>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Projects — {selLabel} <span className="th-unit">{projRows.length} shown</span></span>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Drag over the chart to pick a time window; with none, this shows projects active
          now. With a window selected, Budget, Used and Left are for that window; otherwise
          they are each project’s total. {sel && <button className="linkbtn" onClick={() => setSel(null)}>Clear selection</button>}
          {' '}Select a row to scope the chart to that project.
          {drilled && <> <button className="linkbtn" onClick={() => setScope('all')}>Back to all teams</button></>}
        </p>
        <div className="tbl-scroll">
          <DataTable
            onRowClick={(p) => setScope('project:' + p.id)}
            selectedId={scope.startsWith('project:') ? scope.split(':')[1] : null}
            initialSort={{ key: 'used', dir: 'desc' }}
            columns={[
              { key: 'name', label: 'Project', render: (p) => (p.funding === 'person' ? <span className="tag">personal</span> : p.name) },
              { key: 'owner', label: 'Owner', sortValue: (p) => projectOwner(p), render: (p) => projectOwner(p) },
              { key: 'state', label: 'State', sortValue: (p) => projectState(p), render: (p) => <StateTag p={p} /> },
              { key: 'budget', label: 'Budget', num: true, sortValue: (p) => winBudget(p), render: (p) => fmt(winBudget(p)) },
              { key: 'used', label: 'Used', num: true, sortValue: (p) => winUsed(p), render: (p) => fmt(winUsed(p)) },
              { key: 'left', label: 'Left', num: true, sortValue: (p) => winLeft(p), render: (p) => fmt(winLeft(p)) },
              { key: 'prog', label: 'Consumption', sortable: false, render: (p) => { const b = winBudget(p) || 1; const pc = Math.min(100, (winUsed(p) / b) * 100); return (<div className="meter" title={`${Math.round((winUsed(p) / b) * 100)}%`}><span style={{ width: pc + '%' }} /></div>) } },
              { key: 'fc', label: <>Forecast use <InfoTip text="Projected consumption to the project's end, capped at its budget." /></>, num: true, thClass: 'fc-col fc-first', tdClass: 'fc-col fc-first', sortValue: (p) => fEndUse(p, fcMethod), render: (p) => fmt(fEndUse(p, fcMethod)) },
              { key: 'demand', label: <>Demand <InfoTip text="Same projection uncapped; can exceed the budget." /></>, num: true, thClass: 'fc-col', tdClass: 'fc-col', sortValue: (p) => demandEnd(p, fcMethod), render: (p) => fmt(demandEnd(p, fcMethod)) },
              { key: 'diff', label: <>Difference <InfoTip text="Projected demand minus budget at the project's end. Positive is over budget (red), negative is under (green)." /></>, num: true, thClass: 'fc-col', tdClass: 'fc-col', sortValue: (p) => demandEnd(p, fcMethod) - p.budget, render: (p) => { const d = Math.round(demandEnd(p, fcMethod) - p.budget); const pc = Math.round((d / p.budget) * 100); if (d > 0) return <span className="tag warn">+{fmt(d)} (+{pc}%)</span>; if (d < 0) return <span className="tag ok">{fmt(d)} ({pc}%)</span>; return <span className="hint">0</span> } },
              { key: 'runs', label: 'Budget runs out', thClass: 'fc-col', tdClass: 'fc-col', sortValue: (p) => runsOut(p, fcMethod) ?? Infinity, render: (p) => { const d = runsOut(p, fcMethod); return d ? <span className="tag warn">~{fmtDay(d)}</span> : <span className="hint">within budget</span> } },
            ]}
            rows={projRows}
          />
        </div>
        <p className="hint">
          The shaded columns are forecast to each project’s end from its recent job rate.
          <b> Forecast use</b> is capped at the budget; <b>Demand</b> is uncapped, so
          <b> Difference</b> is projected demand minus budget: over budget in red, under in green.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Reservations — {selLabel} <span className="th-unit">{resvRows.length} shown</span></div>
        <DataTable
          initialSort={{ key: 'start', dir: 'asc' }}
          columns={[
            { key: 'start', label: 'Window', sortValue: (r) => r.startMs, render: (r) => `${fmtDay(r.startMs)} – ${fmtDay(r.endMs)}` },
            { key: 'project', label: 'Project', sortValue: (r) => projName(r.projectId), render: (r) => projName(r.projectId) },
            { key: 'label', label: 'What' },
            { key: 'gpus', label: 'GPUs', num: true },
          ]}
          rows={resvRows}
        />
      </div>
    </section>
  )
}

// forecast helpers for the table (per project, to its own end)
function daysToEnd(p) { return Math.max(0, (Math.min(p.endMs, period.endMs) - period.nowMs) / DAY) }
function demandEnd(p, m) { return Math.round(p.used + projRate(p, m) * daysToEnd(p)) }
function fEndUse(p, m) { return Math.round(Math.min(p.budget, p.used + projRate(p, m) * daysToEnd(p))) }
function runsOut(p, m) {
  const rate = projRate(p, m)
  if (rate <= 0 || p.used >= p.budget) return null
  const d = period.nowMs + ((p.budget - p.used) / rate) * DAY
  return d <= Math.min(p.endMs, period.endMs) ? d : null
}
function projName(id) { return projects.find((p) => p.id === id)?.name ?? id }

function StateTag({ p }) {
  const s = projectState(p)
  if (s === 'active') return <span className="tag ok">active</span>
  if (s === 'planned') return <span className="tag">planned</span>
  return <span className="hint">finished</span>
}

function Tile({ label, value, note }) {
  return (<div className="tile"><div className="tile-label">{label}</div><div className="tile-value">{value}</div>{note && <div className="tile-note">{note}</div>}</div>)
}
