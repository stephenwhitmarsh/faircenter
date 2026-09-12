import { useState } from 'react'
import Toggle from '../components/Toggle.jsx'
import { parameters } from '../data/mockData.js'
import { useSession } from '../session.jsx'

const LANE_EXAMPLE = {
  bulk: 'sbatch --qos=bulk ...',
  standard: 'sbatch --qos=standard ...',
  fast: 'sbatch --qos=fast ...',
}

// A flat, editable view of the policy numbers. Snapshot so edits stage locally
// and only touch the live parameters (and, in production, SLURM) on Apply.
function snapshot() {
  const { lanes, timeOfUse, weights, oversubscriptionFactor } = parameters
  return {
    lane: Object.fromEntries(Object.keys(lanes).map((k) => [k, { factor: lanes[k].factor, priority: lanes[k].priority }])),
    touOffice: timeOfUse.office,
    touOff: timeOfUse.off,
    accountVsLane: weights.accountVsLane,
    teamVsProject: weights.teamVsProject,
    oversub: oversubscriptionFactor,
  }
}

// The sacctmgr / scontrol commands an Apply would run. Illustrative.
function slurmCommands(d) {
  const cmds = []
  for (const k of Object.keys(d.lane)) {
    cmds.push(`sacctmgr modify qos ${k} set UsageFactor=${d.lane[k].factor.toFixed(2)} Priority=${d.lane[k].priority}`)
  }
  cmds.push(`scontrol update PriorityWeightTRESBillingOffHours=${d.touOff.toFixed(2)}`)
  cmds.push(`# fairshare blend: account-vs-lane ${d.accountVsLane.toFixed(2)}, team-vs-project ${d.teamVsProject.toFixed(2)}`)
  cmds.push(`# admission: over-subscription ${d.oversub.toFixed(2)}x`)
  return cmds
}

