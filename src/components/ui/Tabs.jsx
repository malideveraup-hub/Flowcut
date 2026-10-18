import { useState } from 'react';
import styles from './Tabs.module.css';

export default function Tabs({ tabs, initial = 0, skin = 'clean' }) {
  const [active, setActive] = useState(initial);

  return (
    <div>
      <div className={[styles.list, styles[skin]].join(' ')} role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            role="tab"
            aria-selected={active === i}
            className={[styles.tab, active === i ? styles.active : ''].join(' ')}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.panel}>{tabs[active]?.content}</div>
    </div>
  );
}
