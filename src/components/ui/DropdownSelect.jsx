import { useEffect, useId, useRef, useState } from 'react';
import styles from './DropdownSelect.module.css';

export default function DropdownSelect({ value, onChange, options, label, variant = 'pill', className = '' }) {
  const id = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function choose(index) {
    onChange(options[index].value);
    setActiveIndex(index);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + step + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(activeIndex);
      else {
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.key.length === 1 && /[\p{L}\p{N}]/u.test(event.key)) {
      const start = open ? activeIndex + 1 : selectedIndex;
      const search = event.key.toLocaleLowerCase();
      const offset = Array.from({ length: options.length }, (_, index) => (start + index) % options.length)
        .find((index) => options[index].label.toLocaleLowerCase().startsWith(search));
      if (offset !== undefined) {
        setOpen(true);
        setActiveIndex(offset);
      }
    }
  }

  return (
    <div ref={rootRef} className={`${styles.control} ${styles[variant]} ${open ? styles.open : ''} ${className}`.trim()}>
      <button
        type="button"
        className={styles.trigger}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((isOpen) => !isOpen);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label}</span>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && (
        <div id={`${id}-listbox`} className={styles.listbox} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <div
              id={`${id}-option-${index}`}
              key={option.value}
              className={`${styles.option} ${index === activeIndex ? styles.highlighted : ''} ${option.value === value ? styles.selected : ''}`}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
