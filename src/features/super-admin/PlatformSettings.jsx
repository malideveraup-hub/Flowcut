import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/ToastContext';
import styles from './Dashboard.module.css';

export default function PlatformSettings() {
  const showToast = useToast();

  return (
    <div>
      <h1 className={styles.title}>Platform settings</h1>
      <p className={styles.sub}>System-level configuration</p>

      <div className={styles.panel} style={{ maxWidth: 420 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            showToast('Settings saved');
          }}
        >
          <Input label="Support email" defaultValue="support@flowcut.app" />
          <Input label="Default reservation cutoff (minutes)" type="number" defaultValue={10} />
          <Button type="submit">Save changes</Button>
        </form>
      </div>
    </div>
  );
}