export default function PolicyParameters() {
  const { can } = useSession()
  const editable = can('editPolicy')
  const [flags, setFlags] = useState({ ...parameters.toggles })
  const [draft, setDraft] = useState(snapshot)
  const [applied, setApplied] = useState(null)

  const base = snapshot()
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)

  const setLane = (k, field, v) => setDraft((d) => ({ ...d, lane: { ...d.lane, [k]: { ...d.lane[k], [field]: v } } }))
  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  function apply() {
    // In production this call goes to the backend, which runs the commands
    // below against SLURM. Here we mutate the live parameters so the rest of
    // the app reflects the change this session.
    for (const k of Object.keys(draft.lane)) {
      parameters.lanes[k].factor = draft.lane[k].factor
      parameters.lanes[k].priority = draft.lane[k].priority
    }
    parameters.timeOfUse.office = draft.touOffice
    parameters.timeOfUse.off = draft.touOff
    parameters.weights.accountVsLane = draft.accountVsLane
    parameters.weights.teamVsProject = draft.teamVsProject
    parameters.oversubscriptionFactor = draft.oversub
    setApplied({ at: new Date(), cmds: slurmCommands(draft) })
  }
  function discard() { setDraft(snapshot()); }

  return (
    <section>
      <div className="view-head">
        <h2 className="view-title">Policy &amp; parameters</h2>
        <p className="view-intro">
          The values that drive allocation, visible to everyone and editable only by
          operations. The switches turn a mechanism on or off. In this POC changes are
          staged locally and “Apply” shows the SLURM commands it would run rather than
          touching a real cluster.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Mechanisms</div>
        <table className="data">
          <tbody>
            <SwitchRow name="Priced urgency (lanes)" note="fast and bulk lanes available to jobs" checked={flags.lanes} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, lanes: v }))} />
            <SwitchRow name="Time-of-use weighting" note="office/off-hours weight on budget drawn" checked={flags.timeOfUse} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, timeOfUse: v }))} />
            <SwitchRow name="Headroom" note="a share of capacity held back at each level" checked={flags.headroom} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, headroom: v }))} />
            <SwitchRow name="Over-subscription" note="allow granted demand to exceed capacity within a factor" checked={flags.oversubscription} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, oversubscription: v }))} />
            <SwitchRow name="Cross-team standing" note="team-level standing in the queue (phased in later)" checked={flags.teamStanding} disabled={!editable} onChange={(v) => setFlags((s) => ({ ...s, teamStanding: v }))} />
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Values</span>
          <span className={'perm-note ' + (editable ? 'perm-on' : '')}>
            {editable ? 'Operations · staged, applies on Apply' : 'Editable by operations'}
          </span>
        </div>
        <table className="data">
          <thead>
            <tr><th>Parameter</th><th className="num">Value</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {Object.keys(draft.lane).map((k) => (
              <tr key={k}>
                <td>Lane, {parameters.lanes[k].label}</td>
                <td className="num">
                  {editable ? (
                    <span className="inline-edit">
                      <NumIn value={draft.lane[k].factor} step={0.05} onChange={(v) => setLane(k, 'factor', v)} suffix="×" />
                      <NumIn value={draft.lane[k].priority} step={10} onChange={(v) => setLane(k, 'priority', v)} width={64} />
                    </span>
                  ) : `${draft.lane[k].factor.toFixed(2)}× · ${draft.lane[k].priority > 0 ? '+' : ''}${draft.lane[k].priority}`}
                </td>
                <td style={{ color: 'var(--ink-2)' }}><code>{LANE_EXAMPLE[k]}</code></td>
              </tr>
            ))}
            <ValueRow label="Time of use, office hours" k="touOffice" draft={draft} editable={editable} step={0.05} suffix="×" onChange={setField} note="weight on budget drawn in office hours" />
            <ValueRow label="Time of use, off hours" k="touOff" draft={draft} editable={editable} step={0.05} suffix="×" onChange={setField} note="cheaper, to shift load off-hours" />
            <ValueRow label="Account vs lane weight" k="accountVsLane" draft={draft} editable={editable} step={0.05} onChange={setField} note="how far a lane can lift a job above account standing" />
            <ValueRow label="Team vs project weight" k="teamVsProject" draft={draft} editable={editable} step={0.05} onChange={setField} note="blend of team standing and project standing" />
            <ValueRow label="Over-subscription factor" k="oversub" draft={draft} editable={editable} step={0.05} suffix="×" onChange={setField} note="how far granted demand may exceed capacity" />
          </tbody>
        </table>

        {editable && (
          <div className="apply-bar">
            <button className="btn primary" disabled={!dirty} onClick={apply}>Apply to SLURM</button>
            <button className="btn" disabled={!dirty} onClick={discard}>Discard</button>
            <span className="hint">{dirty ? 'Unsaved changes staged.' : 'No staged changes.'}</span>
          </div>
        )}
        {applied && (
          <div className="apply-log">
            <div className="hint" style={{ marginBottom: 4 }}>Applied {applied.at.toLocaleTimeString('en-GB')} · would run on the cluster:</div>
            <pre>{applied.cmds.join('\n')}</pre>
          </div>
        )}

        <p className="hint">
          Lane is chosen per job at submission via the QOS. Draw factor maps to the QOS
          UsageFactor and queue priority to the QOS Priority. Whether lanes are offered
          at all is the “Priced urgency” switch above.
        </p>
        <p className="note">
          The over-subscription factor is an admission control: it sets how far granted
          demand may exceed raw capacity. Headroom, the other admission control, is set
          on the Consumption &amp; reservations tab, where it is read against the live
          consumption picture.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Tuning indicators</div>
        <p className="stub" style={{ marginTop: 0 }}>
          These measure whether the parameters above are set well. Each is tracked per
          period and read against the parameters in force when it was measured, so the
          effect of a change can be seen. Values below are illustrative.
        </p>
        <div className="tiles" style={{ marginTop: 12, marginBottom: 0 }}>
          <Kpi label="Median wait, fast lane" value="7 min" note="down from 18 min last period" />
          <Kpi label="Median wait, standard" value="41 min" />
          <Kpi label="Budget spent at mid-period" value="52%" note="close to on-pace" />
          <Kpi label="Change requests" value="14" note="4 extensions, 10 budget/priority" />
          <Kpi label="Unused headroom" value="6%" note="of capacity, reclaimable" />
          <Kpi label="Priority–usage alignment" value="0.83" note="rank corr: do higher-priority projects actually get the hours" />
        </div>
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

function ValueRow({ label, k, draft, editable, step, suffix, onChange, note }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">
        {editable
          ? <NumIn value={draft[k]} step={step} suffix={suffix} onChange={(v) => onChange(k, v)} />
          : draft[k].toFixed(2) + (suffix || '')}
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
