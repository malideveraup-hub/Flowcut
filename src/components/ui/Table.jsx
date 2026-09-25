import styles from './Table.module.css';

/**
 * columns: [{ key, header, render? }]
 * rows: array of data objects, each needs a unique `id`
 */
export default function Table({ columns, rows, emptyMessage = 'Nothing to show yet.' }) {
  if (!rows || rows.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((col) => (
              <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
