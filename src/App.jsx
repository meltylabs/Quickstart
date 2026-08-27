import React, {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  FileCheck2,
  FlaskConical,
  Gauge,
  Pause,
  Play,
  RefreshCcw,
} from 'lucide-react';

const VitessceComponent = lazy(async () => {
  const mod = await import('vitessce');
  return { default: mod.Vitessce || mod.default };
});

const WEIGHT_FALLBACK = [0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9];
const REPRESENTATIVE = 'SB67_NBM37_H35_CODEX_Mesmer';
const PALETTE = [
  '#9b2335',
  '#2e6f62',
  '#2f6c9e',
  '#c4862d',
  '#6a4c93',
  '#177e89',
  '#d45238',
  '#45503b',
  '#b04a7a',
  '#4e79a7',
  '#59a14f',
  '#8a6f35',
  '#af7aa1',
  '#5d737e',
];

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return Number(value).toFixed(digits);
}

function formatWeight(value) {
  return Number(value).toFixed(2).replace(/0$/, '').replace(/0$/, '').replace(/\.$/, '');
}

function shortSample(sample) {
  const match = sample.match(/NBM\d+_H\d+/);
  return match ? match[0].replace('_', ' ') : sample;
}

function metricValue(row, names) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null) {
      return Number(row[name]);
    }
  }
  return null;
}

async function api(path) {
  const response = await fetch(path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || `Request failed: ${path}`);
  }
  return body;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function hashLabel(label) {
  const text = String(label);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function boundsFor(x, y) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < x.length; i += 1) {
    const xx = Number(x[i]);
    const yy = Number(y[i]);
    if (Number.isFinite(xx) && Number.isFinite(yy)) {
      minX = Math.min(minX, xx);
      maxX = Math.max(maxX, xx);
      minY = Math.min(minY, yy);
      maxY = Math.max(maxY, yy);
    }
  }
  return { minX, maxX, minY, maxY };
}

function pointProjector(x, y, rect) {
  const bounds = boundsFor(x, y);
  const pad = 18;
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  return (i) => {
    const px = rect.x + pad + ((Number(x[i]) - bounds.minX) / w) * Math.max(1, rect.w - pad * 2);
    const py = rect.y + rect.h - pad - ((Number(y[i]) - bounds.minY) / h) * Math.max(1, rect.h - pad * 2);
    return [px, py];
  };
}

function drawLabel(ctx, text, x, y, align = 'left') {
  ctx.save();
  ctx.fillStyle = '#2b2924';
  ctx.font = '600 13px Inter, ui-sans-serif, system-ui';
  ctx.textAlign = align;
  const maxWidth = Math.max(80, ctx.canvas.width / (window.devicePixelRatio || 1) - 36);
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

function drawMap(ctx, maps, labels, rect, title, pulse = 1) {
  if (!labels || labels.length !== maps.x.length) {
    ctx.save();
    ctx.fillStyle = '#fff2f2';
    ctx.strokeStyle = '#9b2335';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9b2335';
    ctx.font = '700 13px Inter, ui-sans-serif, system-ui';
    ctx.fillText('Data contract error: missing label array', rect.x + 14, rect.y + 28, rect.w - 28);
    ctx.restore();
    return;
  }
  const projector = pointProjector(maps.x, maps.y, rect);
  const radius = Math.max(1.2, Math.min(rect.w, rect.h) / 135);
  ctx.save();
  ctx.fillStyle = '#fbf7ef';
  ctx.strokeStyle = '#d9d0c2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < maps.x.length; i += 1) {
    const label = labels[i];
    const [px, py] = projector(i);
    ctx.globalAlpha = 0.72 + 0.18 * pulse;
    ctx.fillStyle = PALETTE[hashLabel(label) % PALETTE.length];
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawLabel(ctx, title, rect.x + 14, rect.y + 22);
  ctx.restore();
}

function drawDonorStrip(ctx, samples, rect, activeIndex) {
  const y = rect.y + rect.h / 2;
  const step = rect.w / Math.max(1, samples.length - 1);
  ctx.save();
  ctx.strokeStyle = '#d8d0c4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x, y);
  ctx.lineTo(rect.x + rect.w, y);
  ctx.stroke();
  samples.forEach((sample, index) => {
    const x = rect.x + index * step;
    ctx.fillStyle = index === activeIndex ? '#9b2335' : '#fbf7ef';
    ctx.strokeStyle = index === activeIndex ? '#9b2335' : '#a49a8c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, index === activeIndex ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (index === activeIndex || index === 0 || index === samples.length - 1) {
      drawLabel(ctx, shortSample(sample), x, y + 25, index === 0 ? 'left' : index === samples.length - 1 ? 'right' : 'center');
    }
  });
  ctx.restore();
}

