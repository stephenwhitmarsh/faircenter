import { useState, useMemo } from 'react'

// Sortable table.
// columns: [{ key, label, num?, render?(row), sortValue?(row) }]
// initialSort: { key, dir } where dir is 'asc' | 'desc'
export default function DataTable({ columns, rows, initialSort }) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const val = (r) => (col.sortValue ? col.sortValue(r) : r[col.key])
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [rows, columns, sort])

  function clickHeader(col) {
    if (col.sortable === false) return
    setSort((s) => {
      if (!s || s.key !== col.key) return { key: col.key, dir: col.num ? 'desc' : 'asc' }
      if (s.dir === 'asc') return { key: col.key, dir: 'desc' }
      return { key: col.key, dir: 'asc' }
    })
  }

  return (
    <table className="data">
      <thead>
        <tr>
          {columns.map((c) => {
            const active = sort && sort.key === c.key
            const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''
            return (
              <th
                key={c.key}
                className={[c.num ? 'num' : '', c.sortable === false ? '' : 'sortable', c.thClass || ''].filter(Boolean).join(' ')}
                onClick={() => clickHeader(c)}
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {c.label}{arrow}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.id ?? i}>
            {columns.map((c) => (
              <td key={c.key} className={[c.num ? 'num' : '', c.tdClass || ''].filter(Boolean).join(' ')}>
                {c.render ? c.render(r) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
