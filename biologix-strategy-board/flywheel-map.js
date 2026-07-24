import { layout, prepare } from './flywheel-map-pretext.js';

const CANVAS_WIDTH = 2060;
const CANVAS_HEIGHT = 1260;
const MIN_SCALE = 0.42;
const MAX_SCALE = 1.8;

const stage = document.querySelector('#stage');
const board = document.querySelector('#board');
const canvas = document.querySelector('#canvas');
const zoomLevel = document.querySelector('#zoom-level');
const panHint = document.querySelector('#pan-hint');
const presentButton = document.querySelector('#present-button');
const fullscreenButton = document.querySelector('#fullscreen-button');

const view = {
  x: 0,
  y: 0,
  scale: 1,
  pointerId: null,
  pointerX: 0,
  pointerY: 0,
  moved: false
};

let fitFrame = 0;
let measureFrame = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function renderView() {
  canvas.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
  zoomLevel.value = `${Math.round(view.scale * 100)}%`;
  zoomLevel.textContent = `${Math.round(view.scale * 100)}%`;
}

function fitBoard() {
  if (window.matchMedia('(max-width: 720px)').matches) return;

  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    const width = board.clientWidth;
    const height = board.clientHeight;
    if (!width || !height) return;

    const margin = document.body.classList.contains('presentation') ? 24 : 34;
    view.scale = clamp(
      Math.min((width - margin * 2) / CANVAS_WIDTH, (height - margin * 2) / CANVAS_HEIGHT),
      MIN_SCALE,
      1.08
    );
    view.x = Math.round((width - CANVAS_WIDTH * view.scale) / 2);
    view.y = Math.round((height - CANVAS_HEIGHT * view.scale) / 2);
    renderView();
  });
}

function zoomAt(nextScale, clientX, clientY) {
  const rect = board.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const canvasX = (pointX - view.x) / view.scale;
  const canvasY = (pointY - view.y) / view.scale;

  view.scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  view.x = pointX - canvasX * view.scale;
  view.y = pointY - canvasY * view.scale;
  renderView();
  hidePanHint();
}

function zoomFromCenter(multiplier) {
  const rect = board.getBoundingClientRect();
  zoomAt(view.scale * multiplier, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function hidePanHint() {
  panHint.classList.add('hidden');
}

board.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('.node, button, [contenteditable="true"]')) return;

  view.pointerId = event.pointerId;
  view.pointerX = event.clientX;
  view.pointerY = event.clientY;
  view.moved = false;
  board.setPointerCapture(event.pointerId);
  board.classList.add('is-panning');
});

board.addEventListener('pointermove', (event) => {
  if (event.pointerId !== view.pointerId) return;

  const deltaX = event.clientX - view.pointerX;
  const deltaY = event.clientY - view.pointerY;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) view.moved = true;
  view.x += deltaX;
  view.y += deltaY;
  view.pointerX = event.clientX;
  view.pointerY = event.clientY;
  renderView();
  hidePanHint();
});

function endPan(event) {
  if (event.pointerId !== view.pointerId) return;
  if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  view.pointerId = null;
  board.classList.remove('is-panning');
}

board.addEventListener('pointerup', endPan);
board.addEventListener('pointercancel', endPan);

board.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.006);
      zoomAt(view.scale * factor, event.clientX, event.clientY);
      return;
    }

    view.x -= event.deltaX;
    view.y -= event.deltaY;
    renderView();
    hidePanHint();
  },
  { passive: false }
);

document.querySelector('#zoom-in').addEventListener('click', () => zoomFromCenter(1.15));
document.querySelector('#zoom-out').addEventListener('click', () => zoomFromCenter(1 / 1.15));
document.querySelector('#fit-board').addEventListener('click', fitBoard);

fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await stage.requestFullscreen();
    }
  } catch {
    // Fullscreen can be denied by browser policy. The board remains usable.
  }
});

document.addEventListener('fullscreenchange', () => {
  fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  window.setTimeout(fitBoard, 40);
});

