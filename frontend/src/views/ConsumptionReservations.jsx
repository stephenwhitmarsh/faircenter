import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
} from 'recharts'
import DataTable from '../components/DataTable.jsx'
import {
  cluster, projects, teams, people, reservations, parameters, period,
  projectOwner, ownerBucket, teamById, dailyIncrements, hourlyActualToday, forecastBuckets,
  exhaustionDay, dayLabel, hourLabel,
} from '../data/mockData.js'

const fmt = (n) => Math.round(n).toLocaleString('en-GB')

const FAMILIES = {
  Pretraining: ['#2a78d6', '#6da7ec'],
  'Fine-tuning': ['#eb6834', '#f2a07f'],
  Evaluation: ['#1baf7a', '#7fd3b6'],
  Personal: ['#4a3aa7', '#9085e9'],
  Organisation: ['#e87ba4', '#f0b3c9'],
}
const COLOURS = (() => {
  const seen = {}, map = {}
  for (const p of projects) {
    const b = ownerBucket(p)
    const fam = FAMILIES[b] ?? ['#898781']
    const i = seen[b] ?? 0
    map[p.id] = fam[i % fam.length]
    seen[b] = i + 1
  }
  return map
})()

const TEAM_HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#008300', '#e34948', '#4a3aa7', '#e87ba4']
const TEAM_COLOUR = Object.fromEntries(teams.map((t, i) => [t.name, TEAM_HUES[i % TEAM_HUES.length]]))
function bucketColour(name) {
  if (name === 'Personal') return '#9085e9'
  if (name === 'Organisation') return '#898781'
  return TEAM_COLOUR[name] ?? '#898781'
}
function projectBucketName(p) {
  if (p.teamId) return teamById(p.teamId)?.name ?? 'Organisation'
  if (p.funding === 'person') return 'Personal'
  return 'Organisation'
}

function selectedProjects(scope) {
  if (scope === 'all') return projects
  const [k, id] = scope.split(':')
  if (k === 'team') return projects.filter((p) => p.teamId === id)
  if (k === 'person') return projects.filter((p) => p.personId === id)
  if (k === 'project') return projects.filter((p) => p.id === id)
  return projects
}

function unitsForScope(scope, subset) {
  if (scope === 'all') {
    const order = [...teams.map((t) => t.name), 'Personal', 'Organisation']
    const byB = {}
    for (const p of projects) { const b = projectBucketName(p); (byB[b] ||= []).push(p) }
    return order.filter((b) => byB[b]).map((b) => ({ key: 'b:' + b, label: b, projects: byB[b], colour: bucketColour(b) }))
  }
  return subset.map((p) => ({ key: p.id, label: p.name, projects: [p], colour: COLOURS[p.id] }))
}

function horizonDays(forecast) {
  if (forecast === '7') return 7
  if (forecast === '14') return 14
  return 30
}

