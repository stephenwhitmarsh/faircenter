// Pool bars: the committed, target and actual GPU-h split across the two pools.
import { fmt } from '../format.js'

// Pool bars over a trailing window. mode 'actual' shows consumption per pool with idle capacity
// as the tail; mode 'target' shows the policy split per pool; mode 'allocated' shows how committed
// budgets sit against capacity, so a shortfall leaves an uncommitted tail and an excess overshoots
// the capacity mark (over-committed); 'both' shows target + actual. Data comes from poolBars().
export default function PoolBars({ data, mode = 'both' }) {
  const { pools, idlePc } = data
  const showTarget = mode === 'both' || mode === 'target'
  const showActual = mode === 'both' || mode === 'actual'
  const showAlloc = mode === 'allocated'

  const target = []
  for (const p of pools) if (p.targetPc > 0.6) target.push(<span key={p.key} className="pool-seg" style={{ width: p.targetPc + '%', background: p.colour, opacity: 0.62 }}><span>{Math.round(p.targetPc)}%</span></span>)

  const actual = []
  for (const p of pools) if (p.usedPc > 0.6) actual.push(<span key={p.key} className="pool-seg" style={{ width: p.usedPc + '%', background: p.colour }}><span>{Math.round(p.usedPc)}%</span></span>)
  if (idlePc > 0.6) actual.push(<span key="idle" className="pool-seg pool-empty" style={{ width: idlePc + '%' }}><span>idle {Math.round(idlePc)}%</span></span>)

  // allocated: capacity is 100%. Scale by the larger of capacity and committed so an over-commit
  // still fits, then mark where capacity sits; anything past it is over-committed.
  const committedPc = data.committedPc || 0
  const overPc = data.overPc || 0
  const uncommittedPc = data.uncommittedPc || 0
  const ceilingPc = data.ceilingPc || 100
  const denom = Math.max(100, committedPc, ceilingPc)
  const sc = (pc) => (pc / denom) * 100
  const alloc = []
  for (const p of pools) if (p.budgetPc > 0.4) alloc.push(<span key={p.key} className="pool-seg" style={{ width: sc(p.budgetPc) + '%', background: p.colour, opacity: 0.85 }}><span>{Math.round(p.budgetPc)}%</span></span>)
  if (uncommittedPc > 0.4) alloc.push(<span key="unc" className="pool-seg pool-empty" style={{ width: sc(uncommittedPc) + '%' }}><span>uncommitted {Math.round(uncommittedPc)}%</span></span>)
  const capTickLeft = showAlloc ? (100 / denom) * 100 : null
  const ceilTickLeft = ceilingPc > 100.4 ? (ceilingPc / denom) * 100 : null

  return (
    <>
      <div className="pool-2bars">
        {showAlloc && (
          <div className="pool-barrow">
            <span className="pool-barlabel">Committed</span>
            <div className="pool-split sm" style={{ position: 'relative' }}>
              {alloc}
              {capTickLeft != null && <span style={{ position: 'absolute', top: -2, bottom: -2, left: capTickLeft + '%', width: 0, borderLeft: '2px solid var(--ink)' }} title="capacity (100%)" />}
              {ceilTickLeft != null && <span style={{ position: 'absolute', top: -2, bottom: -2, left: ceilTickLeft + '%', width: 0, borderLeft: '2px dashed var(--warning)' }} title={`over-subscription ceiling ${Math.round(ceilingPc)}%`} />}
            </div>
          </div>
        )}
        {showTarget && <div className="pool-barrow"><span className="pool-barlabel">Target</span><div className="pool-split sm">{target}</div></div>}
        {showActual && <div className="pool-barrow"><span className="pool-barlabel">Actual use</span><div className="pool-split sm">{actual}</div></div>}
      </div>
      {showAlloc && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Committed {Math.round(committedPc)}% of capacity{overPc > 0.4 ? ` — over-subscribed by ${Math.round(overPc)}%` : ''}. Ceiling {Math.round(ceilingPc)}% (over-subscription factor {(ceilingPc / 100).toFixed(2)}×).
        </p>
      )}
      <div className="pool-legend">
        {pools.map((p) => (
          <span key={p.key} className="pool-legend-item">
            <i style={{ background: p.colour }} />
            <b>{p.label}</b> {showAlloc ? `${fmt(p.budget)} GPU-h · ${Math.round(p.budgetPc)}% of capacity` : showActual ? `${fmt(p.used)} GPU-h · ${Math.round(p.usedPc)}%` : `${Math.round(p.targetPc)}%`}
          </span>
        ))}
      </div>
    </>
  )
}
