import { useState } from 'react'
import './App.css'

import People from './views/People.jsx'
import Budgets from './views/Budgets.jsx'
import ConsumptionReservations from './views/ConsumptionReservations.jsx'
import PolicyParameters from './views/PolicyParameters.jsx'
import Analytics from './views/Analytics.jsx'
import Requests from './views/Requests.jsx'
import { period } from './data/mockData.js'

const TABS = [
  { id: 'people', label: 'People', component: People },
  { id: 'budgets', label: 'Budgets', component: Budgets },
  { id: 'consumption', label: 'Consumption & reservations', component: ConsumptionReservations },
  { id: 'policy', label: 'Policy & parameters', component: PolicyParameters },
  { id: 'analytics', label: 'Analytics', component: Analytics },
  { id: 'requests', label: 'Requests for changes', component: Requests },
]

export default function App() {
  const [active, setActive] = useState('consumption')
  const ActiveView = TABS.find((t) => t.id === active).component

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">faircenter</span>
          <span className="brand-sub">GPU allocation</span>
        </div>
        <div className="period">{period.name}</div>
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
