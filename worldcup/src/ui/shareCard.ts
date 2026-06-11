/**
 * shareCard — canvas-rendered PNG of the crowned champion (the one share
 * moment: zero social infrastructure, design doc Premise 1).
 *
 * Failure handling is the point (eng review critical gap T6): canvas/toBlob
 * can fail silently on some browsers — every step here throws on failure so
 * the caller can show a visible error instead of a dead button.
 */
import type { Dataset, Team } from '../engine/types'
import type { Bracket } from '../engine/knockout'

export async function renderShareCard(
  dataset: Dataset,
  bracket: Bracket,
  champion: Team,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350 // 4:5 portrait — Instagram-friendly
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')

  // backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height)
  bg.addColorStop(0, '#0b1d33')
  bg.addColorStop(1, '#10395c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#9fb8d0'
  ctx.font = '48px system-ui, sans-serif'
  ctx.fillText('MY WORLD CUP 2026', canvas.width / 2, 140)

  ctx.font = '280px system-ui, sans-serif'
  ctx.fillText(champion.flag, canvas.width / 2, 560)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 96px system-ui, sans-serif'
  ctx.fillText(champion.name, canvas.width / 2, 740)

  ctx.fillStyle = '#ffd75e'
  ctx.font = '64px system-ui, sans-serif'
  ctx.fillText('🏆 CHAMPION 🏆', canvas.width / 2, 850)

  // the run to the title, bottom-up
  const teamOf = new Map(dataset.teams.map((t) => [t.id, t]))
  const path = [...bracket.nodes.values()]
    .filter((n) => n.winner === champion.id)
    .sort((a, b) => a.fixture.id - b.fixture.id)
  ctx.fillStyle = '#c7d8e8'
  ctx.font = '40px system-ui, sans-serif'
  path.slice(-5).forEach((node, i) => {
    const opponent = node.home === champion.id ? node.away : node.home
    const name = opponent ? (teamOf.get(opponent)?.name ?? opponent) : '—'
    ctx.fillText(`beat ${name}`, canvas.width / 2, 980 + i * 60)
  })

  ctx.fillStyle = '#5d7a94'
  ctx.font = '36px system-ui, sans-serif'
  ctx.fillText('predicted with the What-If Machine', canvas.width / 2, 1300)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('canvas toBlob returned null')
  return blob
}

export async function downloadShareCard(
  dataset: Dataset,
  bracket: Bracket,
  champion: Team,
): Promise<void> {
  const blob = await renderShareCard(dataset, bracket, champion)
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = `my-world-cup-${champion.id.toLowerCase()}.png`
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
