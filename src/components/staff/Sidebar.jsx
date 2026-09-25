import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

/**
 * items: [{ to, label, end? }]
 */
export default function Sidebar({ items, subtitle }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>FlowCut</div>
      {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => [styles.item, isActive ? styles.active : ''].join(' ')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
