import { useState, useMemo, Fragment } from 'react'

// Sortable table.
// columns: [{ key, label, num?, render?(row), sortValue?(row) }]
// initialSort: { key, dir } where dir is 'asc' | 'desc'
export default function DataTable({ columns, rows, initialSort, onRowClick, selectedId, colWidths, rowClassName, expandedId, renderExpanded }) {
  const [sort, setSort] = useState(initialSort ?? null)
  const total = colWidths ? colWidths.reduce((a, b) => a + b, 0) : undefined

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
    <table className={'data' + (colWidths ? ' data-fixed' : '')} style={colWidths ? { width: total, tableLayout: 'fixed' } : undefined}>
      {colWidths && <colgroup>{columns.map((c, i) => <col key={c.key} style={{ width: colWidths[i] }} />)}</colgroup>}
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
        {sorted.map((r, i) => {
          const isExpanded = renderExpanded && expandedId != null && r.id === expandedId
          return (
            <Fragment key={r.id ?? i}>
              <tr
                className={[onRowClick ? 'row-click' : '', (selectedId && r.id === selectedId) || isExpanded ? 'row-sel' : '', rowClassName ? rowClassName(r) : ''].filter(Boolean).join(' ')}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={[c.num ? 'num' : '', c.tdClass || ''].filter(Boolean).join(' ')}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
              {isExpanded && (
                <tr className="row-expand">
                  <td colSpan={columns.length} style={{ padding: 0 }}>{renderExpanded(r)}</td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
