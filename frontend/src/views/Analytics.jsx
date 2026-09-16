import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import InfoTip from '../components/InfoTip.jsx'
import Overview from './Overview.jsx'
import { kpiSeries, KPIS, paramEvents, KNOWN_KEYS, kpiForecast, resourceOutlook, period } from '../data/mockData.js'

const fmt = (n) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-GB') : Math.round(n * 100) / 100)
const LINE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#8b5cf6', '#e8368f', '#0ea5b7', '#eda100', '#6366f1', '#f43f5e']
const EVENT_COLOR = { mechanism: 'var(--accent)', value: 'var(--muted)', phase: 'var(--ink-2)', capacity: '#1baf7a' }
const METHODS = [{ k: 'last', label: 'Last' }, { k: 'linear', label: 'Linear' }, { k: 'smooth', label: 'Smooth' }]
const LOOKBACKS = [{ m: 3, label: '3m' }, { m: 6, label: '6m' }, { m: 12, label: '12m' }, { m: 0, label: 'All' }]
const HORIZONS = [{ m: -1, label: 'None' }, { m: 6, label: '6m' }, { m: 12, label: '12m' }, { m: 0, label: 'Max' }]
const HOURS_MONTH = (365.25 / 12) * 24 * 3600 * 1000

// retained across view switches
const memo = { kpiKeys: ['util'], gran: 'month', cmpA: null, cmpB: null, showForecast: true, method: 'linear', lead: 3, lookback: 6, horizon: 6 }

