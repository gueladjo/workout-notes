import { useMemo, useRef, useState } from 'react';
import { tickDecimals } from '@/domain/graphs';

export interface ChartPoint {
  x: number; // e.g. days since epoch
  y: number;
  label: string; // x label for the selected point
}

/**
 * Dependency-free SVG line chart with tap-to-select points, optional trend line, optional goal line
 * and "y from zero". Sized by its container: the width always, the height too when `fill` is set
 * (the chart then grows with a flex parent, like FitNotes' full-screen graph).
 */
export function LineChart({
  points,
  selectedIndex,
  onSelect,
  showPoints = true,
  trend,
  yFromZero,
  goal,
  formatY,
  height = 240,
  fill = false,
}: {
  points: ChartPoint[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  showPoints?: boolean;
  trend?: { a: number; b: number } | null;
  yFromZero?: boolean;
  goal?: number | null;
  /** Axis label for a tick value; `decimals` is what the tick spacing needs (see tickDecimals). */
  formatY: (v: number, decimals: number) => string;
  height?: number;
  fill?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 360, h: height });
  const measured = useRef(false);
  const ref = (el: HTMLDivElement | null) => {
    if (el && !measured.current) {
      measured.current = true;
      const ro = new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect;
        if (r && r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
      });
      ro.observe(el);
    }
  };
  const width = size.w;
  const h = fill ? size.h : height;
  const pad = { l: 46, r: 14, t: 14, b: 28 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = Math.max(10, h - pad.t - pad.b);

  const scale = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    let minY = yFromZero ? 0 : Math.min(...ys, goal ?? Infinity);
    let maxY = Math.max(...ys, goal ?? -Infinity);
    if (!yFromZero) {
      const span = maxY - minY || Math.abs(maxY) || 1;
      minY -= span * 0.15;
      maxY += span * 0.15;
    } else {
      maxY += (maxY - minY || 1) * 0.1;
    }
    if (minY === maxY) maxY = minY + 1;
    return {
      x: (v: number) => pad.l + ((v - minX) / (maxX - minX)) * iw,
      y: (v: number) => pad.t + ih - ((v - minY) / (maxY - minY)) * ih,
      minX,
      maxX,
      minY,
      maxY,
    };
  }, [points, yFromZero, goal, iw, ih, pad.l, pad.t]);

  const className = `chart${fill ? ' chart--fill' : ''}`;
  const boxStyle = fill ? undefined : { height };

  if (!scale || points.length === 0) {
    return (
      <div ref={ref} className={`${className} chart--empty`} style={boxStyle}>
        No data to graph yet.
      </div>
    );
  }
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.x(p.x).toFixed(1)},${scale.y(p.y).toFixed(1)}`)
    .join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const baseline = (pad.t + ih).toFixed(1);
  const area = `${path} L${scale.x(last.x).toFixed(1)},${baseline} L${scale.x(first.x).toFixed(1)},${baseline} Z`;

  // More horizontal grid lines on a tall chart, more date labels on a wide one.
  const ticks = Math.max(4, Math.min(10, Math.round(ih / 55)));
  const step = (scale.maxY - scale.minY) / ticks;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => scale.minY + step * i);
  const decimals = tickDecimals(step);
  const labelCount = Math.max(2, Math.min(5, Math.floor(iw / 110)));
  const xLabels = Array.from({ length: labelCount }, (_, k) => {
    const target = scale.minX + ((scale.maxX - scale.minX) * k) / (labelCount - 1);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - target) < Math.abs(points[best]!.x - target)) best = i;
    });
    return best;
  }).filter((idx, k, arr) => arr.indexOf(idx) === k);
  const sel = selectedIndex !== null ? points[selectedIndex] : undefined;

  const pick = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(scale.x(p.x) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    onSelect(best);
  };

  return (
    <div ref={ref} className={className} style={boxStyle}>
      <svg
        ref={svgRef}
        className="chart__svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${h}`}
        preserveAspectRatio="none"
        onClick={(e) => pick(e.clientX)}
        role="img"
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={width - pad.r} y1={scale.y(t)} y2={scale.y(t)} className="chart__grid" />
            <text x={pad.l - 6} y={scale.y(t) + 4} textAnchor="end" className="chart__tick">
              {formatY(t, decimals)}
            </text>
          </g>
        ))}
        <path d={area} className="chart__area" />
        {goal !== null && goal !== undefined && goal > 0 && (
          <line x1={pad.l} x2={width - pad.r} y1={scale.y(goal)} y2={scale.y(goal)} className="chart__goal" />
        )}
        {trend && (
          <line
            x1={scale.x(scale.minX)}
            x2={scale.x(scale.maxX)}
            y1={scale.y(trend.a + trend.b * scale.minX)}
            y2={scale.y(trend.a + trend.b * scale.maxX)}
            className="chart__trend"
          />
        )}
        <path d={path} className="chart__line" />
        {showPoints &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={scale.x(p.x)}
              cy={scale.y(p.y)}
              r={i === selectedIndex ? 5 : 2.5}
              className={`chart__point${i === selectedIndex ? ' chart__point--selected' : ''}`}
            />
          ))}
        {sel && !showPoints && (
          <circle
            cx={scale.x(sel.x)}
            cy={scale.y(sel.y)}
            r={5}
            className="chart__point chart__point--selected"
          />
        )}
        {xLabels.map((idx, k) => {
          const p = points[idx]!;
          const anchor = k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle';
          const x = k === 0 ? pad.l : k === xLabels.length - 1 ? width - pad.r : scale.x(p.x);
          return (
            <text key={idx} x={x} y={h - 8} textAnchor={anchor} className="chart__tick">
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
