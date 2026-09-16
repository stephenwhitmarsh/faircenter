import { useState, useEffect } from 'react'
import './App.css'

import People from './views/People.jsx'
import Budgets from './views/Budgets.jsx'
import ConsumptionReservations from './views/ConsumptionReservations.jsx'
import PolicyParameters from './views/PolicyParameters.jsx'
import Analytics from './views/Analytics.jsx'
import Requests from './views/Requests.jsx'
import Review from './views/Review.jsx'
import Connectors from './views/Connectors.jsx'
import Me from './views/Me.jsx'
import Queue from './views/Queue.jsx'
import Team from './views/Team.jsx'
import { period, leads, opsPeople, members, projectLeads, projectsLedBy, projectState, activeSwitcherPeople } from './data/mockData.js'
import { SessionProvider, useSession, actorFor, RoleChip } from './session.jsx'

const TABS = [
  { id: 'me', label: 'My view', component: Me },
  { id: 'team', label: 'Team', component: Team, teamRole: true },
  { id: 'queue', label: 'Queue', component: Queue },
  { id: 'consumption', label: 'Load', component: ConsumptionReservations },
  { id: 'review', label: 'Projects', component: Review },
  { id: 'budgets', label: 'Budgets', component: Budgets },
  { id: 'people', label: 'Directory', component: People },
  { id: 'requests', label: 'Requests', component: Requests },
  { id: 'analytics', label: 'Analytics', component: Analytics, opsOnly: true },
  { id: 'policy', label: 'Policy', component: PolicyParameters, opsOnly: true },
  { id: 'connectors', label: 'Connectors', component: Connectors, opsOnly: true },
]

// where each role lands by default: ops on Analytics, everyone else on My view
const defaultTabFor = (role) => (role === 'ops' ? 'analytics' : 'me')

// every demo actor (bar the anonymous viewer and ops) takes part in an active project,
// preferably with a job running now, so their My view is never empty
const VIEWERS = activeSwitcherPeople(members)
const LEADS = activeSwitcherPeople(leads)
// project leads who lead an active real project (personal work has no lead), so a
// reservation always has a live project to attach to
const PLEADS = activeSwitcherPeople(projectLeads.filter((p) => projectsLedBy(p.id).some((pr) => projectState(pr) === 'active')))

function RoleSwitcher() {
  const { session, setSession } = useSession()
  const prefix = session.role === 'lead' ? 'lead:' : session.role === 'projlead' ? 'plead:' : session.role === 'ops' ? 'ops:' : 'viewer:'
  const value = session.role === 'viewer' && !session.personId ? 'viewer' : prefix + session.personId
  const onChange = (e) => {
    const v = e.target.value
    if (v === 'viewer') return setSession(actorFor('viewer'))
    const [kind, id] = v.split(':')
    const person = LEADS.concat(opsPeople, PLEADS, VIEWERS).find((p) => p.id === id)
    if (!person) return
    if (kind === 'viewer') return setSession(actorFor('viewer', person))
    if (kind === 'lead') return setSession(actorFor('lead', person))
    if (kind === 'plead') return setSession(actorFor('projlead', person))
    if (kind === 'ops') return setSession(actorFor('ops', person))
  }
  return (
    <label className="role-switch">
      <span>Viewing as</span>
      <RoleChip role={session.role} />
      <select value={value} onChange={onChange}>
        <optgroup label="Viewer">
          <option value="viewer">Anyone (read-only)</option>
          {VIEWERS.map((p) => <option key={p.id} value={'viewer:' + p.id}>{p.name}</option>)}
        </optgroup>
        <optgroup label="Project lead">
          {PLEADS.map((p) => <option key={p.id} value={'plead:' + p.id}>{p.name}</option>)}
        </optgroup>
        <optgroup label="Team lead">
          {LEADS.map((p) => <option key={p.id} value={'lead:' + p.id}>{p.name}</option>)}
        </optgroup>
        <optgroup label="Operations">
          {opsPeople.map((p) => <option key={p.id} value={'ops:' + p.id}>{p.name}</option>)}
        </optgroup>
      </select>
    </label>
  )
}

function AppInner() {
  const { session } = useSession()
  const isOps = session.role === 'ops'
  const isLead = session.role === 'lead'
  const tabVisible = (t) => (!t.opsOnly || isOps) && (!t.teamRole || isOps || isLead)
  const visibleTabs = TABS.filter(tabVisible)
  const [active, setActive] = useState(() => defaultTabFor(session.role))
  // when the role changes, stay on the current tab; only move if it is no longer visible
  useEffect(() => {
    setActive((cur) => {
      const stillVisible = TABS.some((t) => t.id === cur && tabVisible(t))
      return stillVisible ? cur : defaultTabFor(session.role)
    })
  }, [session.role]) // eslint-disable-line react-hooks/exhaustive-deps
  const ActiveView = (visibleTabs.find((t) => t.id === active) || TABS.find((t) => t.id === 'me')).component

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">faircenter</span>
        </div>
        <div className="header-right">
          <RoleSwitcher />
        </div>
      </header>

      <nav className="tabbar" role="tablist">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={'tab' + (active === t.id ? ' tab-active' : '')}
            onClick={() => setActive(t.id)}
          >
            {t.label}{t.opsOnly && <RoleChip role="ops" label="ops" />}{t.teamRole && <RoleChip role="lead" label="team" />}
          </button>
        ))}
      </nav>

      <main className="content">
        <ActiveView onNav={setActive} />
      </main>

      <footer className="app-footer">
        © Stephen Whitmarsh 2026 · <a href="https://github.com/stephenwhitmarsh/faircenter/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Licence</a>
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