function drawTransferPath(ctx, samples, rows, rect, tick) {
  const step = rect.w / Math.max(1, samples.length - 1);
  const y = rect.y + rect.h * 0.58;
  const active = rows.length ? rows[Math.floor(tick % rows.length)] : null;
  const sampleIndex = new Map(samples.map((sample, index) => [sample, index]));

  ctx.save();
  rows.slice(0, 132).forEach((row, idx) => {
    const src = sampleIndex.get(row.src);
    const dst = sampleIndex.get(row.dst);
    if (src === undefined || dst === undefined) return;
    const x1 = rect.x + src * step;
    const x2 = rect.x + dst * step;
    const height = 18 + Math.abs(dst - src) * 5;
    const alpha = active === row ? 0.9 : 0.08;
    ctx.strokeStyle = `rgba(47,108,158,${alpha})`;
    ctx.lineWidth = active === row ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.quadraticCurveTo((x1 + x2) / 2, y - height, x2, y);
    ctx.stroke();
    if (idx === 0) {
      drawLabel(ctx, '132 ordered transfer pairs', rect.x, rect.y + 18);
    }
  });
  if (active) {
    const value = metricValue(active, ['stability_ari', 'stability', 'ari_vs_author']);
    drawLabel(
      ctx,
      `${shortSample(active.src)} -> ${shortSample(active.dst)} ARI ${formatNumber(value)}`,
      rect.x,
      rect.y + rect.h - 12,
    );
  }
  ctx.restore();
}

function drawMetricBars(ctx, metric, rect) {
  const items = [
    ['native vs author', metric?.acc],
    ['stochastic floor', metric?.floor],
    ['map BSI', metric?.bsi],
  ];
  ctx.save();
  ctx.fillStyle = '#fbf7ef';
  ctx.strokeStyle = '#d9d0c2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
  ctx.fill();
  ctx.stroke();
  drawLabel(ctx, 'Map BSI: spatial-only share', rect.x + 14, rect.y + 23);
  items.forEach(([label, value], index) => {
    const top = rect.y + 52 + index * 44;
    const numeric = Math.max(0, Math.min(1, Number(value || 0)));
    ctx.fillStyle = '#e7ded0';
    ctx.fillRect(rect.x + 14, top, rect.w - 92, 14);
    ctx.fillStyle = index === 2 ? '#9b2335' : index === 1 ? '#2f6c9e' : '#2e6f62';
    ctx.fillRect(rect.x + 14, top, (rect.w - 92) * numeric, 14);
    ctx.fillStyle = '#2b2924';
    ctx.font = '600 12px Inter, ui-sans-serif, system-ui';
    ctx.fillText(label, rect.x + 14, top + 31);
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(value), rect.x + rect.w - 14, top + 12);
    ctx.textAlign = 'left';
  });
  ctx.restore();
}

