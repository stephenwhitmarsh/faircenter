import { useState } from 'react'
import Toggle from '../components/Toggle.jsx'
import { parameters } from '../data/mockData.js'

const LANE_EXAMPLE = {
  bulk: 'sbatch --qos=bulk train.sh',
  standard: 'sbatch --qos=standard train.sh',
  fast: 'sbatch --qos=fast train.sh',
}

export default function PolicyParameters() {
  const { headroom, oversubscriptionFactor, timeOfUse, weights, lanes } = parameters
  const [flags, setFlags] = useState({ ...parameters.toggles })

  const rows = [
    ...Object.values(lanes).map((l) => ({
      name: `Lane, ${l.label}`,
      value: `${l.factor.toFixed(2)}× · ${l.priority > 0 ? '+' : ''}${l.priority}`,
      note: <code>{LANE_EXAMPLE[l.key]}</code>,
    })),
    { name: 'Time of use, office hours', value: timeOfUse.office.toFixed(2) + '×', note: 'weight on budget drawn in office hours' },
    { name: 'Time of use, off hours', value: timeOfUse.off.toFixed(2) + '×', note: 'cheaper, to shift load off-hours' },
    { name: 'Account vs lane weight', value: weights.accountVsLane.toFixed(2), note: 'how far a lane can lift a job above account standing' },
    { name: 'Team vs project weight', value: weights.teamVsProject.toFixed(2), note: 'blend of team standing and project standing' },
    { name: 'Over-subscription factor', value: oversubscriptionFactor.toFixed(2) + '×', note: 'how far granted demand may exceed capacity' },
    { name: 'Headroom, organisation', value: pct(headroom.org), note: 'share of capacity kept free above the teams' },
    { name: 'Headroom, team', value: pct(headroom.team), note: 'kept free within each team budget' },
    { name: 'Headroom, project', value: pct(headroom.project), note: 'kept free within each project' },
  ]

  return (
    <section>
      <div className="view-head">
        <h2 className="view-title">Policy &amp; parameters</h2>
        <p className="view-intro">
          The values that drive allocation. Editable only by operations and visible
          to everyone, so the rules are open to all even though one role sets them.
          The switches turn a mechanism on or off; in this POC they are illustrative
          and do not persist.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Mechanisms</div>
        <table className="data">
          <tbody>
            <SwitchRow name="Priced urgency (lanes)" note="fast and bulk lanes available to jobs" checked={flags.lanes} onChange={(v) => setFlags((s) => ({ ...s, lanes: v }))} />
            <SwitchRow name="Time-of-use weighting" note="office/off-hours weight on budget drawn" checked={flags.timeOfUse} onChange={(v) => setFlags((s) => ({ ...s, timeOfUse: v }))} />
            <SwitchRow name="Headroom" note="a share of capacity held back at each level" checked={flags.headroom} onChange={(v) => setFlags((s) => ({ ...s, headroom: v }))} />
            <SwitchRow name="Over-subscription" note="allow granted demand to exceed capacity within a factor" checked={flags.oversubscription} onChange={(v) => setFlags((s) => ({ ...s, oversubscription: v }))} />
            <SwitchRow name="Cross-team standing" note="team-level standing in the queue (phased in later)" checked={flags.teamStanding} onChange={(v) => setFlags((s) => ({ ...s, teamStanding: v }))} />
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Values</div>
        <table className="data">
          <thead>
            <tr>
              <th>Parameter</th>
              <th className="num">Value</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{r.value}</td>
                <td style={{ color: 'var(--ink-2)' }}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Lane is chosen per job at submission via the QOS. Draw factor maps to the
          QOS UsageFactor and queue priority to the QOS Priority. Whether lanes are
          offered at all is the “Priced urgency” switch above.
        </p>
        <p className="note">
          Headroom and the over-subscription factor are the admission controls:
          together they set how much of capacity may be committed. Headroom per team
          and per project is not approved case by case, it is a single percentage
          applied automatically at each level when a budget is granted, so an approved
          budget is already net of the headroom held back.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Tuning indicators</div>
        <p className="stub" style={{ marginTop: 0 }}>
          These measure whether the parameters above are set well. Each is tracked
          per period and read against the parameters in force when it was measured,
          so the effect of a change can be seen. Values below are illustrative.
        </p>
        <div className="tiles" style={{ marginTop: 12, marginBottom: 0 }}>
          <Kpi label="Median wait, fast lane" value="7 min" note="down from 18 min last period" />
          <Kpi label="Median wait, standard" value="41 min" />
          <Kpi label="Budget spent at mid-period" value="52%" note="close to on-pace" />
          <Kpi label="Change requests" value="14" note="4 extensions, 10 budget/priority" />
          <Kpi label="Unused headroom" value="6%" note="of capacity, reclaimable" />
          <Kpi label="Use vs priority spread" value="0.83" note="rank correlation" />
        </div>
      </div>
    </section>
  )
}

function SwitchRow({ name, note, checked, onChange }) {
  return (
    <tr>
      <td style={{ width: '26%' }}>{name}</td>
      <td style={{ color: 'var(--ink-2)' }}>{note}</td>
      <td style={{ width: 60, textAlign: 'right' }}><Toggle checked={checked} onChange={onChange} label={name} /></td>
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

function pct(f) { return Math.round(f * 100) + '%' }
