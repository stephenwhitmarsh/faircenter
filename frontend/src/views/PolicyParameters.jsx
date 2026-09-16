import { useState } from 'react'
import Toggle from '../components/Toggle.jsx'
import { parameters, GOV_PHASES, governance, suggestedPersonBudget, poolBars } from '../data/mockData.js'
import { useSession } from '../session.jsx'

const fmt = (n) => Math.round(n).toLocaleString('en-GB')

const LANE_EXAMPLE = {
  bulk: 'sbatch --qos=bulk ...',
  standard: 'sbatch --qos=standard ...',
  fast: 'sbatch --qos=fast ...',
}
// lane values when priced urgency is on; when off, lanes are neutral (factor 1, no queue offset)
const LANE_ON = { bulk: { factor: 0.7, priority: -50 }, standard: { factor: 1.0, priority: 0 }, fast: { factor: 1.5, priority: 100 } }

// Snapshot of the editable numbers, staged locally until Apply.
function snapshot() {
  const { lanes, timeOfUse, weights, oversubscriptionFactor, pools } = parameters
  return {
    lane: Object.fromEntries(Object.keys(lanes).map((k) => [k, { factor: lanes[k].factor, priority: lanes[k].priority }])),
    touOffice: timeOfUse.office,
    touOff: timeOfUse.off,
    laneVsProject: weights.accountVsLane,
    teamVsProject: weights.teamVsProject,
    personPct: Math.round((pools?.personPct ?? 0) * 100),
    oversub: oversubscriptionFactor,
  }
}

function slurmCommands(d, flags) {
  const cmds = []
  for (const k of Object.keys(d.lane)) {
    cmds.push(`sacctmgr modify qos ${k} set UsageFactor=${d.lane[k].factor.toFixed(2)} Priority=${d.lane[k].priority}`)
  }
  cmds.push(`scontrol update PriorityWeightTRESBillingOffHours=${d.touOff.toFixed(2)}`)
  cmds.push(`# person pool ${d.personPct}% · over-subscription ${d.oversub.toFixed(2)} (× capacity that may be committed)`)
  // budget enforcement = GrpTRESMins caps placed at the chosen level of the account tree
  if (flags.enfPerson) cmds.push('sacctmgr modify user <user> set GrpTRESMins=gres/gpu=<person budget>   # enforce per person')
  if (flags.enfProject) cmds.push('sacctmgr modify account <project> set GrpTRESMins=gres/gpu=<project budget>   # enforce per project')
  if (flags.enfTeam) cmds.push('sacctmgr modify account <team> set GrpTRESMins=gres/gpu=<team pool>   # enforce per team')
  if (!flags.enfPerson && !flags.enfProject && !flags.enfTeam) cmds.push('# budgets not enforced — measurement only')
  return cmds
}

