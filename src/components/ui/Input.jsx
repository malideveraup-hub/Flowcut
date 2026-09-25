import { useId } from 'react';
import styles from './Input.module.css';

export default function Input({
  label,
  error,
  id,
  name,
  labelClassName,
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || name || generatedId;

  return (
    <div className={styles.field}>
      {label && (
        <label
          htmlFor={inputId}
          className={[styles.label, labelClassName || ''].join(' ')}
        >
          {label}
        </label>
      )}

      <input
        id={inputId}
        name={name}
        className={[styles.input, error ? styles.inputError : ''].join(' ')}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...rest}
      />

      {error && (
        <p id={`${inputId}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}