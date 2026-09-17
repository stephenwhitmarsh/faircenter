// The allocation mechanisms as labelled on/off toggle rows, in one place so the
// Policy tab (editable by operations) and the Team tab (read-only, reflecting
// the team's phase) show the same switches. Pass onToggle to make them editable.
import Toggle from './Toggle.jsx'

const ROWS = [
  ['enfPerson', 'Person budgets', 'cap each person at their budget'],
  ['enfProject', 'Project budgets', 'cap each project at its budget'],
  ['enfTeam', 'Team budgets', 'cap each team pool'],
  ['lanes', 'Priced urgency (lanes)', 'fast and bulk lanes available to jobs'],
  ['timeOfUse', 'Time-of-use weighting', 'office/off-hours weight on budget drawn'],
  ['teamStanding', 'Cross-team standing', 'team-level standing in the queue'],
]

export default function Mechanisms({ flags = {}, editable = false, onToggle }) {
  return (
    <table className="data">
      <tbody>
        {ROWS.map(([k, name, note]) => (
          <tr key={k}>
            <td style={{ width: '26%' }}>{name}</td>
            <td style={{ color: 'var(--ink-2)' }}>{note}</td>
            <td style={{ width: 60, textAlign: 'right' }}>
              <Toggle checked={!!flags[k]} label={name} disabled={!editable}
                onChange={(v) => editable && onToggle && onToggle(k, v)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
