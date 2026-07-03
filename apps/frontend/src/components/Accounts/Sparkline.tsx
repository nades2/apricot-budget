/**
 * Zero-dependency SVG sparkline. Rescales the input series to the given viewBox
 * and draws both a polyline and a filled area underneath so the trend is
 * legible even at 40px tall.
 */
export function Sparkline({
  points,
  accent,
  width = 280,
  height = 48,
}: {
  points: number[];
  accent: 'ASSET' | 'LIABILITY';
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2; // 2px top/bottom padding
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  // Assets trend up (green), liabilities trend down (red) when things are good.
  const stroke = accent === 'ASSET' ? '#1D9E75' : '#E24B4A';
  const fill = accent === 'ASSET' ? '#E1F5EE' : '#FCEBEB';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12" preserveAspectRatio="none">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