export default function PolicyParameters() {
  const { can } = useSession()
  const editable = can('editPolicy')
  const [flags, setFlags] = useState({ ...parameters.toggles })
  const [phase, setPhase] = useState(governance.phase)
  const [draft, setDraft] = useState(snapshot)
  const [applied, setApplied] = useState(null)

  // selecting a phase loads its preset into the staged settings; nothing reaches the scheduler
  // until Apply. A mechanism that is off carries neutral values (lanes at 1×, off-hours at 1×).
  const setGovPhase = (n) => {
    const g = GOV_PHASES.find((x) => x.n === n)
    if (!g) return
    setPhase(n)
    setFlags((f) => ({ ...f, ...g.on }))
    setDraft((d) => ({
      ...d,
      personPct: Math.round(g.personPct * 100),
      lane: Object.fromEntries(Object.keys(d.lane).map((k) => [k, g.on.lanes ? { ...LANE_ON[k] } : { factor: 1, priority: 0 }])),
      touOffice: 1,
      touOff: g.on.timeOfUse ? 0.5 : 1,
    }))
  }
  const cur = GOV_PHASES.find((g) => g.n === phase)
  const custom = cur ? Object.keys(cur.on).some((k) => flags[k] !== cur.on[k]) : false
  const enfList = [flags.enfPerson && 'person', flags.enfProject && 'project', flags.enfTeam && 'team'].filter(Boolean)
  const enfText = enfList.length ? 'enforced per ' + enfList.join(', ') : 'not enforced'

  const base = snapshot()
  const flagsDirty = Object.keys(flags).some((k) => flags[k] !== parameters.toggles[k])
  const phaseDirty = phase !== governance.phase
  const dirty = phaseDirty || flagsDirty || JSON.stringify(draft) !== JSON.stringify(base)

  const setLane = (k, field, v) => setDraft((d) => ({ ...d, lane: { ...d.lane, [k]: { ...d.lane[k], [field]: v } } }))
  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  function apply() {
    for (const k of Object.keys(draft.lane)) {
      parameters.lanes[k].factor = draft.lane[k].factor
      parameters.lanes[k].priority = draft.lane[k].priority
    }
    parameters.timeOfUse.office = draft.touOffice
    parameters.timeOfUse.off = draft.touOff
    parameters.weights.accountVsLane = draft.laneVsProject
    parameters.weights.teamVsProject = draft.teamVsProject
    parameters.pools.personPct = draft.personPct / 100
    parameters.oversubscriptionFactor = draft.oversub
    parameters.toggles = { ...parameters.toggles, ...flags }
    governance.phase = phase
    setApplied({ at: new Date(), cmds: slurmCommands(draft, flags) })
  }
  function discard() { setPhase(governance.phase); setFlags({ ...parameters.toggles }); setDraft(snapshot()) }

  return (
    <section>
      {editable && (
        <div className="card">
          <div className="card-title">Roll-out phase <span className="rolechip ops">ops</span></div>
          <div className="gov-steps">
            {GOV_PHASES.map((g) => (
              <button key={g.key} type="button" className={'gov-step' + (g.n === phase ? ' cur' : g.n < phase ? ' done' : '')}
                onClick={() => setGovPhase(g.n)}>
                <span className="gov-n">{g.n}</span>
                <span className="gov-name">{g.name}</span>
                <span className="gov-short">{g.short}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Mechanisms <span className="th-unit">{custom ? 'customised' : `phase ${phase} preset`}</span></div>
        <table className="data">
          <tbody>
            <SwitchRow name="Person budgets" note="cap each person at their budget" checked={flags.enfPerson} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, enfPerson: v }))} />
            <SwitchRow name="Project budgets" note="cap each project at its budget" checked={flags.enfProject} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, enfProject: v }))} />
            <SwitchRow name="Team budgets" note="cap each team pool" checked={flags.enfTeam} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, enfTeam: v }))} />
            <SwitchRow name="Priced urgency (lanes)" note="fast and bulk lanes available to jobs" checked={flags.lanes} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, lanes: v }))} />
            <SwitchRow name="Time-of-use weighting" note="office/off-hours weight on budget drawn" checked={flags.timeOfUse} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, timeOfUse: v }))} />
            <SwitchRow name="Cross-team standing" note="team-level standing in the queue" checked={flags.teamStanding} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, teamStanding: v }))} />
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Values</span>
        </div>
        <table className="data">
          <thead>
            <tr><th>Parameter</th><th className="num">Value</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <ValueRow label="Person pool" k="personPct" draft={draft} editable={editable} step={1} decimals={0} suffix="%" onChange={setField} note="share of capacity for individual work; the rest is the team pools" />
            <ValueRow label="Over-subscription" k="oversub" draft={draft} editable={editable} step={0.05} suffix="×" onChange={setField} note="× capacity that may be committed as budgets: below 1 holds capacity back, above 1 deliberately over-commits" />
            {Object.keys(draft.lane).map((k) => (
              <tr key={k}>
                <td>Lane, {parameters.lanes[k].label}</td>
                <td className="num">
                  {editable ? (
                    <span className="inline-edit">
                      <NumIn value={draft.lane[k].factor} step={0.05} onChange={(v) => setLane(k, 'factor', v)} suffix="× draw" />
                      <NumIn value={draft.lane[k].priority} step={10} onChange={(v) => setLane(k, 'priority', v)} width={64} suffix="queue" />
                    </span>
                  ) : `${draft.lane[k].factor.toFixed(2)}× draw · ${draft.lane[k].priority > 0 ? '+' : ''}${draft.lane[k].priority} queue`}
                </td>
                <td style={{ color: 'var(--ink-2)' }}><code>{LANE_EXAMPLE[k]}</code></td>
              </tr>
            ))}
            <ValueRow label="Time of use, office hours" k="touOffice" draft={draft} editable={editable} step={0.05} suffix="×" onChange={setField} note="weight on budget drawn in office hours" />
            <ValueRow label="Time of use, off hours" k="touOff" draft={draft} editable={editable} step={0.05} suffix="×" onChange={setField} note="weight on budget drawn off-hours" />
            <ValueRow label="Lane vs project weight" k="laneVsProject" draft={draft} editable={editable} step={0.05} onChange={setField} note="how far a lane can lift a job above its project standing" />
            <ValueRow label="Team vs project weight" k="teamVsProject" draft={draft} editable={editable} step={0.05} onChange={setField} note="blend of team standing and project standing" />
          </tbody>
        </table>

        {editable && (
          <div className="apply-bar">
            <button className="btn primary" disabled={!dirty} onClick={apply}>Apply to SLURM</button>
            <button className="btn" disabled={!dirty} onClick={discard}>Discard</button>
            <span className="hint">{dirty ? 'Staged.' : 'No staged changes.'}</span>
          </div>
        )}
        {applied && (
          <div className="apply-log">
            <div className="hint" style={{ marginBottom: 4 }}>Applied {applied.at.toLocaleTimeString('en-GB')}:</div>
            <pre>{applied.cmds.join('\n')}</pre>
          </div>
        )}
      </div>

    </section>
  )
}

function NumIn({ value, onChange, step = 1, width = 72, suffix }) {
  return (
    <span className="numin">
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} style={{ width }} />
      {suffix && <span className="numin-suffix">{suffix}</span>}
    </span>
  )
}

function ValueRow({ label, k, draft, editable, step, suffix, onChange, note, decimals = 2 }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">
        {editable
          ? <NumIn value={draft[k]} step={step} suffix={suffix} onChange={(v) => onChange(k, v)} />
          : draft[k].toFixed(decimals) + (suffix || '')}
      </td>
      <td style={{ color: 'var(--ink-2)' }}>{note}</td>
    </tr>
  )
}

function SwitchRow({ name, note, checked, onChange, disabled }) {
  return (
    <tr>
      <td style={{ width: '26%' }}>{name}</td>
      <td style={{ color: 'var(--ink-2)' }}>{note}</td>
      <td style={{ width: 60, textAlign: 'right' }}><Toggle checked={checked} onChange={onChange} label={name} disabled={disabled} /></td>
    </tr>
  )
}

function Kpi({ label, value, note }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}
