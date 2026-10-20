import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/ToastContext';
import styles from './PlatformSettings.module.css';

export default function PlatformSettings() {
  const showToast = useToast();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>FLOWCUT PLATFORM</p>
        <h1>Platform settings</h1>
        <p className={styles.description}>Manage the defaults and support details used across the platform.</p>
      </header>

      <section className={styles.formCard} aria-label="Platform settings">
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            showToast('Settings saved');
          }}
        >
          <Input label="Support email" defaultValue="support@flowcut.app" />
          <Input label="Default reservation cutoff (minutes)" type="number" defaultValue={10} />
          <div className={styles.actions}><Button type="submit">Save changes</Button></div>
        </form>
      </section>
    </main>
  );
}
