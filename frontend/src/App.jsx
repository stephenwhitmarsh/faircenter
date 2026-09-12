import { useState } from 'react'
import './App.css'

import People from './views/People.jsx'
import Budgets from './views/Budgets.jsx'
import ConsumptionReservations from './views/ConsumptionReservations.jsx'
import PolicyParameters from './views/PolicyParameters.jsx'
import Analytics from './views/Analytics.jsx'
import Requests from './views/Requests.jsx'
import { period, leads, opsPeople } from './data/mockData.js'
import { SessionProvider, useSession, actorFor } from './session.jsx'

const TABS = [
  { id: 'people', label: 'People', component: People },
  { id: 'budgets', label: 'Budgets', component: Budgets },
  { id: 'consumption', label: 'Planning', component: ConsumptionReservations },
  { id: 'policy', label: 'Policy', component: PolicyParameters },
  { id: 'requests', label: 'Requests', component: Requests },
  { id: 'analytics', label: 'Analytics', component: Analytics },
]

function RoleSwitcher() {
  const { session, setSession } = useSession()
  const value = session.role === 'viewer' ? 'viewer' : session.personId
  const onChange = (e) => {
    const v = e.target.value
    if (v === 'viewer') return setSession(actorFor('viewer'))
    const lead = leads.find((p) => p.id === v)
    if (lead) return setSession(actorFor('lead', lead))
    const op = opsPeople.find((p) => p.id === v)
    if (op) return setSession(actorFor('ops', op))
  }
  return (
    <label className="role-switch">
      <span>Viewing as</span>
      <select value={value} onChange={onChange}>
        <option value="viewer">Viewer</option>
        <optgroup label="Team lead">
          {leads.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </optgroup>
        <optgroup label="Operations">
          {opsPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </optgroup>
      </select>
    </label>
  )
}

function AppInner() {
  const [active, setActive] = useState('consumption')
  const ActiveView = TABS.find((t) => t.id === active).component

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">faircenter</span>
          <span className="brand-sub">GPU allocation</span>
        </div>
        <div className="header-right">
          <RoleSwitcher />
          <span className="period">{period.name}</span>
        </div>
      </header>

      <nav className="tabbar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={'tab' + (active === t.id ? ' tab-active' : '')}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        <ActiveView />
      </main>

      <footer className="app-footer">
        Proof of concept, synthetic data. The figures here are illustrative.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <AppInner />
    </SessionProvider>
  )
}
