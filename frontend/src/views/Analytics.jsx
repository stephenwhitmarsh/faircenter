import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import InfoTip from '../components/InfoTip.jsx'
import { kpiHistory, KPIS, paramEvents } from '../data/mockData.js'

const fmt = (n) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-GB') : n)
const SUM_KEYS = new Set(['consumed', 'committed', 'changes'])
const QUARTER = { Jan: 'Q1', Feb: 'Q1', Mar: 'Q1', Apr: 'Q2', May: 'Q2', Jun: 'Q2', Jul: 'Q3', Aug: 'Q3', Sep: 'Q3', Oct: 'Q4', Nov: 'Q4', Dec: 'Q4' }

function aggregate(periods, gran) {
  if (gran === 'month') return periods
  const groups = {}
  for (const p of periods) { const q = QUARTER[p.period]; (groups[q] ||= []).push(p) }
  return Object.entries(groups).map(([q, arr]) => {
    const out = { period: q, forecast: arr[arr.length - 1].forecast }
    for (const m of KPIS) {
      const vals = arr.map((a) => a[m.key])
      out[m.key] = SUM_KEYS.has(m.key) ? vals.reduce((s, v) => s + v, 0) : +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)
    }
    return out
  })
}

export default function Analytics() {
  const [kpiKey, setKpiKey] = useState('util')
  const [gran, setGran] = useState('month')
  const kpi = KPIS.find((k) => k.key === kpiKey)

  const periods = useMemo(() => aggregate(kpiHistory, gran), [gran])
  const actualPeriods = periods.filter((p) => !p.forecast)
  const latest = actualPeriods[actualPeriods.length - 1]
  const prev = actualPeriods[actualPeriods.length - 2]
  const firstForecast = periods.find((p) => p.forecast)
  const lastActualIdx = periods.map((p) => p.forecast).lastIndexOf(false)

  const chart = periods.map((p, i) => ({
    period: p.period,
    actual: p.forecast ? null : p[kpiKey],
    // join the two lines at the boundary so the dashed forecast starts from the last actual
    projected: p.forecast || i === lastActualIdx ? p[kpiKey] : null,
  }))

  const events = gran === 'month'
    ? paramEvents.filter((e) => periods.some((p) => p.period === e.period))
    : paramEvents.map((e) => ({ ...e, period: QUARTER[e.period] })).filter((e) => periods.some((p) => p.period === e.period))

  const unit = (v) => (v == null ? '—' : fmt(v) + (kpi.unit ? (kpi.unit === '%' ? '%' : ' ' + kpi.unit) : ''))
  const delta = latest && prev ? latest[kpiKey] - prev[kpiKey] : null

  return (
    <section>
      <div className="view-head">
        <h2 className="view-title">Analytics</h2>
        <p className="view-intro">
          How the allocation system behaves over time. Each indicator is drawn from the
          Planning and Budgets views and tracked per period, past and forecast, so trends
          and the effect of policy changes can be read together. Pick an indicator and a
          period length; policy changes are marked on the trend.
        </p>
      </div>

      <div className="controls">
        <label>Indicator</label>
        <select value={kpiKey} onChange={(e) => setKpiKey(e.target.value)} style={{ minWidth: 220 }}>
          {KPIS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        <label style={{ marginLeft: 8 }}>Period</label>
        <div className="seg">
          <button className={gran === 'month' ? 'active' : ''} onClick={() => setGran('month')}>Monthly</button>
          <button className={gran === 'quarter' ? 'active' : ''} onClick={() => setGran('quarter')}>Quarterly</button>
        </div>
      </div>

      <div className="tiles">
        <Tile label="Latest" value={unit(latest?.[kpiKey])} note={`${latest?.period ?? ''}`} />
        <Tile label="Change vs previous" value={delta == null ? '—' : (delta > 0 ? '+' : '') + fmt(+delta.toFixed(2))}
          note={deltaNote(delta, kpi.better)} tone={deltaTone(delta, kpi.better)} />
        <Tile label="Forecast next" value={unit(firstForecast?.[kpiKey])} note={firstForecast ? `${firstForecast.period} (projected)` : '—'} />
        <Tile label="Period average" value={unit(avg(actualPeriods, kpiKey))} note="over shown actuals" />
      </div>

      <div className="card">
        <div className="card-title">
          {kpi.label} over time
          <InfoTip text="Solid is actual, dashed is forecast. Dotted vertical lines mark policy changes, so you can see how an indicator moved after one." />
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: 'var(--ink-2)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54}
                unit={kpi.unit === '%' ? '%' : undefined} domain={kpi.unit === '%' ? [0, 100] : ['auto', 'auto']} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [unit(v), kpi.label]} />
              {events.map((e, i) => (
                <ReferenceLine key={i} x={e.period} stroke="var(--muted)" strokeDasharray="3 3"
                  label={{ value: e.label, fill: 'var(--muted)', fontSize: 10, position: 'insideTopRight', angle: 0 }} />
              ))}
              <Line type="monotone" dataKey="actual" name={kpi.label} stroke="#2a78d6" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="projected" name="forecast" stroke="#6da7ec" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="hint">
          Long waits in a lane point to its price; a period-end scramble to budget sizing;
          a rise in change requests to budgets set too tight. Because policy values are
          versioned, each move can be read against the change that preceded it.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Indicator scorecard <span className="th-unit">latest actual ({latest?.period})</span></div>
        <table className="data">
          <thead>
            <tr><th>Indicator</th><th className="num">Latest</th><th className="num">Previous</th><th className="num">Change</th></tr>
          </thead>
          <tbody>
            {KPIS.map((m) => {
              const d = latest && prev ? latest[m.key] - prev[m.key] : null
              return (
                <tr key={m.key} className="row-click" onClick={() => setKpiKey(m.key)}>
                  <td>{m.label}</td>
                  <td className="num">{valUnit(latest?.[m.key], m)}</td>
                  <td className="num">{valUnit(prev?.[m.key], m)}</td>
                  <td className="num" style={{ color: `var(--${deltaTone(d, m.better)})` }}>{d == null ? '—' : (d > 0 ? '+' : '') + fmt(+d.toFixed(2))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="hint">Select a row to chart that indicator above.</p>
      </div>
    </section>
  )
}

function avg(rows, key) {
  if (!rows.length) return null
  return +(rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(2)
}
function valUnit(v, m) {
  if (v == null) return '—'
  return fmt(v) + (m.unit ? (m.unit === '%' ? '%' : ' ' + m.unit) : '')
}
function deltaTone(d, better) {
  if (d == null || d === 0 || better === 'neutral') return 'muted'
  const good = better === 'high' ? d > 0 : d < 0
  return good ? 'good' : 'critical'
}
function deltaNote(d, better) {
  if (d == null) return ''
  const tone = deltaTone(d, better)
  if (tone === 'good') return 'improving'
  if (tone === 'critical') return 'worsening'
  return 'vs previous period'
}

function Tile({ label, value, note, tone }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}
