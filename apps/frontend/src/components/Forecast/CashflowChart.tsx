import { useMemo, useState } from 'react';
import { ForecastDay } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * CashflowChart v3 — SVG natif, zero dependance, avec vraie mise en page
 * cartographique : marges, grille horizontale, ticks mensuels, tooltip riche.
 *
 * Layout SVG :
 *   +----------------------------------------------+
 *   | pad top                                     |
 *   |  yLabel |  plot area (avec grille)          |
 *   |         |                                   |
 *   | pad bot |  xLabels (mois)                   |
 *   +----------------------------------------------+
 */
export function CashflowChart({
  days,
  overlayDays,
  threshold,
  todayIso,
  height = 260,
}: {
  days: ForecastDay[];
  overlayDays?: ForecastDay[];
  threshold?: number | null;
  todayIso?: string;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const geom = useMemo(
    () => buildGeometry(days, overlayDays ?? null, threshold ?? null, todayIso ?? null, height),
    [days, overlayDays, threshold, todayIso, height],
  );

  if (days.length < 2) {
    return <p className="text-xs text-gray-500">Pas assez de donnees pour le graphique.</p>;
  }

  const {
    baselinePath, overlayPath,
    areaAbove, areaBelow,
    baselinePoints, overlayPoints,
    yTicks, xTicks, thresholdY, todayX,
    width, plotLeft, plotRight, plotTop, plotBottom,
  } = geom;

  const hoverBaseline = hoverIdx != null ? days[hoverIdx] : null;
  const hoverOverlay = hoverIdx != null && overlayDays ? overlayDays[hoverIdx] : null;
  const hoverBaselinePoint = hoverIdx != null ? baselinePoints[hoverIdx] : null;
  const hoverOverlayPoint = hoverIdx != null && overlayPoints ? overlayPoints[hoverIdx] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full block"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const xInPixels = e.clientX - rect.left;
          const xInViewBox = (xInPixels / rect.width) * width;
          const plotWidth = plotRight - plotLeft;
          const relX = xInViewBox - plotLeft;
          if (relX < 0 || relX > plotWidth) {
            setHoverIdx(null);
            return;
          }
          const stepX = plotWidth / (days.length - 1);
          const idx = Math.min(days.length - 1, Math.max(0, Math.round(relX / stepX)));
          setHoverIdx(idx);
        }}
      >
        {/* Grille horizontale */}
        {yTicks.map((t, i) => (
          <line
            key={`grid-${i}`}
            x1={plotLeft}
            x2={plotRight}
            y1={t.y}
            y2={t.y}
            stroke="currentColor"
            className="text-gray-200 dark:text-gray-800"
            strokeWidth="0.5"
          />
        ))}

        {/* Labels Y (a gauche) */}
        {yTicks.map((t, i) => (
          <text
            key={`ylabel-${i}`}
            x={plotLeft - 6}
            y={t.y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="10"
            className="fill-gray-500 dark:fill-gray-400 tabular-nums"
          >
            {formatCurrency(t.value)}
          </text>
        ))}

        {/* Aire sous la baseline — remplissage semantique via CSS var pour
            que le meme composant fonctionne en light et dark sans branchement JS. */}
        <path d={areaAbove} style={{ fill: 'var(--chart-baseline-fill)' }} />
        {areaBelow && <path d={areaBelow} style={{ fill: 'var(--chart-below-fill)' }} />}

        {/* Ligne seuil */}
        {thresholdY != null && (
          <>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={thresholdY}
              y2={thresholdY}
              style={{ stroke: 'var(--chart-threshold)' }}
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity={0.75}
            />
            <text
              x={plotRight - 4}
              y={thresholdY - 4}
              textAnchor="end"
              fontSize="9"
              style={{ fill: 'var(--chart-threshold)' }}
              opacity={0.9}
            >
              seuil
            </text>
          </>
        )}

        {/* Ticks + labels X (mois) */}
        {xTicks.map((t, i) => (
          <g key={`xtick-${i}`}>
            <line
              x1={t.x}
              x2={t.x}
              y1={plotTop}
              y2={plotBottom}
              stroke="currentColor"
              className="text-gray-100 dark:text-gray-800/70"
              strokeWidth="0.5"
            />
            <text
              x={t.x}
              y={plotBottom + 14}
              textAnchor="middle"
              fontSize="10"
              className="fill-gray-500 dark:fill-gray-400"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Marqueur aujourd hui — teal pour matcher la convention "aujourd hui"
            du calendrier (bordure teal sur la cellule du jour). */}
        {todayX != null && (
          <>
            <line
              x1={todayX}
              x2={todayX}
              y1={plotTop}
              y2={plotBottom}
              style={{ stroke: 'var(--chart-today)' }}
              strokeWidth="1.25"
              strokeDasharray="3 3"
              opacity={0.85}
            />
            <rect
              x={todayX - 24}
              y={plotTop - 15}
              width={48}
              height={14}
              rx={3}
              style={{ fill: 'var(--chart-today)' }}
            />
            <text
              x={todayX}
              y={plotTop - 5}
              textAnchor="middle"
              fontSize="9.5"
              style={{ fill: 'var(--chart-today-text)' }}
              fontWeight={700}
            >
              aujourd hui
            </text>
          </>
        )}

        {/* Ligne baseline */}
        <path
          d={baselinePath}
          fill="none"
          style={{ stroke: 'var(--chart-baseline)' }}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Ligne scenario */}
        {overlayPath && (
          <path
            d={overlayPath}
            fill="none"
            style={{ stroke: 'var(--chart-scenario)' }}
            strokeWidth="1.75"
            strokeDasharray="5 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Point + ligne verticale de survol */}
        {hoverBaselinePoint && (
          <>
            <line
              x1={hoverBaselinePoint[0]}
              x2={hoverBaselinePoint[0]}
              y1={plotTop}
              y2={plotBottom}
              stroke="currentColor"
              className="text-gray-400 dark:text-gray-500"
              strokeWidth="0.75"
              opacity={0.5}
            />
            <circle
              cx={hoverBaselinePoint[0]}
              cy={hoverBaselinePoint[1]}
              r={4}
              style={{ fill: 'var(--chart-baseline)', stroke: 'var(--chart-hover-ring)' }}
              strokeWidth="1.5"
            />
            {hoverOverlayPoint && (
              <circle
                cx={hoverOverlayPoint[0]}
                cy={hoverOverlayPoint[1]}
                r={4}
                style={{ fill: 'var(--chart-scenario)', stroke: 'var(--chart-hover-ring)' }}
                strokeWidth="1.5"
              />
            )}
          </>
        )}
      </svg>

      {/* Tooltip absolu, positionne selon le point de survol */}
      {hoverBaseline && hoverBaselinePoint && (
        <div
          className="absolute bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-md px-3 py-2 text-xs pointer-events-none z-10 whitespace-nowrap"
          style={{
            left: `${(hoverBaselinePoint[0] / width) * 100}%`,
            top: 8,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-medium mb-1 tabular-nums">{hoverBaseline.date}</div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 dark:text-gray-400">Baseline</span>
            <b
              className={
                hoverBaseline.belowThreshold
                  ? 'text-cat-red-fg dark:text-cat-red'
                  : 'text-cat-green-fg dark:text-cat-green'
              }
            >
              {formatCurrency(hoverBaseline.balance, true)}
            </b>
          </div>
          {hoverOverlay && (
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--scenario-fg)' }}>Scenario</span>
              <b
                className={hoverOverlay.belowThreshold ? 'text-cat-red-fg dark:text-cat-red' : ''}
                style={hoverOverlay.belowThreshold ? undefined : { color: 'var(--scenario-fg)' }}
              >
                {formatCurrency(hoverOverlay.balance, true)}
              </b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Geometrie : marges, echelle Y "nice", ticks X mensuels
// ---------------------------------------------------------------------------

type Tick = { value: number; y: number };
type XTick = { x: number; label: string };

type Geometry = {
  baselinePath: string;
  overlayPath: string | null;
  areaAbove: string;
  areaBelow: string | null;
  baselinePoints: Array<readonly [number, number]>;
  overlayPoints: Array<readonly [number, number]> | null;
  yTicks: Tick[];
  xTicks: XTick[];
  thresholdY: number | null;
  todayX: number | null;
  width: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
};

function buildGeometry(
  days: ForecastDay[],
  overlayDays: ForecastDay[] | null,
  threshold: number | null,
  todayIso: string | null,
  height: number,
): Geometry {
  const width = 800;
  const plotLeft = 60;        // place pour les labels Y
  const plotRight = width - 12;
  const plotTop = 24;         // place pour le tag "aujourd hui"
  const plotBottom = height - 22;   // place pour les labels X
  const plotHeight = plotBottom - plotTop;
  const plotWidth = plotRight - plotLeft;

  const baselineBalances = days.map((d) => Number(d.balance));
  const overlayBalances = overlayDays ? overlayDays.map((d) => Number(d.balance)) : [];

  const rawMin = Math.min(...baselineBalances, ...overlayBalances, threshold ?? Infinity);
  const rawMax = Math.max(...baselineBalances, ...overlayBalances, threshold ?? -Infinity);

  // Echelle Y "nice" : etend a un multiple rond, ~ 4-5 ticks.
  const [yMin, yMax, yTickValues] = niceScale(rawMin, rawMax, 5);
  const scaleY = (v: number) => plotTop + (1 - (v - yMin) / (yMax - yMin)) * plotHeight;

  const yTicks: Tick[] = yTickValues.map((value) => ({ value, y: scaleY(value) }));

  const stepX = plotWidth / (days.length - 1);
  const baselinePoints = baselineBalances.map((v, i) => [plotLeft + i * stepX, scaleY(v)] as const);
  const overlayPoints = overlayDays
    ? overlayBalances.map((v, i) => [plotLeft + i * stepX, scaleY(v)] as const)
    : null;

  const baselinePath = baselinePoints
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');

  const overlayPath = overlayPoints
    ? overlayPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
    : null;

  const thresholdY = threshold != null ? scaleY(threshold) : null;

  // Aire au-dessus du seuil (verte).
  const clipY = thresholdY ?? plotBottom;
  const areaAbove = `${baselinePath} L ${plotRight.toFixed(1)} ${clipY.toFixed(1)} L ${plotLeft.toFixed(1)} ${clipY.toFixed(1)} Z`;

  // Aire sous le seuil (rouge).
  let areaBelow: string | null = null;
  if (thresholdY != null) {
    const segments: Array<Array<readonly [number, number]>> = [];
    let current: Array<readonly [number, number]> = [];
    for (const p of baselinePoints) {
      if (p[1] > thresholdY) {
        current.push(p);
      } else if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length > 0) segments.push(current);

    if (segments.length > 0) {
      areaBelow = segments
        .map((seg) => {
          const start = seg[0];
          const end = seg[seg.length - 1];
          const line = seg.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
          return `${line} L ${end[0].toFixed(1)} ${thresholdY!.toFixed(1)} L ${start[0].toFixed(1)} ${thresholdY!.toFixed(1)} Z`;
        })
        .join(' ');
    }
  }

  // Ticks X : un par debut de mois dans la fenetre.
  const xTicks = buildMonthTicks(days, plotLeft, stepX);

  let todayX: number | null = null;
  if (todayIso) {
    const idx = days.findIndex((d) => d.date === todayIso);
    if (idx >= 0) todayX = plotLeft + idx * stepX;
  }

  return {
    baselinePath, overlayPath,
    areaAbove, areaBelow,
    baselinePoints, overlayPoints,
    yTicks, xTicks, thresholdY, todayX,
    width, plotLeft, plotRight, plotTop, plotBottom,
  };
}

/**
 * Retourne [min, max, ticks] pour une echelle "jolie" — bornes arrondies au
 * plus proche multiple d une puissance de 10, ~ `targetTicks` graduations.
 */
function niceScale(rawMin: number, rawMax: number, targetTicks: number): [number, number, number[]] {
  if (rawMin === rawMax) {
    const pad = rawMin === 0 ? 100 : Math.abs(rawMin) * 0.1;
    return [rawMin - pad, rawMax + pad, [rawMin]];
  }
  const range = rawMax - rawMin;
  const roughStep = range / (targetTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  // Pas usuels : 1, 2, 2.5, 5, 10.
  let niceStep: number;
  if (normalized < 1.5) niceStep = 1;
  else if (normalized < 3) niceStep = 2;
  else if (normalized < 7) niceStep = 5;
  else niceStep = 10;
  const step = niceStep * magnitude;
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return [min, max, ticks];
}

const MONTH_LABELS_FR = [
  'janv.', 'fev.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.',
];

/**
 * Ticks X : un tick par 1er du mois trouve dans les days.
 * Si la fenetre est courte (< 60j), on affiche aussi la premiere date.
 */
function buildMonthTicks(days: ForecastDay[], plotLeft: number, stepX: number): XTick[] {
  const ticks: XTick[] = [];
  let seenMonths = new Set<string>();
  for (let i = 0; i < days.length; i++) {
    const d = days[i].date;
    const [y, m, dd] = d.split('-');
    const key = `${y}-${m}`;
    if (seenMonths.has(key)) continue;
    // Ne tick que pour le premier du mois, sauf si c est la premiere date de la fenetre.
    if (dd === '01' || i === 0) {
      seenMonths.add(key);
      ticks.push({
        x: plotLeft + i * stepX,
        label: MONTH_LABELS_FR[Number(m) - 1] ?? m,
      });
    }
  }
  return ticks;
}
