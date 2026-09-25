import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ui/ToastContext';
import styles from './BottomTabBar.module.css';

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/discover', label: 'Discover' },
  { to: '/my-queue', label: 'My queue', protected: true },
  { to: '/profile', label: 'Profile', protected: true },
];

export default function BottomTabBar() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const showToast = useToast();

  function handleTabClick(e, tab) {
    if (tab.protected && role !== 'customer') {
      e.preventDefault();

      const section = tab.to === '/profile' ? 'profile' : 'queue';
      showToast(`Please log in to access your ${section}.`);

      setTimeout(() => {
        navigate('/login', {
          state: {
            from: {
              pathname: tab.to,
            },
          },
        });
      }, 1000);
    }
  }

  return (
    <nav className={styles.bar} aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          onClick={(e) => handleTabClick(e, tab)}
          className={({ isActive }) =>
            [styles.tab, isActive ? styles.active : ''].join(' ')
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}