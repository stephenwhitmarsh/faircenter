// Session and role context: the "Viewing as" identity and per-role permission checks.
import { createContext, useContext, useState } from 'react'
import { personById, teamById, opsPeople } from './data/mockData.js'

// POC stand-in for real identity. In production the signed-in user and their
// roles come from the org's SSO / identity provider through the backend; here
// a header switcher lets us act as different roles to demonstrate what each can
// do. Nothing here is a security boundary.
//
// Roles:
//   viewer  everyone, read-only
//   lead    a team lead: edits their own team (priorities, reservations), submits requests
//   ops     operations: edits global policy, capacity; approves; writes to SLURM

const ROLES = {
  viewer: { role: 'viewer', label: 'Viewer', personId: null, teamId: null },
}

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  // default to operations so a first-time POC visitor sees every view and control
  const [session, setSession] = useState(() => { const me = personById('p-stephen') || opsPeople[0]; return me ? actorFor('ops', me) : ROLES.viewer })

  const can = (action, arg) => {
    const { role, teamId } = session
    switch (action) {
      case 'editPolicy':
      case 'editTeamPolicy':
      case 'editCapacity':
      case 'writeSlurm':
        return role === 'ops'
      case 'editTeam': // arg: teamId
        return role === 'ops' || (role === 'lead' && teamId === arg)
      case 'submitRequest':
        return role !== 'viewer'
      case 'approve': { // arg: request (routedTo)
        if (role === 'ops') return true
        if (role !== 'lead' || !arg) return false
        const tn = teamById(teamId)?.name
        return arg.routedTo === tn || arg.routedTo === `${tn} lead`
      }
      default:
        return false
    }
  }

  return (
    <SessionContext.Provider value={{ session, setSession, can }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside provider')
  return ctx
}

// Build the actor a switcher option maps to.
export function actorFor(kind, person) {
  if (kind === 'viewer') return person
    ? { role: 'viewer', label: `${person.name} · viewer`, personId: person.id, teamId: person.teamIds?.[0] ?? null }
    : ROLES.viewer
  if (kind === 'lead') return { role: 'lead', label: `${person.name} · ${teamById(person.teamIds[0])?.name} lead`, personId: person.id, teamId: person.teamIds[0] }
  if (kind === 'projlead') return { role: 'projlead', label: `${person.name} · project lead`, personId: person.id, teamId: null }
  if (kind === 'ops') return { role: 'ops', label: `${person.name} · operations`, personId: person.id, teamId: null }
  return ROLES.viewer
}

export function currentPerson(session) {
  return session.personId ? personById(session.personId) : null
}

// one place for role identity: label + colour class (see .rolechip in App.css)
export const ROLE_META = {
  viewer: { cls: 'viewer', label: 'viewer' },
  projlead: { cls: 'projlead', label: 'project lead' },
  lead: { cls: 'lead', label: 'team lead' },
  ops: { cls: 'ops', label: 'operations' },
}
export function RoleChip({ role, label }) {
  const m = ROLE_META[role]
  if (!m) return null
  return <span className={'rolechip ' + m.cls} title={m.label}>{label || m.label}</span>
}
