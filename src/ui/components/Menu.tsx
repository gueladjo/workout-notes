import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  divider?: boolean;
}

/**
 * Popover menu anchored to an element (FitNotes' overflow / popup menus). Renders into a portal so
 * it escapes scroll containers. Closes on backdrop tap or Escape.
 */
export function Menu({
  anchor,
  open,
  onClose,
  items,
  align = 'right',
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const menuH = ref.current?.offsetHeight ?? 0;
    let top = r.bottom + 4;
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, r.top - menuH - 4);
    if (align === 'right') setPos({ top, right: Math.max(8, window.innerWidth - r.right) });
    else setPos({ top, left: Math.max(8, r.left) });
  }, [open, anchor, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu" ref={ref} role="menu" style={pos}>
        {items.map((item, i) =>
          item.divider ? (
            <div key={i} className="menu__divider" />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                onClose();
                item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} size={20} />}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.checked !== undefined && (
                <Icon name={item.checked ? 'checkbox' : 'checkboxBlank'} size={20} />
              )}
            </button>
          ),
        )}
      </div>
    </>,
    document.body,
  );
}

/** Convenience: an icon button that opens a menu. */
export function MenuButton({
  items,
  icon = 'more',
  label = 'More options',
  primary,
  small,
}: {
  items: MenuItem[];
  icon?: IconName;
  label?: string;
  primary?: boolean;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton
        icon={icon}
        label={label}
        primary={primary}
        small={small}
        ref={setAnchor}
        onClick={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
      />
      <Menu anchor={anchor} open={open} onClose={() => setOpen(false)} items={items} />
    </>
  );
}

export function useAnchor(): [HTMLElement | null, (el: HTMLElement | null) => void] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return [el, setEl];
}

export type { ReactNode };
