import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Entries } from '../engine/types'

/** Controllable feed: tests set `mockOfficials` before rendering. */
let mockOfficials: Entries = {}
vi.mock('../data/loadDataset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/loadDataset')>()
  return {
    ...actual,
    loadDataset: vi.fn(async () => ({
      dataset: actual.seed,
      officials: mockOfficials,
      source: 'seed' as const,
    })),
  }
})

beforeEach(() => {
  window.localStorage.clear()
  mockOfficials = {}
  cleanup()
})

const user = userEvent.setup()

describe('guided flow — predict a group', () => {
  it('boots to Group A; entering a score updates the standings live', async () => {
    render(<App />)
    expect(await screen.findByText(/Group A/)).toBeInTheDocument()

    // Initial order is untouched — no badges, South Africa not on top.
    expect(screen.queryAllByText('tied — lots')).toHaveLength(0)

    // Give South Africa a 1-0 win over Mexico in the opener (away side up ×2).
    const up = screen.getAllByLabelText('South Africa goals up')[0]
    await user.click(up) // initializes 0–0
    await user.click(up) // 1–0 to South Africa
    const standings = screen.getByRole('table')
    const firstRow = within(standings).getAllByRole('row')[0]
    expect(firstRow).toHaveTextContent('South Africa')
    expect(firstRow).toHaveTextContent('3 pts')
  })

  it('official feed results lock the fixture and override predictions', async () => {
    mockOfficials = { 1: { official: { home: 2, away: 0 } } } // Mexico 2-0 (match 1)
    render(<App />)
    await screen.findByText(/Group A/)
    await waitFor(() => expect(screen.getByText('2–0')).toBeInTheDocument())
    expect(screen.getByText('final')).toBeInTheDocument()
    // the locked opener lost its steppers — Mexico's two other group
    // matches keep theirs (3 matches, 1 locked → 2 steppers remain)
    expect(screen.getAllByLabelText('Mexico goals up')).toHaveLength(2)
  })

  it('✨ fill-this-group fills only the empty fixtures, then disappears', async () => {
    render(<App />)
    await screen.findByText(/Group A/)

    // hand-enter the opener first: 1-0 to Mexico (home side up ×2)
    const up = screen.getAllByLabelText('Mexico goals up')[0]
    await user.click(up)
    await user.click(up)

    await user.click(screen.getByText(/Fill in this group for me/))
    // magic button gone — nothing left to fill
    expect(screen.queryByText(/Fill in this group for me/)).toBeNull()
    // the hand-entered prediction survived untouched
    const steppers = screen.getAllByLabelText('Mexico goals up')
    expect(steppers.length).toBeGreaterThan(0)
    expect(screen.getByText(/Group A/)).toBeInTheDocument()
  })

  it('persists across a reload (versioned localStorage)', async () => {
    const first = render(<App />)
    await screen.findByText(/Group A/)
    const up = screen.getAllByLabelText('South Africa goals up')[0]
    await user.click(up)
    await user.click(up)
    first.unmount()

    render(<App />)
    await screen.findByText(/Group A/)
    const firstRow = within(screen.getByRole('table')).getAllByRole('row')[0]
    expect(firstRow).toHaveTextContent('South Africa')
  })
})

describe('guided flow — knockout picks', () => {
  it('knockout cards stay locked until their feeder groups finish', async () => {
    render(<App />)
    await screen.findByText(/Group A/)
    // walk past all 12 groups to the Last 32
    for (let i = 0; i < 12; i++) await user.click(screen.getByText('Next ›'))
    expect(screen.getByText(/Last 32/)).toBeInTheDocument()
    const card = screen.getByTestId('match-73')
    expect(card).toHaveTextContent(/Waiting for/)
  })
})

describe('pick invalidation through the UI (CRITICAL path)', () => {
  it('changing an upstream group result cascades dependent picks back to TBD', async () => {
    // Seed a fully-predicted tournament with picks GER@74 → GER@89 (and FRA@77).
    const { fullGroupEntries } = await import('../test/helpers')
    const { save } = await import('../storage/persist')
    const officials = fullGroupEntries()
    const entries: Entries = {}
    for (const [id, entry] of Object.entries(officials)) {
      entries[Number(id)] = { predicted: entry.official } // editable predictions
    }
    save({ v: 1, entries, picks: { 74: 'GER', 77: 'FRA', 89: 'GER' } })

    render(<App />)
    await screen.findByText(/Group A/)

    // Sanity: Last 32 shows Germany picked to win match 74.
    for (let i = 0; i < 12; i++) await user.click(screen.getByText('Next ›'))
    expect(screen.getByTestId('match-74')).toHaveTextContent('Germany')
    expect(within(screen.getByTestId('match-74')).getByText('✓')).toBeInTheDocument()

    // Back to Group E (8 Backs): flip GER 5-0 ECU into a 0-1 Ecuador upset.
    for (let i = 0; i < 8; i++) await user.click(screen.getByText('‹ Back'))
    expect(screen.getByText(/Group E/)).toBeInTheDocument()
    const fixtureRow = [...document.querySelectorAll('.fixture')].find(
      (el) => el.textContent!.includes('Germany') && el.textContent!.includes('Ecuador'),
    )!
    const germanyDown = within(fixtureRow as HTMLElement).getByLabelText('Germany goals down')
    for (let i = 0; i < 5; i++) await user.click(germanyDown)
    await user.click(within(fixtureRow as HTMLElement).getByLabelText('Ecuador goals up'))

    // Ecuador now tops the group; Germany's match-74 pick (and its dependent
    // match-89 pick) must be gone, while France's match-77 pick survives.
    for (let i = 0; i < 8; i++) await user.click(screen.getByText('Next ›'))
    const card74 = screen.getByTestId('match-74')
    expect(card74).toHaveTextContent('Ecuador')
    expect(card74).not.toHaveTextContent('Germany')
    expect(card74).toHaveTextContent('Tap the team you think goes through')
    expect(within(screen.getByTestId('match-77')).getByText('✓')).toBeInTheDocument()
    await user.click(screen.getByText('Next ›')) // Last 16
    expect(screen.getByTestId('match-89')).toHaveTextContent(/Waiting for/)
  })
})

describe('guided flow — champion', () => {
  it('✨ play-out fills everything and crowns a champion; share-card failure is loud', async () => {
    render(<App />)
    await screen.findByText(/Group A/)
    // jump to the champion screen: 12 groups + 5 rounds
    for (let i = 0; i < 17; i++) await user.click(screen.getByText('Next ›'))
    expect(screen.getByText(/Crown your champion/)).toBeInTheDocument()

    await user.click(screen.getByText(/Play out the whole tournament for me/))
    expect(await screen.findByText('Your World Cup champion')).toBeInTheDocument()

    // T6 failure path: jsdom has no canvas — the button must fail LOUDLY.
    await user.click(screen.getByText(/Make a share card/))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't make your card/)
  })
})
