import styles from './Button.module.css';

/**
 * Shared Button primitive.
 * skin: 'pixel' (Customer) | 'clean' (Barber/Admin) — defaults to 'clean'
 * variant: 'primary' | 'secondary' | 'ghost' | 'destructive'
 */
export default function Button({
  skin = 'clean',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  ...rest
}) {
  const classes = [
    styles.button,
    styles[skin],
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
  ].join(' ');

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