presentButton.addEventListener('click', () => {
  const isPresenting = document.body.classList.toggle('presentation');
  presentButton.setAttribute('aria-pressed', String(isPresenting));
  presentButton.lastChild.nodeValue = isPresenting ? ' Exit' : ' Present';
  window.setTimeout(fitBoard, 40);
});

const focusButtons = [...document.querySelectorAll('.focus-button')];
const focusClasses = ['focus-affiliate', 'focus-customer', 'focus-community', 'focus-intelligence'];

for (const button of focusButtons) {
  button.addEventListener('click', () => {
    const focus = button.dataset.focus;
    canvas.classList.remove(...focusClasses);
    if (focus !== 'all') canvas.classList.add(`focus-${focus}`);

    for (const candidate of focusButtons) {
      const active = candidate === button;
      candidate.classList.toggle('active', active);
      candidate.setAttribute('aria-pressed', String(active));
    }
  });
}

const traceNodes = [...canvas.querySelectorAll('.node[data-node]')];
const traceEdges = [...canvas.querySelectorAll('.edge[data-edge]')];

function startTrace(nodeId) {
  if (!nodeId) return;

  const relatedIds = new Set([nodeId]);
  const relatedEdges = [];

  for (const edge of traceEdges) {
    const ids = edge.dataset.edge.split(/\s+/);
    if (!ids.includes(nodeId)) continue;
    relatedEdges.push(edge);
    ids.forEach((id) => relatedIds.add(id));
  }

  canvas.classList.add('is-tracing');
  for (const edge of relatedEdges) edge.classList.add('is-related');
  for (const node of traceNodes) {
    if (relatedIds.has(node.dataset.node)) node.classList.add('is-related');
  }
}

function stopTrace() {
  canvas.classList.remove('is-tracing');
  canvas.querySelectorAll('.is-related').forEach((element) => element.classList.remove('is-related'));
}

for (const node of traceNodes) {
  node.addEventListener('pointerenter', () => startTrace(node.dataset.node));
  node.addEventListener('pointerleave', stopTrace);
  node.addEventListener('focus', () => startTrace(node.dataset.node));
  node.addEventListener('blur', stopTrace);
}

const textElements = [...document.querySelectorAll('[data-pretext]')];
const preparedText = new Map();

function prepareTextElement(element) {
  const style = getComputedStyle(element);
  preparedText.set(element, prepare(element.textContent.trim(), style.font));
}

function measureText() {
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(() => {
    for (const element of textElements) {
      const handle = preparedText.get(element);
      if (!handle) continue;

      const style = getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const width = Math.max(20, element.clientWidth);
      const result = layout(handle, width, lineHeight);
      const nextHeight = Math.ceil(result.height);
      const currentHeight = Number.parseFloat(element.style.height || '0');
      if (Math.abs(currentHeight - nextHeight) > 0.5) {
        element.style.height = `${nextHeight}px`;
      }
    }
  });
}

async function initializeTextLayout() {
  await document.fonts.ready;

  for (const element of textElements) {
    prepareTextElement(element);
    new MutationObserver(() => {
      prepareTextElement(element);
      measureText();
    }).observe(element, {
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  measureText();
}

window.addEventListener('resize', () => {
  fitBoard();
  measureText();
});

window.addEventListener('keydown', (event) => {
  if (event.target.closest('[contenteditable="true"], input, textarea')) return;

  if (event.key === '0') {
    event.preventDefault();
    fitBoard();
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomFromCenter(1.15);
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    zoomFromCenter(1 / 1.15);
  } else if (event.key === 'Escape' && document.body.classList.contains('presentation')) {
    document.body.classList.remove('presentation');
    presentButton.setAttribute('aria-pressed', 'false');
    presentButton.lastChild.nodeValue = ' Present';
    window.setTimeout(fitBoard, 40);
  }
});

window.setTimeout(hidePanHint, 5200);
initializeTextLayout();
fitBoard();
