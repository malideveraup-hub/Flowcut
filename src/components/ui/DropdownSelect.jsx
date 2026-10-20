import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './DropdownSelect.module.css';

export default function DropdownSelect({ value, onChange, options, label, variant = 'pill', className = '', menuPlacement = 'bottom', menuMaxHeight }) {
  const id = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      const maxHeight = Math.min(Number.parseInt(menuMaxHeight, 10) || 280, window.innerHeight - 32);
      const spaceBelow = window.innerHeight - rect.bottom - gap - 16;
      const spaceAbove = rect.top - gap - 16;
      const placeAbove = menuPlacement === 'top' || (menuPlacement !== 'bottom' && spaceBelow < Math.min(180, maxHeight) && spaceAbove > spaceBelow);
      const availableHeight = Math.max(96, Math.min(maxHeight, placeAbove ? spaceAbove : spaceBelow));
      setMenuPosition({
        left: Math.max(16, Math.min(rect.right - Math.max(rect.width, 220), window.innerWidth - Math.max(rect.width, 220) - 16)),
        width: Math.min(Math.max(rect.width, 220), window.innerWidth - 32),
        ...(placeAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
        maxHeight: availableHeight,
      });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, menuMaxHeight, menuPlacement]);

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
        ref={triggerRef}
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
      {open && menuPosition && createPortal(
        <div ref={menuRef} id={`${id}-listbox`} className={styles.listbox} style={menuPosition} role="listbox" aria-label={label}>
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
        </div>,
        document.body,
      )}
    </div>
  );
}