function buildSeries(range, units, custom, forecast) {
  const allP = units.flatMap((u) => u.projects)
  const fcOn = forecast !== 'off'

  if (range === 'today') {
    const lastHour = fcOn ? 23 : period.nowHour
    const fcCount = 23 - period.nowHour
    const act = {}, fc = {}
    for (const p of allP) {
      const a = hourlyActualToday(p).map((x) => x.value)
      act[p.id] = a
      fc[p.id] = forecastBuckets(p, a, fcCount)
    }
    const valAt = (p, h) => (h <= period.nowHour ? act[p.id][h] : fc[p.id][h - period.nowHour - 1])
    const usedBefore = {}
    for (const p of allP) usedBefore[p.id] = p.used - act[p.id].reduce((s, v) => s + v, 0)
    const cumAt = (p, h) => {
      if (h <= period.nowHour) { let s = usedBefore[p.id]; for (let i = 0; i <= h; i++) s += act[p.id][i]; return s }
      let s = p.used; for (let i = 0; i <= h - period.nowHour - 1; i++) s += fc[p.id][i]; return s
    }
    const rows = []
    for (let h = 0; h <= lastHour; h++) {
      const row = { label: hourLabel(h), forecast: h > period.nowHour }
      for (const u of units) {
        row[u.key] = u.projects.reduce((s, p) => s + (valAt(p, h) || 0), 0)
        row[u.key + ':cum'] = u.projects.reduce((s, p) => s + cumAt(p, h), 0)
      }
      rows.push(row)
    }
    return { rows, nowLabel: hourLabel(period.nowHour), lastLabel: hourLabel(lastHour), showForecast: fcOn, fcLabel: 'forecast' }
  }

  let ds, de
  if (range === 'custom') {
    const toDay = (s) => (s ? Math.min(period.today, Math.max(1, Number(s.slice(-2)))) : null)
    ds = toDay(custom.from) ?? 1
    de = toDay(custom.to) ?? period.today
    if (ds > de) [ds, de] = [de, ds]
  } else {
    de = period.today
    ds = range === 'last7' ? period.today - 6 : period.today - 13
    ds = Math.max(1, ds)
  }
  const hd = horizonDays(forecast)
  const fcEnd = period.today + hd
  const showForecast = fcOn && de >= period.today

  const dailyActual = {}, fc = {}
  for (const p of allP) {
    dailyActual[p.id] = dailyIncrements(p)
    fc[p.id] = forecastBuckets(p, dailyActual[p.id], hd)
  }
  // cumulative consumed by end of day d: sum of actual increments through d,
  // then p.used plus forecast increments past today
  const cumAtDay = (p, d) => {
    if (d <= period.today) { let s = 0; for (let i = 0; i < d; i++) s += dailyActual[p.id][i] || 0; return s }
    let s = p.used; for (let i = 0; i < d - period.today; i++) s += fc[p.id][i] || 0; return s
  }
  const rows = []
  for (let d = ds; d <= de; d++) {
    const row = { label: dayLabel(d), forecast: false }
    for (const u of units) {
      row[u.key] = u.projects.reduce((s, p) => s + (dailyActual[p.id][d - 1] || 0), 0)
      row[u.key + ':cum'] = u.projects.reduce((s, p) => s + cumAtDay(p, d), 0)
    }
    rows.push(row)
  }
  if (showForecast) {
    for (let d = period.today + 1; d <= fcEnd; d++) {
      const row = { label: dayLabel(d), forecast: true }
      for (const u of units) {
        row[u.key] = u.projects.reduce((s, p) => s + (fc[p.id][d - period.today - 1] || 0), 0)
        row[u.key + ':cum'] = u.projects.reduce((s, p) => s + cumAtDay(p, d), 0)
      }
      rows.push(row)
    }
  }
  return {
    rows,
    nowLabel: de >= period.today ? dayLabel(period.today) : null,
    lastLabel: dayLabel(showForecast ? fcEnd : de),
    showForecast,
    fcLabel: `forecast · ${hd}d`,
  }
}

function ChartTooltip({ active, payload, label, colourByLabel, budgetByLabel, yUnit, cap }) {
  if (!active || !payload || !payload.length) return null
  const items = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value)
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  const show = (v) => (yUnit === 'pct' ? Math.round((v / cap) * 100) + '%' : fmt(v) + ' GPU-h')
  const budgetPct = (p) => {
    const b = budgetByLabel?.[p.name]
    const cum = p.payload?.[p.dataKey + ':cum']
    if (!b || cum == null) return null
    return Math.round((cum / b) * 100)
  }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '8px 10px', minWidth: 200 }}>
      <div style={{ color: 'var(--ink-2)', marginBottom: 5 }}>{label}</div>
      {items.map((p) => {
        const bp = budgetPct(p)
        return (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '2px 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: colourByLabel[p.name] || p.color, display: 'inline-block' }} />
              {p.name}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
              <span>{show(p.value)}</span>
              {bp != null && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{bp}% of budget</span>}
            </span>
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 5, paddingTop: 5, fontWeight: 600 }}>
        <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{show(total)}</span>
      </div>
    </div>
  )
}