function MovingFloorCanvas({ maps, weight, stage, transferRows, samples, reducedMotion }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const tickRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !maps) return undefined;
    const ctx = canvas.getContext('2d', { alpha: false });
    let lastWidth = 0;
    let lastHeight = 0;
    let lastDpr = 0;

    const render = (time = 0) => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.floor(bounds.width * dpr));
      const nextHeight = Math.max(1, Math.floor(bounds.height * dpr));
      if (nextWidth !== lastWidth || nextHeight !== lastHeight || dpr !== lastDpr) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        lastWidth = nextWidth;
        lastHeight = nextHeight;
        lastDpr = dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = bounds.width;
      const h = bounds.height;
      const pulse = reducedMotion ? 0 : (Math.sin(time / 650) + 1) / 2;
      tickRef.current = reducedMotion ? tickRef.current : tickRef.current + 0.08;

      ctx.fillStyle = '#f4eee4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d8d0c4';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      const key = formatWeight(weight);
      const metric = maps.metrics?.[key] || {};
      const mainLabels = maps.labels?.[`m${key}`];
      const expressionLabels = maps.labels?.[`e${key}`];
      const spatialLabels = maps.labels?.[`s${key}`];
      const floorA = maps.labels?.[`a${key}`];
      const floorB = maps.labels?.[`b${key}`];

      if (stage === 'transfer') {
        drawDonorStrip(ctx, samples, { x: 34, y: 32, w: w - 68, h: 72 }, Math.floor(tickRef.current) % Math.max(1, samples.length));
        drawTransferPath(ctx, samples, transferRows, { x: 38, y: 122, w: w - 76, h: Math.max(120, h * 0.32) }, tickRef.current);
        drawMap(ctx, maps, mainLabels, { x: 34, y: h * 0.52, w: w - 68, h: h * 0.43 }, `Representative map, w=${key}`, pulse);
      } else if (stage === 'split') {
        const gap = 18;
        const panelW = (w - 68 - gap) / 2;
        drawMap(ctx, maps, floorA, { x: 25, y: 42, w: panelW, h: h - 78 }, `floor seed A, w=${key}`, pulse);
        drawMap(ctx, maps, floorB, { x: 25 + panelW + gap, y: 42, w: panelW, h: h - 78 }, `floor seed B, w=${key}`, 1 - pulse);
      } else if (stage === 'contrast') {
        const topH = Math.max(125, h * 0.32);
        drawMetricBars(ctx, metric, { x: 28, y: 28, w: w - 56, h: topH });
        drawMap(ctx, maps, spatialLabels, { x: 28, y: topH + 48, w: (w - 74) / 2, h: h - topH - 72 }, `spatial-only labels, w=${key}`, pulse);
        drawMap(ctx, maps, expressionLabels, { x: 46 + (w - 74) / 2, y: topH + 48, w: (w - 74) / 2, h: h - topH - 72 }, `expression-only labels, w=${key}`, 1 - pulse);
      } else {
        drawDonorStrip(ctx, samples, { x: 36, y: 26, w: w - 72, h: 66 }, samples.indexOf(REPRESENTATIVE));
        drawMap(ctx, maps, mainLabels, { x: 28, y: 108, w: w - 56, h: h - 138 }, `Representative clustered map, w=${key}`, pulse);
      }

      if (stage === 'transfer' && !reducedMotion) {
        ctx.fillStyle = 'rgba(155,35,53,0.75)';
        const scan = 20 + ((time / 18) % Math.max(1, w - 40));
        ctx.fillRect(scan, 8, 2, h - 16);
      }

      if (!reducedMotion) {
        animationRef.current = requestAnimationFrame(render);
      }
    };

    render();
    if (reducedMotion) return undefined;
    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, [maps, weight, stage, transferRows, samples, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="benchmark-canvas"
      data-testid="moving-floor-canvas"
      aria-label="Real-data moving-floor benchmark animation"
    />
  );
}

class ViewerBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="viewer-fallback" role="status">
          Vitessce render failed: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function VitesscePane({ sample, seed, marker }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;
    setConfig(null);
    setError(null);
    api(`/vitessce/config?sample=${encodeURIComponent(sample)}&seed=${seed}`)
      .then((payload) => {
        const next = structuredClone(payload);
        if (marker && next.coordinationSpace?.featureSelection?.A) {
          next.coordinationSpace.featureSelection.A = [marker];
        }
        if (!ignore) setConfig(next);
      })
      .catch((exc) => {
        if (!ignore) setError(exc.message);
      });
    return () => {
      ignore = true;
    };
  }, [sample, seed, marker]);

  if (error) return <div className="viewer-fallback" role="alert">{error}</div>;
  if (!config) return <div className="viewer-fallback" role="status">Loading real Vitessce config...</div>;

  return (
    <ViewerBoundary>
      <Suspense fallback={<div className="viewer-fallback" role="status">Loading Vitessce...</div>}>
        <VitessceComponent config={config} theme="light" height={520} />
      </Suspense>
    </ViewerBoundary>
  );
}