export default function Analytics({ onNav }) {
  const [kpiKeys, setKpiKeys] = useState(memo.kpiKeys)
  const [gran, setGran] = useState(memo.gran)
  const [cmpA, setCmpA] = useState(memo.cmpA)
  const [cmpB, setCmpB] = useState(memo.cmpB)
  const [showForecast, setShowForecast] = useState(memo.showForecast)
  const [method, setMethod] = useState(memo.method)
  const [lead, setLead] = useState(memo.lead)
  const [lookback, setLookback] = useState(memo.lookback)
  const [horizon, setHorizon] = useState(memo.horizon)
  useEffect(() => { memo.kpiKeys = kpiKeys; memo.gran = gran; memo.cmpA = cmpA; memo.cmpB = cmpB; memo.showForecast = showForecast; memo.method = method; memo.lead = lead; memo.lookback = lookback; memo.horizon = horizon })
  // clip the forecast region to the chosen horizon (future buckets with t0 before the cutoff)
  const cutoff = horizon > 0 ? period.nowMs + horizon * HOURS_MONTH : Infinity
  const multi = kpiKeys.length > 1
  const primaryKey = kpiKeys[0]
  const kpi = KPIS.find((k) => k.key === primaryKey) || KPIS[0]
  // when several selected indicators share a unit, overlay them on one real axis (so the gap is
  // meaningful); otherwise each is scaled to its own range to fit the frame.
  const multiUnit = multi && new Set(kpiKeys.map((k) => KPIS.find((x) => x.key === k)?.unit || '')).size === 1
    ? (KPIS.find((x) => x.key === primaryKey)?.unit || '') : null
  const toggleKpi = (key) => setKpiKeys((ks) => (ks.includes(key) ? (ks.length > 1 ? ks.filter((k) => k !== key) : ks) : [...ks, key]))

  const periods = useMemo(() => kpiSeries(gran), [gran])
  // the in-progress period is incomplete; treat it as part of the forecast region, not a complete actual
  const isFuture = (p) => p.forecast || p.partial
  const completePeriods = periods.filter((p) => !isFuture(p))
  const actualPeriods = completePeriods
  const latest = completePeriods[completePeriods.length - 1]
  const prev = completePeriods[completePeriods.length - 2]
  const firstForecast = periods.find((p) => isFuture(p))
  const chartPeriods = showForecast ? periods.filter((p) => !isFuture(p) || p.t0 < cutoff) : completePeriods
  const lastActualIdx = chartPeriods.map((p) => isFuture(p)).lastIndexOf(false)

  // resolve each selected series: actual values, with the forecast region replaced by the model
  // projection (known series keep their true future); used for the multi overlay and its ranges.
  const resolved = useMemo(() => {
    const map = {}
    for (const k of kpiKeys) {
      const arr = chartPeriods.map((p) => p[k])
      if (showForecast && !KNOWN_KEYS.has(k)) {
        const fc = kpiForecast(k, gran, method, lookback, horizon); let fi = 0
        for (let i = 0; i < chartPeriods.length; i++) { if (isFuture(chartPeriods[i])) { arr[i] = fc && fc.point[fi] != null ? Math.round(fc.point[fi]) : arr[i]; fi++ } }
      }
      map[k] = arr
    }
    return map
  }, [kpiKeys, chartPeriods, showForecast, method, gran, lookback, horizon])

  const ranges = useMemo(() => {
    const r = {}
    for (const k of kpiKeys) { let mn = Infinity, mx = -Infinity; for (const v of resolved[k]) { if (v == null) continue; if (v < mn) mn = v; if (v > mx) mx = v } r[k] = { mn, span: (mx - mn) || 1 } }
    return r
  }, [kpiKeys, resolved])

  // single-indicator forecast (with band) for the primary series
  const primaryFc = useMemo(() => (showForecast && !KNOWN_KEYS.has(primaryKey) ? kpiForecast(primaryKey, gran, method, lookback, horizon) : null), [primaryKey, showForecast, method, gran, lookback, horizon])
  // per-series forecasts for the overlay, so each forecast line can carry its own low–high band
  const multiFc = useMemo(() => {
    const m = {}
    if (multi && showForecast) for (const k of kpiKeys) if (!KNOWN_KEYS.has(k)) m[k] = kpiForecast(k, gran, method, lookback, horizon)
    return m
  }, [multi, kpiKeys, showForecast, method, gran, lookback, horizon])
  const fcKeys = multi ? kpiKeys.filter((k) => !KNOWN_KEYS.has(k)) : []

  const chart = (() => {
    if (multi) {
      const fiByKey = {}; for (const k of kpiKeys) fiByKey[k] = 0
      return chartPeriods.map((p, i) => {
        const row = { period: p.period }
        const fut = isFuture(chartPeriods[i])
        for (const k of kpiKeys) {
          const norm = (val) => (val == null ? null : (multiUnit != null ? val : (val - ranges[k].mn) / ranges[k].span))
          const scaled = norm(resolved[k][i])
          row[k + '__raw'] = resolved[k][i]
          // split each series into a solid actual segment and a dashed forecast segment (known series
          // are solid throughout); the last actual point seeds the forecast so the two segments join.
          if (KNOWN_KEYS.has(k)) { row[k + '_a'] = scaled; row[k + '_f'] = null }
          else {
            row[k + '_a'] = !fut ? scaled : null
            row[k + '_f'] = (fut || i === lastActualIdx) ? scaled : null
            // low–high band for the forecast segment, in the same scaled space as the line
            const fc = multiFc[k]
            if (fc && i === lastActualIdx) { row[k + '_lo'] = scaled; row[k + '_span'] = 0 }
            else if (fc && fut) {
              const j = fiByKey[k]
              const lo = fc.lo[j] != null ? norm(Math.round(fc.lo[j])) : null
              const hi = fc.hi[j] != null ? norm(Math.round(fc.hi[j])) : null
              row[k + '_lo'] = lo; row[k + '_span'] = lo != null && hi != null ? hi - lo : null
            }
          }
          if (fut && !KNOWN_KEYS.has(k)) fiByKey[k]++
        }
        return row
      })
    }
    const known = KNOWN_KEYS.has(primaryKey); let fi = 0
    return chartPeriods.map((p, i) => {
      if (known) return { period: p.period, actual: p[primaryKey], projected: null }
      if (!isFuture(p)) return { period: p.period, actual: p[primaryKey], projected: i === lastActualIdx ? p[primaryKey] : null, bandBase: i === lastActualIdx ? p[primaryKey] : null, bandSpan: 0 }
      const pt = primaryFc ? Math.round(primaryFc.point[fi]) : p[primaryKey]
      const lo = primaryFc ? Math.round(primaryFc.lo[fi]) : null
      const hi = primaryFc ? Math.round(primaryFc.hi[fi]) : null
      fi++
      return { period: p.period, actual: null, projected: pt, bandBase: lo, bandSpan: lo != null && hi != null ? hi - lo : null }
    })
  })()

  const events = paramEvents.map((e) => { const b = [...chartPeriods].reverse().find((p) => p.t0 != null && p.t0 <= e.at); return b ? { period: b.period, label: e.label, kind: e.kind } : null }).filter(Boolean)
  const eventsByPeriod = {}; for (const e of events) (eventsByPeriod[e.period] = eventsByPeriod[e.period] || []).push(e)

  const unit = (v) => (v == null ? '—' : fmt(v) + (kpi.unit ? (kpi.unit === '%' ? '%' : ' ' + kpi.unit) : ''))
  const delta = latest && prev ? latest[primaryKey] - prev[primaryKey] : null
  const aRow = periods.find((p) => p.period === cmpA) || latest
  const bRow = periods.find((p) => p.period === cmpB) || prev

  const known = KNOWN_KEYS.has(primaryKey)
  const outlook = useMemo(() => resourceOutlook(gran, method, lead, lookback, horizon), [gran, method, lead, lookback, horizon])
  const st = outlook.stats
  // when forecast is off, show only actuals (up to the last complete period); otherwise clip to horizon
  const oRows = outlook.rows
    .filter((r) => (showForecast ? (!(r.forecast || r.partial) || r.t0 < cutoff) : !(r.forecast || r.partial)))
    .map((r) => (showForecast
      ? { ...r, bandBase: r.useLo != null ? r.useLo : null, bandSpan: r.useLo != null && r.useHi != null ? r.useHi - r.useLo : null }
      : { ...r, useFc: null, useLo: null, useHi: null, bandBase: null, bandSpan: null }))

  return (
    <section>
      {/* operations dashboard, folded in from the former Operations tab */}
      <Overview onNav={onNav} />

      {/* ---- shared controls: drive both graphs, so they sit outside either frame ---- */}
      <div className="controls">
        <label>Period</label>
        <div className="seg">
          <button className={gran === 'week' ? 'active' : ''} onClick={() => setGran('week')}>Weekly</button>
          <button className={gran === 'month' ? 'active' : ''} onClick={() => setGran('month')}>Monthly</button>
          <button className={gran === 'quarter' ? 'active' : ''} onClick={() => setGran('quarter')}>Quarterly</button>
        </div>
        <label style={{ marginLeft: 8 }} title="How the demand-driven series are projected. Known series are never extrapolated.">Method</label>
        <div className="seg">
          {METHODS.map((m) => <button key={m.k} className={method === m.k ? 'active' : ''} onClick={() => setMethod(m.k)}>{m.label}</button>)}
        </div>
        <label style={{ marginLeft: 8 }} title="How far back the fit looks, as a fixed span, so weekly, monthly and quarterly stay comparably stable.">Lookback</label>
        <div className="seg">
          {LOOKBACKS.map((l) => <button key={l.m} className={lookback === l.m ? 'active' : ''} onClick={() => setLookback(l.m)}>{l.label}</button>)}
        </div>
        <label style={{ marginLeft: 8 }} title="How far ahead the forecast runs. None hides the forecast.">Forecast</label>
        <div className="seg">
          {HORIZONS.map((h) => (h.m === -1
            ? <button key="none" className={!showForecast ? 'active' : ''} onClick={() => setShowForecast(false)}>{h.label}</button>
            : <button key={h.m} className={showForecast && horizon === h.m ? 'active' : ''} onClick={() => { setShowForecast(true); setHorizon(h.m) }}>{h.label}</button>))}
        </div>
      </div>

      {/* ---- resource outlook: the acquisition decision ---- */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Resource outlook <span className="th-unit">average GPUs · demand vs capacity</span></span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400, fontSize: 13 }}>
            <span className="hint">Procurement lead time</span>
            <span className="numin"><input type="number" min="0" max="24" step="1" value={lead} onChange={(e) => setLead(Math.max(0, Number(e.target.value) || 0))} style={{ width: 54 }} /><span className="numin-suffix">months</span></span>
          </span>
        </div>
        <div className="tiles">
          <Tile label="Capacity now" value={fmt(st.capNow)} note="GPUs in service" />
          <Tile label="Utilisation now" value={st.utilNow + '%'} note={`${st.idlePct}% idle`} />
          <Tile label="Demand growth" value={!showForecast ? '—' : (st.growthPerMonth > 0 ? '+' : '') + fmt(st.growthPerMonth)} note={!showForecast ? 'forecast hidden' : (st.growthPct == null ? 'avg GPUs / month' : `${st.growthPct > 0 ? '+' : ''}${st.growthPct}% / month`)} />
          <Tile label={`Runway to ${st.thresholdPct}%`} value={!showForecast ? '—' : (st.runwayMonths == null ? '—' : `${st.runwayMonths} mo`)} note={!showForecast ? 'forecast hidden' : (st.runwayMonths == null ? 'not within horizon' : st.crossThresh)} tone={showForecast && st.atRisk ? 'critical' : undefined} />
        </div>
        <div style={{ width: '100%', height: 300, marginTop: 6 }}>
          <ResponsiveContainer>
            <ComposedChart data={oRows} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: 'var(--ink-2)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={28} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => fmt(v)} label={{ value: 'avg GPUs', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 11 }} />
              <Tooltip content={<ResourceTip thresholdPct={st.thresholdPct} showForecast={showForecast} />} />
              {showForecast && <Area dataKey="bandBase" stackId="band" stroke="none" fill="none" isAnimationActive={false} legendType="none" name="_" />}
              {showForecast && <Area dataKey="bandSpan" stackId="band" stroke="none" fill="#eb6834" fillOpacity={0.13} isAnimationActive={false} legendType="none" name="demand range" />}
              <Line type="stepAfter" dataKey="capacity" name="Capacity" stroke="var(--ink-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="threshold" name={`${st.thresholdPct}% threshold`} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="committed" name="Committed (projects)" stroke="#1baf7a" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="use" name="Realised demand" stroke="#eb6834" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              {showForecast && <Line type="monotone" dataKey="useFc" name="Realised (forecast)" stroke="#eb6834" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />}
              {showForecast && firstForecast && <ReferenceLine x={firstForecast.period} stroke="var(--ink)" strokeOpacity={0.35} strokeDasharray="2 3" label={{ value: 'now', fill: 'var(--ink-2)', fontSize: 10, position: 'insideTopRight' }} />}
              {showForecast && st.crossThresh && <ReferenceLine x={st.crossThresh} stroke="var(--critical)" strokeOpacity={0.7} label={{ value: 'hits ' + st.thresholdPct + '%', fill: 'var(--critical)', fontSize: 10, position: 'insideTopLeft' }} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="legend-grouped"><div className="lg-row">
          <span className="lg-item"><i className="swatch" style={{ background: 'var(--ink-2)' }} />Capacity</span>
          <span className="lg-item"><i className="swatch" style={{ background: '#1baf7a' }} />Committed entitlement</span>
          <span className="lg-item"><i className="swatch" style={{ background: '#eb6834' }} />Realised demand{showForecast ? ' (solid actual, dashed forecast, band = low–high)' : ' (actual)'}</span>
        </div></div>
        <p className="hint">
          {!showForecast
            ? 'Forecast hidden — showing actuals only. '
            : st.crossThresh
              ? `At ${METHODS.find((m) => m.k === method)?.label.toLowerCase()} growth, realised demand reaches ${st.thresholdPct}% of capacity around ${st.crossThresh}${st.crossThreshHigh && st.crossThreshHigh !== st.crossThresh ? ` (as early as ${st.crossThreshHigh} on the high side)` : ''}${st.crossFull ? `, and full capacity around ${st.crossFull}` : ''}. `
              : `Forecast demand stays below ${st.thresholdPct}% of capacity within the ${horizon > 0 ? horizon + '-month' : 'full'} horizon. `}
          Committed entitlement is what active projects could draw if they spent their budgets evenly; realised demand is what jobs actually use.
        </p>
      </div>

      {/* ---- indicator explorer: KPI selection lives with its own graph ---- */}
      <div className="card">
        <div className="card-title">
          {multi ? 'Indicators over time' : `${kpi.label} over time`}
          {multi && <span className="th-unit" style={{ marginLeft: 8 }}>{multiUnit != null ? `${multiUnit || 'count'} · hover for values` : 'scaled to fit · hover for values'}</span>}
        </div>
        {!multi && (primaryKey === 'usedProj' || primaryKey === 'planned') && (
          <p className="hint" style={{ marginTop: 0 }}>Add both Project budgets and Project budgets actualised to compare, in GPU-hours: the allocation against what team projects actually used. The gap between them is unused budget. Per-project detail is in the Projects tab.</p>
        )}
        <div className="controls" style={{ marginTop: 0, alignItems: 'flex-start' }}>
          <label style={{ paddingTop: 5 }}>Indicators</label>
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            {KPIS.map((k) => (
              <button key={k.key} className={'btn' + (kpiKeys.includes(k.key) ? ' primary' : '')} style={{ padding: '3px 10px' }} onClick={() => toggleKpi(k.key)}>{k.label}</button>
            ))}
          </span>
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: 'var(--ink-2)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={28} />
              {multi
                ? (multiUnit != null
                    ? <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => fmt(v)} unit={multiUnit === '%' ? '%' : undefined} domain={multiUnit === '%' ? [0, 100] : ['auto', 'auto']} />
                    : <YAxis hide domain={[0, 1]} />)
                : <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54}
                    unit={kpi.unit === '%' ? '%' : undefined} domain={kpi.unit === '%' ? [0, 100] : ['auto', 'auto']} />}
              <Tooltip content={multi ? <ChartTip keys={kpiKeys} eventsByPeriod={eventsByPeriod} /> : <ChartTip keys={[primaryKey]} single eventsByPeriod={eventsByPeriod} />} />
              {events.map((e, i) => (
                <ReferenceLine key={i} x={e.period} stroke={EVENT_COLOR[e.kind] || 'var(--muted)'} strokeDasharray={e.kind === 'mechanism' ? '0' : '3 3'} strokeOpacity={0.8}
                  label={(pr) => { const vb = pr.viewBox || {}; return <text x={(vb.x || 0) + 5} y={(vb.y || 0) + 12} fill={EVENT_COLOR[e.kind] || 'var(--muted)'} fontSize={11} fontWeight={600}>{i + 1}</text> }} />
              ))}
              {showForecast && firstForecast && <ReferenceLine x={firstForecast.period} stroke="var(--ink)" strokeOpacity={0.35} strokeDasharray="2 3" label={{ value: 'now', fill: 'var(--ink-2)', fontSize: 10, position: 'insideTopRight' }} />}
              {!multi && !known && showForecast && <Area dataKey="bandBase" stackId="b" stroke="none" fill="none" isAnimationActive={false} legendType="none" name="_" />}
              {!multi && !known && showForecast && <Area dataKey="bandSpan" stackId="b" stroke="none" fill="#6da7ec" fillOpacity={0.16} isAnimationActive={false} legendType="none" name="range" />}
              {multi && showForecast && fcKeys.flatMap((k) => {
                const color = LINE_COLORS[kpiKeys.indexOf(k) % LINE_COLORS.length]
                return [
                  <Area key={k + '_lo'} dataKey={k + '_lo'} stackId={'bm_' + k} stroke="none" fill="none" isAnimationActive={false} legendType="none" name="_" />,
                  <Area key={k + '_span'} dataKey={k + '_span'} stackId={'bm_' + k} stroke="none" fill={color} fillOpacity={0.14} isAnimationActive={false} legendType="none" name="_" />,
                ]
              })}
              {multi
                ? kpiKeys.flatMap((k, i) => {
                    const color = LINE_COLORS[i % LINE_COLORS.length]
                    const nm = KPIS.find((x) => x.key === k)?.label
                    const out = [<Line key={k + '_a'} type="monotone" dataKey={k + '_a'} name={nm} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />]
                    if (showForecast && !KNOWN_KEYS.has(k)) out.push(<Line key={k + '_f'} type="monotone" dataKey={k + '_f'} name={nm + ' (forecast)'} stroke={color} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls legendType="none" />)
                    return out
                  })
                : <>
                    <Line type="monotone" dataKey="actual" name={kpi.label} stroke="#2a78d6" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} connectNulls />
                    {!known && <Line type="monotone" dataKey="projected" name="forecast" stroke="#6da7ec" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />}
                  </>}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {multi && (
          <div className="legend-grouped"><div className="lg-row">
            {kpiKeys.map((k, i) => { const m = KPIS.find((x) => x.key === k); return <span className="lg-item" key={k}><i className="swatch" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />{m?.label} <span className="th-unit">{valUnit(latest?.[k], m)}</span></span> })}
          </div></div>
        )}
        {events.length > 0 && (
          <div className="evt-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--ink-2)' }}>
            {events.map((e, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <b style={{ color: EVENT_COLOR[e.kind] || 'var(--muted)' }}>{i + 1}.</b>{e.label}<span className="th-unit">{e.kind}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Indicator scorecard</span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400, fontSize: 13 }}>
            <span className="hint">Compare</span>
            <select value={aRow?.period ?? ''} onChange={(e) => setCmpA(e.target.value)}>
              {periods.map((p) => <option key={p.period} value={p.period}>{p.period}{isFuture(p) ? ' (proj)' : ''}</option>)}
            </select>
            <span className="hint">vs</span>
            <select value={bRow?.period ?? ''} onChange={(e) => setCmpB(e.target.value)}>
              {periods.map((p) => <option key={p.period} value={p.period}>{p.period}{isFuture(p) ? ' (proj)' : ''}</option>)}
            </select>
          </span>
        </div>
        <table className="data">
          <thead>
            <tr><th>Indicator</th><th className="num">{aRow?.period ?? 'A'}</th><th className="num">{bRow?.period ?? 'B'}</th><th className="num">Change</th></tr>
          </thead>
          <tbody>
            {KPIS.map((m) => {
              const d = aRow && bRow && aRow[m.key] != null && bRow[m.key] != null ? aRow[m.key] - bRow[m.key] : null
              return (
                <tr key={m.key} className={'row-click' + (kpiKeys.includes(m.key) ? ' row-sel' : '')} onClick={() => setKpiKeys([m.key])}>
                  <td>{m.label}</td>
                  <td className="num">{valUnit(aRow?.[m.key], m)}</td>
                  <td className="num">{valUnit(bRow?.[m.key], m)}</td>
                  <td className="num">{d == null ? '—' : (d > 0 ? '+' : '') + fmt(+d.toFixed(2))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="hint">Select a row to chart that indicator above; the Indicators control keeps several on the chart at once. Per-project detail is in the Projects tab.</p>
      </div>
    </section>
  )
}

function ChartTip({ active, payload, label, keys, single, eventsByPeriod }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload || {}
  const evs = (eventsByPeriod && eventsByPeriod[label]) || []
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '8px 10px', minWidth: 210 }}>
      <div style={{ color: 'var(--ink-2)', marginBottom: 5 }}>{label}</div>
      {single ? (() => {
        const m = KPIS.find((x) => x.key === keys[0]) || KPIS[0]
        const forecast = row.actual == null
        const v = forecast ? row.projected : row.actual
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '2px 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: '#2a78d6', display: 'inline-block' }} />{m.label}{forecast ? <span className="th-unit">forecast</span> : null}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{valUnit(v, m)}{forecast && row.bandSpan ? <span className="th-unit"> ±{fmt(row.bandSpan / 2)}</span> : null}</span>
          </div>
        )
      })() : keys.map((k, i) => {
        const m = KPIS.find((x) => x.key === k)
        return (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '2px 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: LINE_COLORS[i % LINE_COLORS.length], display: 'inline-block' }} />{m?.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{valUnit(row[k + '__raw'], m)}</span>
          </div>
        )
      })}
      {evs.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 5, paddingTop: 5 }}>
          {evs.map((e, i) => (
            <div key={i} style={{ color: 'var(--ink-2)', margin: '1px 0' }}><b style={{ color: EVENT_COLOR[e.kind] || 'var(--muted)' }}>● </b>{e.label} <span className="th-unit">{e.kind}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

// resource-outlook tooltip: the real lines only (no band placeholder), ordered top-down by value
function ResourceTip({ active, payload, label, thresholdPct, showForecast }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload || {}
  const isFc = showForecast && row.use == null
  const realised = row.use != null ? row.use : row.useFc
  const lo = row.bandBase, hi = (row.bandBase != null && row.bandSpan != null) ? row.bandBase + row.bandSpan : null
  const range = (isFc && lo != null && hi != null) ? ` (${fmt(lo)}–${fmt(hi)})` : ''
  const items = [
    { name: 'Capacity', v: row.capacity, color: 'var(--ink-2)' },
    { name: `${thresholdPct}% threshold`, v: row.threshold, color: 'var(--ink-2)' },
    { name: 'Committed (projects)', v: row.committed, color: '#1baf7a' },
    { name: isFc ? 'Realised (forecast)' : 'Realised demand', v: realised, extra: range, color: '#eb6834' },
  ].filter((it) => it.v != null).sort((a, b) => b.v - a.v)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '8px 10px', minWidth: 200 }}>
      <div style={{ color: 'var(--ink-2)', marginBottom: 5 }}>{label}</div>
      {items.map((it) => (
        <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '2px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: it.color, display: 'inline-block' }} />{it.name}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(it.v)}{it.extra ? <span className="th-unit">{it.extra}</span> : null} GPU</span>
        </div>
      ))}
    </div>
  )
}

function avg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null)
  if (!vals.length) return null
  return +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)
}
function valUnit(v, m) {
  if (v == null) return '—'
  return fmt(v) + (m && m.unit ? (m.unit === '%' ? '%' : ' ' + m.unit) : '')
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
