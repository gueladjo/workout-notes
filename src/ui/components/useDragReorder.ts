import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from 'react';

const HOLD_MS = 450;
const MOVE_TOLERANCE_PX = 8;

interface Drag<T> {
  id: T;
  order: T[];
  pointerId: number;
}

/**
 * Press-and-hold a row, then drag it to a new position (how FitNotes reorders sets). Spread
 * `listProps` (plus `ref={listRef}`) on the list element and `rowProps(id)` on each row, render the
 * rows in `order`, and call `onReorder` receives the new order when the pointer is released.
 *
 * Works with touch: the hold keeps the finger still so the page has not started scrolling, and a
 * native non-passive `touchmove` listener (React's own touch listeners are passive) cancels the
 * scroll once a drag is under way. The list captures the pointer so the release lands on it rather
 * than on a row's click handler; `clickWasDrag()` covers the no-capture case.
 */
export function useDragReorder<T extends string | number>(ids: T[], onReorder: (order: T[]) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag<T> | null>(null);
  const dragRef = useRef<Drag<T> | null>(null);
  const press = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const justEnded = useRef(false);
  const justEndedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ ids, onReorder });

  useEffect(() => {
    latest.current = { ids, onReorder };
  }, [ids, onReorder]);

  const cancelPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  const update = useCallback((d: Drag<T> | null) => {
    dragRef.current = d;
    setDrag(d);
  }, []);

  const end = useCallback(
    (pointerId?: number) => {
      if (pointerId === undefined || press.current?.pointerId === pointerId) cancelPress();
      const d = dragRef.current;
      if (!d || (pointerId !== undefined && d.pointerId !== pointerId)) return;
      update(null);
      justEnded.current = true;
      if (justEndedTimer.current) clearTimeout(justEndedTimer.current);
      justEndedTimer.current = setTimeout(() => {
        justEnded.current = false;
        justEndedTimer.current = null;
      }, 0);
      const { ids: currentIds, onReorder: commit } = latest.current;
      if (d.order.some((id, i) => currentIds[i] !== id)) commit(d.order);
    },
    [cancelPress, update],
  );

  useEffect(() => {
    const el = listRef.current;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el?.addEventListener('touchmove', onTouchMove, { passive: false });
    const onWindowPointerEnd = (e: PointerEvent) => end(e.pointerId);
    const onWindowBlur = () => end();
    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      el?.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
      window.removeEventListener('blur', onWindowBlur);
      cancelPress();
      if (justEndedTimer.current) {
        clearTimeout(justEndedTimer.current);
        justEndedTimer.current = null;
      }
    };
  }, [cancelPress, end]);

  const onPointerDown = (id: T, e: ReactPointerEvent) => {
    if (ids.length < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelPress();
    const pointerId = e.pointerId;
    press.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId,
      timer: setTimeout(() => {
        press.current = null;
        const currentIds = latest.current.ids;
        if (currentIds.length < 2 || !currentIds.includes(id)) return;
        update({ id, order: currentIds, pointerId });
        try {
          listRef.current?.setPointerCapture(pointerId);
        } catch {
          // The pointer is gone already; window pointerup / clickWasDrag() still handle cleanup.
        }
      }, HOLD_MS),
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (
      p &&
      p.pointerId === e.pointerId &&
      Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX
    ) {
      cancelPress();
    }
    const d = dragRef.current;
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-drag-id]');
    if (!d || d.pointerId !== e.pointerId || !rows) return;
    let target = -1;
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY < r.bottom) target = i;
    });
    const from = d.order.indexOf(d.id);
    if (target < 0 || target === from) return;
    const order = d.order.slice();
    order.splice(from, 1);
    order.splice(target, 0, d.id);
    update({ id: d.id, order, pointerId: d.pointerId });
  };

  return {
    listRef,
    /** Ids in display order (live while dragging). */
    order: drag ? drag.order : ids,
    draggingId: drag ? drag.id : null,
    listProps: {
      onPointerMove,
      onPointerUp: (e: ReactPointerEvent) => end(e.pointerId),
      onPointerCancel: (e: ReactPointerEvent) => end(e.pointerId),
      onLostPointerCapture: (e: ReactPointerEvent) => end(e.pointerId),
      onPointerLeave: cancelPress,
    },
    rowProps: (id: T) => ({
      'data-drag-id': String(id),
      onPointerDown: (e: ReactPointerEvent) => onPointerDown(id, e),
      onContextMenu: (e: SyntheticEvent) => e.preventDefault(),
    }),
    /** True for the click that ends a drag, so row click handlers can ignore it. */
    clickWasDrag: () => justEnded.current,
  };
}