export default function ConsumptionReservations() {
  const [scope, setScope] = useState('all')
  const [range, setRange] = useState('today')
  const [forecast, setForecast] = useState('14')
  const [yUnit, setYUnit] = useState('gpuh')
  const [custom, setCustom] = useState({ from: '2026-09-01', to: '2026-09-12' })

  const subset = selectedProjects(scope)
  const units = useMemo(() => unitsForScope(scope, subset), [scope]) // eslint-disable-line react-hooks/exhaustive-deps
  const { rows, nowLabel, lastLabel, showForecast, fcLabel } = useMemo(
    () => buildSeries(range, units, custom, forecast),
    [range, scope, custom, forecast], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const colourByLabel = Object.fromEntries(units.map((u) => [u.label, u.colour]))
  const budgetByLabel = Object.fromEntries(units.map((u) => [u.label, u.projects.reduce((s, p) => s + p.budget, 0)]))
  // nominal capacity per time bucket, used for the % view and the capacity line
  const cap = range === 'today'
    ? cluster.capacityGpuHours / (period.totalDays * 24)
    : cluster.capacityGpuHours / period.totalDays

  const committed = projects.reduce((s, p) => s + p.budget, 0)
  const headroom = Math.round(cluster.capacityGpuHours * parameters.headroom.org)
  const stillFree = cluster.capacityGpuHours - committed - headroom
  const usedShown = rows.filter((r) => !r.forecast)
    .reduce((s, r) => s + units.reduce((a, u) => a + (r[u.key] || 0), 0), 0)

  const drilled = scope !== 'all'

  return (
    <section>
      <div className="view-head">
        <h2 className="view-title">Consumption &amp; reservations</h2>
        <p className="view-intro">
          Total GPU consumption over time, stacked by team so the whole shows the load
          on the cluster. Scope to a team to break its band into projects. Past “now”
          the load is forecast from each project’s recent rate, capped at the budget it
          has left, over a rolling horizon you choose.
        </p>
      </div>

      <div className="controls">
        <label>Scope</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All teams</option>
          <optgroup label="Team">
            {teams.map((t) => <option key={t.id} value={'team:' + t.id}>{t.name}</option>)}
          </optgroup>
          <optgroup label="Person">
            {people.filter((p) => projects.some((pr) => pr.personId === p.id)).map((p) => (
              <option key={p.id} value={'person:' + p.id}>{p.name}</option>
            ))}
          </optgroup>
          <optgroup label="Project">
            {projects.map((p) => <option key={p.id} value={'project:' + p.id}>{p.name}</option>)}
          </optgroup>
        </select>

        <label style={{ marginLeft: 8 }}>Range</label>
        <div className="seg">
          <button className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>Today</button>
          <button className={range === 'last7' ? 'active' : ''} onClick={() => setRange('last7')}>Last 7 days</button>
          <button className={range === 'last14' ? 'active' : ''} onClick={() => setRange('last14')}>Last 14 days</button>
          <button className={range === 'custom' ? 'active' : ''} onClick={() => setRange('custom')}>Custom</button>
        </div>
        {range === 'custom' && (
          <>
            <input type="date" min="2026-09-01" max="2026-09-12" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span className="hint">to</span>
            <input type="date" min="2026-09-01" max="2026-09-12" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </>
        )}

        <label style={{ marginLeft: 8 }}>Forecast</label>
        <div className="seg">
          <button className={forecast === 'off' ? 'active' : ''} onClick={() => setForecast('off')}>Off</button>
          <button className={forecast === '7' ? 'active' : ''} onClick={() => setForecast('7')}>7d</button>
          <button className={forecast === '14' ? 'active' : ''} onClick={() => setForecast('14')}>14d</button>
          <button className={forecast === '30' ? 'active' : ''} onClick={() => setForecast('30')}>30d</button>
        </div>

        <label style={{ marginLeft: 8 }}>Y-axis</label>
        <div className="seg">
          <button className={yUnit === 'gpuh' ? 'active' : ''} onClick={() => setYUnit('gpuh')}>GPU-h</button>
          <button className={yUnit === 'pct' ? 'active' : ''} onClick={() => setYUnit('pct')}>% capacity</button>
        </div>
      </div>

      <div className="tiles">
        <Tile label="Cluster capacity" value={fmt(cluster.capacityGpuHours)} note="GPU-hours / period" />
        <Tile label="Committed budgets" value={fmt(committed)} note={pct(committed, cluster.capacityGpuHours)} />
        <Tile label="Used (shown)" value={fmt(usedShown)} note={rangeNote(range)} />
        <Tile label="Headroom" value={fmt(headroom)} note={`${Math.round(parameters.headroom.org * 100)}% held back`} />
        <Tile label="Still free" value={fmt(stillFree)} note={pct(stillFree, cluster.capacityGpuHours)} />
      </div>

      <div className="card">
        <div className="card-title">
          Consumption over time {range === 'today' ? '(today, by hour)' : '(by day)'}
          {' — '}{drilled ? 'by project' : 'by team'}
        </div>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <AreaChart data={rows} margin={{ top: 22, right: 12, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--ink-2)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={16} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54}
                tickFormatter={(v) => (yUnit === 'pct' ? Math.round((v / cap) * 100) + '%' : fmt(v))}
                label={{ value: yUnit === 'pct' ? '% capacity' : 'GPU-h', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip colourByLabel={colourByLabel} budgetByLabel={budgetByLabel} yUnit={yUnit} cap={cap} />} cursor={{ stroke: 'var(--ink-2)', strokeWidth: 1 }} />
              {showForecast && nowLabel && (
                <ReferenceArea x1={nowLabel} x2={lastLabel} fill="var(--ink-2)" fillOpacity={0.12} label={{ value: fcLabel, fill: 'var(--ink-2)', fontSize: 11, position: 'insideTopRight' }} />
              )}
              {units.map((u) => (
                <Area key={u.key} type="monotone" dataKey={u.key} name={u.label} stackId="use"
                  stroke="var(--surface)" strokeWidth={0.5} fill={u.colour} fillOpacity={0.95}
                  activeDot={false} isAnimationActive={false} />
              ))}
              <ReferenceLine y={cap} stroke="var(--ink-2)" strokeDasharray="4 4" label={{ value: 'capacity', fill: 'var(--muted)', fontSize: 11, position: 'insideBottomRight' }} />
              {nowLabel && <ReferenceLine x={nowLabel} stroke="var(--ink)" strokeWidth={2} ifOverflow="visible" label={{ value: 'now', fill: 'var(--ink)', fontSize: 11, fontWeight: 600, position: 'top' }} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="legend-grouped">
          <div className="lg-row">
            {units.map((u) => (
              <span className="lg-item" key={u.key}>
                <i className="swatch" style={{ background: u.colour }} />{u.label}
              </span>
            ))}
          </div>
        </div>
        <p className="note">
          {drilled
            ? 'Each band is one project in the scoped team; the stack is that team’s load.'
            : 'Each band is one team’s total consumption (with personal and organisation work separate); the stack is the whole cluster’s load. Scope to a team to split its band into projects.'}
          {' '}Right of the “now” line is forecast over the chosen horizon, capped so a
          project never draws more than the budget it has left. The dashed line marks
          nominal cluster capacity.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Projects this period</div>
        <DataTable
          initialSort={{ key: 'budget', dir: 'desc' }}
          columns={[
            { key: 'name', label: 'Project' },
            { key: 'owner', label: 'Owner', sortValue: (p) => projectOwner(p), render: (p) => projectOwner(p) },
            { key: 'budget', label: 'Budget', num: true, render: (p) => fmt(p.budget) },
            { key: 'used', label: 'Used to date', num: true, render: (p) => fmt(p.used) },
            {
              key: 'progress', label: 'Progress', sortable: false,
              render: (p) => (
                <div className="meter" title={`${Math.round((p.used / p.budget) * 100)}% of budget used`}>
                  <span style={{ width: Math.min(100, (p.used / p.budget) * 100) + '%' }} />
                </div>
              ),
            },
            {
              key: 'forecast', label: 'Forecast use', num: true,
              sortValue: (p) => forecastEnd(p),
              render: (p) => fmt(forecastEnd(p)),
            },
            {
              key: 'exhaust', label: 'Budget runs out', sortValue: (p) => exhaustionDay(p) ?? 999,
              render: (p) => {
                const d = exhaustionDay(p)
                return d ? <span className="tag warn">~{dayLabel(d)}</span> : <span className="hint">within budget</span>
              },
            },
            {
              key: 'daysleft', label: 'Days left', num: true,
              sortValue: (p) => { const d = exhaustionDay(p); return d ? d - period.today : 999 },
              render: (p) => {
                const d = exhaustionDay(p)
                return d ? Math.max(0, d - period.today) : <span className="hint">—</span>
              },
            },
          ]}
          rows={projects}
        />
        <p className="hint">
          Forecast use is projected at the recent rate but capped at the budget, so it
          never exceeds it. “Budget runs out” flags projects on track to hit their cap
          before the period ends.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Reservations</div>
        <DataTable
          initialSort={{ key: 'start', dir: 'asc' }}
          columns={[
            { key: 'start', label: 'Window', sortValue: (r) => r.start, render: (r) => (r.start === r.end ? r.start : `${r.start} to ${r.end}`) },
            { key: 'project', label: 'Project', sortValue: (r) => projName(r.projectId), render: (r) => projName(r.projectId) },
            { key: 'label', label: 'What' },
            { key: 'gpus', label: 'GPUs', num: true },
          ]}
          rows={reservations}
        />
      </div>
    </section>
  )
}

function forecastEnd(p) {
  const fc = forecastBuckets(p, dailyIncrements(p), period.totalDays - period.today)
  return p.used + fc.reduce((s, v) => s + v, 0)
}

function projName(id) { return projects.find((p) => p.id === id)?.name ?? id }

function Tile({ label, value, note }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}

function pct(part, whole) { return Math.round((part / whole) * 100) + '% of capacity' }
function rangeNote(range) {
  if (range === 'today') return 'today so far'
  if (range === 'last7') return 'last 7 days'
  if (range === 'last14') return 'last 14 days'
  return 'selected window'
}
