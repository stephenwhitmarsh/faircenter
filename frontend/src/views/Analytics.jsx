import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import DataTable from '../components/DataTable.jsx'
import InfoTip from '../components/InfoTip.jsx'
import { projects, teams, history, cluster } from '../data/mockData.js'

const C_LINE = '#2a78d6'
const C_BAR = '#6da7ec'
const fmt = (n) => n.toLocaleString('en-GB')

export default function Analytics() {
  const rows = teams.map((t) => {
    const used = projects.filter((p) => p.teamId === t.id).reduce((s, p) => s + p.used, 0)
    return { id: t.id, name: t.name, used }
  })
  const totalUsed = rows.reduce((s, r) => s + r.used, 0)

  return (
    <section>
      <div className="view-head">
        <h2 className="view-title">Analytics</h2>
        <p className="view-intro">
          The longer-run, cross-period picture for direction: how utilisation and
          demand are trending against the hardware, and where use concentrates. This
          is the evidence for priority and investment decisions, distinct from the
          current-period detail in Consumption.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Cluster utilisation by month <InfoTip text="Share of the cluster's available GPU-hours actually consumed each month. Rising utilisation means demand is catching up with capacity." /></div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 6, right: 12, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: 'var(--ink-2)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v) => [v + '%', 'Utilisation']} />
              <Line type="monotone" dataKey="util" name="Utilisation" stroke={C_LINE} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Committed demand vs capacity by month <InfoTip text="Total granted budgets each month against the dashed capacity line. As the bars approach the line, the case for more hardware grows." /></div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={history} margin={{ top: 6, right: 12, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: 'var(--ink-2)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} width={54} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmt(v) + ' GPU-h', 'Committed demand']} />
              <ReferenceLine y={cluster.capacityGpuHours} stroke="var(--line)" strokeDasharray="4 4" label={{ value: 'capacity', fill: 'var(--muted)', fontSize: 11, position: 'insideTopRight' }} />
              <Bar dataKey="demand" name="Committed demand" fill={C_BAR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Share of use by team (this period)</div>
        <DataTable
          initialSort={{ key: 'used', dir: 'desc' }}
          columns={[
            { key: 'name', label: 'Team' },
            { key: 'used', label: 'Used', num: true, render: (r) => fmt(r.used) },
            {
              key: 'share', label: 'Share', sortable: false,
              render: (r) => (
                <div className="meter"><span style={{ width: (r.used / totalUsed) * 100 + '%' }} /></div>
              ),
            },
            { key: 'sharepct', label: 'Share %', num: true, sortValue: (r) => r.used, render: (r) => Math.round((r.used / totalUsed) * 100) + '%' },
          ]}
          rows={rows}
        />
      </div>
    </section>
  )
}