function MissingData({ health }) {
  return (
    <main className="missing-shell">
      <section className="missing-panel">
        <AlertTriangle aria-hidden="true" />
        <h1>XTB CODEX portal data is not ready</h1>
        <p>
          The portal is source-only until real benchmark artifacts are synced from
          <code>ohsu-ec2:/data/xtb_pilot_2026-08-25</code>. No fallback or synthetic data is used.
        </p>
        <pre>./scripts/setup.sh</pre>
        <h2>Missing</h2>
        <ul>
          {(health?.missing || []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>Expected receipts</h2>
        <p className="mono">CSV SHA-256 {health?.expected?.csv_sha256}</p>
        {Object.entries(health?.expected?.rds_md5 || {}).map(([name, hash]) => (
          <p className="mono" key={name}>{name} MD5 {hash}</p>
        ))}
      </section>
    </main>
  );
}

function MetricTile({ icon: Icon, label, value, detail }) {
  return (
    <div className="metric-tile">
      <Icon aria-hidden="true" size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function TransferMatrix({ transfer }) {
  const [active, setActive] = useState(null);
  const samples = transfer?.samples || [];
  const rows = transfer?.rows || [];
  const lookup = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => map.set(`${row.src}->${row.dst}`, row));
    return map;
  }, [rows]);

  return (
    <section className="panel matrix-panel" data-testid="transfer-panel">
      <div className="panel-head">
        <div>
          <h2>Transfer Matrix</h2>
          <p>{transfer?.count || 0} ordered transfer pairs, seed {transfer?.seed ?? 0}</p>
        </div>
        <strong>{formatNumber(transfer?.mean)}</strong>
      </div>
      <div className="matrix-shell">
        <div
          className="transfer-grid"
          style={{ gridTemplateColumns: `repeat(${samples.length || 1}, minmax(24px, 1fr))` }}
        >
          {samples.map((src) =>
            samples.map((dst) => {
              const row = lookup.get(`${src}->${dst}`);
              const value = metricValue(row, ['stability_ari', 'stability', 'ari_vs_author']);
              const alpha = value === null ? 0 : Math.max(0.1, Math.min(1, value));
              const isActive = active === row;
              return (
                <button
                  key={`${src}->${dst}`}
                  type="button"
                  className={`matrix-cell ${src === dst ? 'diagonal' : ''} ${isActive ? 'active' : ''}`}
                  style={{ '--cell-alpha': alpha }}
                  disabled={src === dst || !row}
                  title={row ? `${shortSample(src)} -> ${shortSample(dst)}: ${formatNumber(value)}` : shortSample(src)}
                  aria-label={row ? `${shortSample(src)} to ${shortSample(dst)} ARI ${formatNumber(value)}` : `${shortSample(src)} diagonal`}
                  onMouseEnter={() => setActive(row)}
                  onFocus={() => setActive(row)}
                  onClick={() => setActive(row)}
                />
              );
            }),
          )}
        </div>
      </div>
      <div className="matrix-caption">
        {active ? (
          <>
            <b>{shortSample(active.src)} {'->'} {shortSample(active.dst)}</b>
            <span>stability ARI {formatNumber(metricValue(active, ['stability_ari']))}</span>
            <span>author ARI {formatNumber(metricValue(active, ['ari_vs_author']))}</span>
          </>
        ) : (
          <span>Hover or focus a cell for the real ordered donor transfer result.</span>
        )}
      </div>
    </section>
  );
}

function SweepTable({ sweep, selectedWeight, setSelectedWeight }) {
  return (
    <section className="panel sweep-panel">
      <div className="panel-head">
        <div>
          <h2>Seven Weight Sweep</h2>
          <p>Native, transfer, floor, and transfer-minus-floor summaries from results_v5.jsonl</p>
        </div>
      </div>
      <div className="sweep-header" aria-hidden="true">
        <span>weight</span>
        <span>native</span>
        <span>transfer</span>
        <span>floor</span>
        <span>t-floor</span>
      </div>
      <div className="sweep-list" role="list">
        {(sweep?.weights || []).map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sweep-row ${Number(item.frac) === Number(selectedWeight) ? 'active' : ''}`}
            onClick={() => setSelectedWeight(Number(item.frac))}
          >
            <span>w={item.key}</span>
            <span>{formatNumber(item.native_mean)}</span>
            <span>{formatNumber(item.transfer_stability_mean)}</span>
            <span>{formatNumber(item.stochastic_floor_mean)}</span>
            <span>{formatNumber(item.transfer_minus_floor)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Controls({
  weights,
  weight,
  setWeight,
  stage,
  setStage,
  seed,
  setSeed,
  autoplay,
  setAutoplay,
  reducedMotion,
}) {
  const stages = [
    ['map', 'Map'],
    ['transfer', 'Transfer'],
    ['split', 'Floor Split'],
    ['contrast', 'Contrast'],
  ];
  return (
    <div className="controls">
      <label>
        <span>Spatial weight</span>
        <select value={weight} onChange={(event) => setWeight(Number(event.target.value))}>
          {weights.map((item) => (
            <option key={item} value={item}>w={formatWeight(item)}</option>
          ))}
        </select>
      </label>
      <div className="segmented" role="group" aria-label="Animation stage">
        {stages.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={stage === key ? 'active' : ''}
            onClick={() => setStage(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="inline-controls">
        <button
          type="button"
          className="icon-button"
          aria-pressed={autoplay}
          aria-label={autoplay ? 'Pause weight sweep' : 'Play weight sweep'}
          disabled={reducedMotion}
          onClick={() => setAutoplay((value) => !value)}
        >
          {autoplay ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <label className="seed-toggle">
          <span>Seed</span>
          <select value={seed} onChange={(event) => setSeed(Number(event.target.value))}>
            <option value={0}>0</option>
            <option value={1}>1</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function App() {
  const reducedMotion = usePrefersReducedMotion();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [cohort, setCohort] = useState(null);
  const [sweep, setSweep] = useState(null);
  const [maps, setMaps] = useState(null);
  const [provenance, setProvenance] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [weight, setWeight] = useState(0.02);
  const [stage, setStage] = useState('map');
  const [seed, setSeed] = useState(0);
  const [sample, setSample] = useState(REPRESENTATIVE);
  const [marker, setMarker] = useState('CD19');
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    let ignore = false;
    api('/api/health')
      .then(async (nextHealth) => {
        if (ignore) return;
        setHealth(nextHealth);
        if (nextHealth.status !== 'ok') return;
        const [nextCohort, nextSweep, nextMaps, nextProvenance] = await Promise.all([
          api('/api/cohort'),
          api('/api/sweep'),
          api('/api/maps'),
          api('/api/provenance'),
        ]);
        if (ignore) return;
        setCohort(nextCohort);
        setSweep(nextSweep);
        setMaps(nextMaps);
        setProvenance(nextProvenance);
        setSample(nextCohort.representative_donor || REPRESENTATIVE);
        setMarker(nextCohort.markers?.[0] || 'CD19');
        setWeight(Number(nextMaps.fracs?.[0] || WEIGHT_FALLBACK[0]));
      })
      .catch((exc) => {
        if (!ignore) setError(exc.message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!health || health.status !== 'ok') return undefined;
    let ignore = false;
    api(`/api/transfer?frac=${weight}&seed=${seed}`)
      .then((payload) => {
        if (!ignore) setTransfer(payload);
      })
      .catch((exc) => {
        if (!ignore) setError(exc.message);
      });
    return () => {
      ignore = true;
    };
  }, [health, weight, seed]);

  useEffect(() => {
    if (reducedMotion) {
      setAutoplay(false);
      return undefined;
    }
    if (!autoplay || !maps) return undefined;
    const id = window.setInterval(() => {
      const weights = maps.fracs || WEIGHT_FALLBACK;
      setWeight((current) => {
        const index = weights.findIndex((item) => Number(item) === Number(current));
        return Number(weights[(index + 1 + weights.length) % weights.length]);
      });
    }, 1700);
    return () => window.clearInterval(id);
  }, [autoplay, maps, reducedMotion]);

  if (error) {
    return (
      <main className="missing-shell">
        <section className="missing-panel">
          <AlertTriangle aria-hidden="true" />
          <h1>Portal error</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!health) {
    return <main className="loading">Loading portal state...</main>;
  }

  if (health.status !== 'ok') {
    return <MissingData health={health} />;
  }

  const weights = maps?.fracs?.map(Number) || WEIGHT_FALLBACK;
  const selectedSummary = sweep?.weights?.find((item) => Number(item.frac) === Number(weight));
  const selectedMetric = selectedSummary?.map_metrics || maps?.metrics?.[formatWeight(weight)] || {};
  const counts = sweep?.counts || {};

  return (
    <main className="portal" data-ready={maps && transfer ? 'true' : 'false'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">CODEX normal bone marrow benchmark</p>
          <h1>XTB CODEX Bone-Marrow Portal</h1>
        </div>
        <div className="status-strip">
          <span><Database size={15} /> 12 donors</span>
          <span><FlaskConical size={15} /> 49 markers</span>
          <span><FileCheck2 size={15} /> real synced artifacts</span>
        </div>
      </header>

      <section className="workbench">
        <div className="animation-panel">
          <div className="panel-head">
            <div>
              <h2>Moving Floor</h2>
              <p>Representative donor {REPRESENTATIVE}; positions and labels are from maps.json</p>
            </div>
            <strong>w={formatWeight(weight)}</strong>
          </div>
          <Controls
            weights={weights}
            weight={weight}
            setWeight={setWeight}
            stage={stage}
            setStage={setStage}
            seed={seed}
            setSeed={setSeed}
            autoplay={autoplay}
            setAutoplay={setAutoplay}
            reducedMotion={reducedMotion}
          />
          <MovingFloorCanvas
            maps={maps}
            weight={weight}
            stage={stage}
            transferRows={transfer?.rows || []}
            samples={cohort?.samples || []}
            reducedMotion={reducedMotion}
          />
        </div>

        <aside className="summary-panel">
          <MetricTile
            icon={Gauge}
            label="Native vs author ARI"
            value={formatNumber(selectedMetric.acc ?? selectedSummary?.native_mean)}
            detail={`k=${selectedMetric.k ?? 'n/a'}`}
          />
          <MetricTile
            icon={RefreshCcw}
            label="Transfer stability"
            value={formatNumber(selectedSummary?.transfer_stability_mean)}
            detail={`${transfer?.count || 0} ordered pairs`}
          />
          <MetricTile
            icon={Activity}
            label="Stochastic floor"
            value={formatNumber(selectedMetric.floor ?? selectedSummary?.stochastic_floor_mean)}
            detail={`map BSI ${formatNumber(selectedMetric.bsi)}`}
          />
          <div className="summary-copy">
            <b>Data contract</b>
            <span>{counts.transfer || 0} transfer rows, {counts.native || 0} native rows, {counts.floor || 0} floor rows.</span>
            <span>Transfer-minus-floor is {formatNumber(selectedSummary?.transfer_minus_floor)} for this weight summary.</span>
            <span>Map BSI is the spatial-only share reported by export_maps.py.</span>
            <span>No cell-wise malignancy, causal signaling, clinical, or cross-tissue generalization claim is made here.</span>
          </div>
        </aside>
      </section>

      <section className="viewer-section">
        <div className="viewer-controls">
          <div>
            <h2>Vitessce Donor Viewer</h2>
            <p>Real 12,000-cell donor subsample AnnData Zarr stores generated from the synced CSV and NPZ files.</p>
          </div>
          <label>
            <span>Donor</span>
            <select value={sample} onChange={(event) => setSample(event.target.value)}>
              {(cohort?.samples || []).map((item) => (
                <option key={item} value={item}>{shortSample(item)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Marker</span>
            <select value={marker} onChange={(event) => setMarker(event.target.value)}>
              {(cohort?.markers || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="vitessce-frame" data-testid="vitessce-frame">
          <VitesscePane sample={sample} seed={seed} marker={marker} />
        </div>
      </section>

      <section className="lower-grid">
        <SweepTable sweep={sweep} selectedWeight={weight} setSelectedWeight={setWeight} />
        <TransferMatrix transfer={transfer} />
      </section>

      <section className="provenance-panel">
        <div>
          <h2>Provenance</h2>
          <p>{provenance?.source}</p>
        </div>
        <div className="receipt-grid">
          <span>CSV SHA-256</span>
          <code>{provenance?.receipts?.csv_sha256?.actual}</code>
          <span>RDS MD5 receipts</span>
          <code>
            {Object.values(provenance?.receipts?.rds_md5 || {})
              .map((item) => (item.ok ? 'ok' : 'missing'))
              .join(' / ')}
          </code>
        </div>
      </section>
    </main>
  );
}

export default App;
