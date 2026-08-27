import { expect, test } from '@playwright/test';

function nonblankCanvas(locator) {
  return locator.evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (Math.abs(r - g) > 4 || Math.abs(g - b) > 4 || r < 230) {
        colored += 1;
      }
    }
    return colored;
  });
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('ResizeObserver')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.errors = errors;
});

test('portal renders real-data dashboard without empty canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'XTB CODEX Bone-Marrow Portal' })).toBeVisible();
  await page.waitForSelector('[data-ready="true"]', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Normal marrow as spatial proteomics, not a synthetic map' })).toBeVisible();
  await expect(page.getByText('CODEX spatial proteomic imaging')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Paper And Dataset Context' })).toBeVisible();
  await expect(page.getByText('10.1016/j.cell.2024.04.013', { exact: true })).toBeVisible();
  await expect(page.getByText(/normal bone-marrow CODEX-derived tabular export only/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Experiment Design' })).toBeVisible();
  await expect(page.getByText(/49 synced CODEX protein-marker intensity columns/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metric Definitions' })).toBeVisible();
  await expect(page.getByText(/Transfer stays below the same-donor floor/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'label_l1 Composition' })).toBeVisible();
  await expect(page.getByText('Myeloid').first()).toBeVisible();
  await expect(page.getByText(/Artifact\/QC labels are retained/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Marker Families' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Annotation Marker Evidence' })).toBeVisible();
  await expect(page.getByText(/protein-marker-only labels/)).not.toBeVisible();
  await expect(page.getByText(/expression-only/)).not.toBeVisible();

  const canvas = page.getByTestId('moving-floor-canvas');
  await expect(canvas).toBeVisible();
  expect(await nonblankCanvas(canvas)).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'Transfer' }).click();
  await expect(page.getByText(/132 ordered transfer pairs/)).toBeVisible();
  expect(await nonblankCanvas(canvas)).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'Floor Split' }).click();
  expect(await nonblankCanvas(canvas)).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'Contrast' }).click();
  expect(await nonblankCanvas(canvas)).toBeGreaterThan(1000);

  const response = await page.request.get('/vitessce/config?sample=SB67_NBM37_H35_CODEX_Mesmer&seed=0');
  expect(response.ok()).toBeTruthy();
  const config = await response.json();
  expect(config.datasets[0].files[0].fileType).toBe('anndata.zarr.zip');
  await expect(page.getByTestId('vitessce-frame')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(page.errors).toEqual([]);
});

test('controls update weight, seed, and transfer rows', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-ready="true"]', { timeout: 30_000 });

  await page.getByLabel('Spatial weight').selectOption('0.5');
  await expect(page.locator('.animation-panel .panel-head strong')).toHaveText('w=0.5');
  await page.getByLabel('Seed').selectOption('1');
  await expect(page.getByText(/132 ordered transfer pairs, seed 1/)).toBeVisible();

  await page.getByLabel('Play weight sweep').click();
  await expect(page.getByLabel('Pause weight sweep')).toBeVisible();
  await page.getByLabel('Pause weight sweep').click();
  await expect(page.getByLabel('Play weight sweep')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(page.errors).toEqual([]);
});
