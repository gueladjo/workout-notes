import { useMemo, useRef, useState } from 'react';

export interface ChartPoint {
  x: number; // e.g. days since epoch
  y: number;
  label: string; // x label for the selected point
}

/**
 * Dependency-free SVG line chart with tap-to-select points, optional trend line, optional goal line
 * and "y from zero". Sized by its container width.
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
}: {
  points: ChartPoint[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  showPoints?: boolean;
  trend?: { a: number; b: number } | null;
  yFromZero?: boolean;
  goal?: number | null;
  formatY: (v: number) => string;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(360);
  const measured = useRef(false);
  const ref = (el: SVGSVGElement | null) => {
    svgRef.current = el;
    if (el && !measured.current) {
      measured.current = true;
      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w) setWidth(w);
      });
      ro.observe(el);
    }
  };
  const pad = { l: 46, r: 14, t: 14, b: 28 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;

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

  if (!scale || points.length === 0) {
    return (
      <div className="chart chart--empty" style={{ height }}>
        No data to graph yet.
      </div>
    );
  }
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.x(p.x).toFixed(1)},${scale.y(p.y).toFixed(1)}`)
    .join(' ');
  const ticks = 4;
  const yTicks = Array.from(
    { length: ticks + 1 },
    (_, i) => scale.minY + ((scale.maxY - scale.minY) * i) / ticks,
  );
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
    <svg
      ref={ref}
      className="chart"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onClick={(e) => pick(e.clientX)}
      role="img"
    >
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={width - pad.r} y1={scale.y(t)} y2={scale.y(t)} className="chart__grid" />
          <text x={pad.l - 6} y={scale.y(t) + 4} textAnchor="end" className="chart__tick">
            {formatY(t)}
          </text>
        </g>
      ))}
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
            r={i === selectedIndex ? 6 : 3.5}
            className={`chart__point${i === selectedIndex ? ' chart__point--selected' : ''}`}
          />
        ))}
      {sel && !showPoints && (
        <circle
          cx={scale.x(sel.x)}
          cy={scale.y(sel.y)}
          r={6}
          className="chart__point chart__point--selected"
        />
      )}
      <text x={pad.l} y={height - 8} className="chart__tick">
        {points[0]?.label}
      </text>
      <text x={width - pad.r} y={height - 8} textAnchor="end" className="chart__tick">
        {points[points.length - 1]?.label}
      </text>
    </svg>
  );
}
