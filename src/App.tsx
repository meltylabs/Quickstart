import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

type Direction = 'ltr' | 'rtl'
type Theme = 'day' | 'night'

type Train = {
  id: number
  emoji: string
  lane: number
  direction: Direction
  durationMs: number
  startedAt: number
}

type Puff = {
  id: number
  x: number
  y: number
  char: string
}

const TRAIN_EMOJIS = ['🚂', '🚃', '🚅', '🚋', '🚄']
const PUFF_CHARS = ['·', '°', '・', '∘']
const LANE_COUNT = 5
const DISPATCH_THROTTLE_MS = 120
const PUFF_COUNT = 4
const MIN_DURATION_MS = 4500
const MAX_DURATION_MS = 7500
const THEME_STORAGE_KEY = 'wtc:theme:v2'

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function App() {
  const [trains, setTrains] = useState<Train[]>([])
  const [puffs, setPuffs] = useState<Puff[]>([])
  const [count, setCount] = useState(0)
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof localStorage === 'undefined') return 'night'
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    return savedTheme === 'day' || savedTheme === 'night' ? savedTheme : 'night'
  })
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem('wtc:muted') === '1'
  })
  const [hasDispatched, setHasDispatched] = useState(false)

  const nextIdRef = useRef(1)
  const lastDispatchRef = useRef(0)
  const lastLaneRef = useRef(-1)
  const lastDirRef = useRef<Direction>('rtl')
  const chooRef = useRef<HTMLAudioElement | null>(null)
  const mutedRef = useRef(muted)

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'night' ? '#070914' : '#ffffff')
  }, [theme])

  useEffect(() => {
    mutedRef.current = muted
    localStorage.setItem('wtc:muted', muted ? '1' : '0')
  }, [muted])

  useEffect(() => {
    if (chooRef.current) return
    const choo = new Audio('/choo-choo.mp3')
    choo.preload = 'auto'
    chooRef.current = choo
  }, [])

  useEffect(() => {
    document.title =
      count === 0
        ? 'welcome to conductor'
        : `welcome to conductor (${count})`
  }, [count])

  const playChoo = useCallback(() => {
    if (mutedRef.current) return
    const choo = chooRef.current
    if (!choo) return
    const node = choo.cloneNode(true) as HTMLAudioElement
    node.volume = 0.28
    node.play().catch(() => {})
  }, [])

  const removeTrain = useCallback((id: number) => {
    setTrains((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const removePuff = useCallback((id: number) => {
    setPuffs((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const dispatch = useCallback(() => {
    const now = performance.now()
    if (now - lastDispatchRef.current < DISPATCH_THROTTLE_MS) return
    lastDispatchRef.current = now

    let lane = Math.floor(Math.random() * LANE_COUNT)
    if (lane === lastLaneRef.current) lane = (lane + 1) % LANE_COUNT
    lastLaneRef.current = lane

    const direction: Direction = lastDirRef.current === 'ltr' ? 'rtl' : 'ltr'
    lastDirRef.current = direction

    const durationMs = MIN_DURATION_MS + Math.random() * (MAX_DURATION_MS - MIN_DURATION_MS)
    const train: Train = {
      id: nextIdRef.current++,
      emoji: pick(TRAIN_EMOJIS),
      lane,
      direction,
      durationMs,
      startedAt: now,
    }

    setTrains((prev) => [...prev, train])
    setCount((c) => c + 1)
    setHasDispatched(true)
    playChoo()

    const y = 10 + train.lane * 16
    for (let i = 0; i < PUFF_COUNT; i++) {
      const t = (train.durationMs / (PUFF_COUNT + 1)) * (i + 1)
      setTimeout(() => {
        const elapsed = performance.now() - train.startedAt
        const progress = Math.min(elapsed / train.durationMs, 1)
        const x =
          train.direction === 'ltr' ? -15 + 130 * progress : 115 - 130 * progress
        setPuffs((prev) => [
          ...prev,
          { id: nextIdRef.current++, x, y, char: pick(PUFF_CHARS) },
        ])
      }, t)
    }
  }, [playChoo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        dispatch()
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((m) => !m)
      } else if (e.key === 't' || e.key === 'T') {
        setTheme((current) => (current === 'night' ? 'day' : 'night'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return (
    <main className={theme} onClick={dispatch}>
      <div className="night-sky" aria-hidden="true">
        <span className="moon" />
        <span className="star star-one" />
        <span className="star star-two" />
        <span className="star star-three" />
        <span className="star star-four" />
      </div>

      <div className="track-lines" aria-hidden="true">
        {Array.from({ length: LANE_COUNT }, (_, lane) => (
          <span key={lane} style={{ top: `${12 + lane * 16}vh` }} />
        ))}
      </div>

      <div className={`hero${hasDispatched ? ' dispatched' : ''}`} aria-hidden={hasDispatched}>
        <span className="train-emoji" role="img" aria-label="train">🚂</span>
        <span className="tagline">click anywhere to dispatch a train</span>
      </div>

      {trains.map((t) => (
        <span
          key={t.id}
          className={`train ${t.direction}`}
          style={{
            top: `${10 + t.lane * 16}vh`,
            animationDuration: `${t.durationMs}ms`,
          }}
          onAnimationEnd={() => removeTrain(t.id)}
        >
          {t.emoji}
        </span>
      ))}

      {puffs.map((p) => (
        <span
          key={p.id}
          className="steam"
          style={{ left: `${p.x}vw`, top: `${p.y}vh` }}
          onAnimationEnd={() => removePuff(p.id)}
        >
          {p.char}
        </span>
      ))}

      <button
        className="theme-toggle"
        onClick={(e) => {
          e.stopPropagation()
          setTheme((current) => (current === 'night' ? 'day' : 'night'))
        }}
        aria-label={theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
        aria-pressed={theme === 'night'}
        title={theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
      >
        {theme === 'night' ? '☀️' : '🌙'}
      </button>

      <button
        className="mute-toggle"
        onClick={(e) => {
          e.stopPropagation()
          setMuted((m) => !m)
        }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      <div className="counter" aria-live="polite">
        {count} {count === 1 ? 'train' : 'trains'} dispatched
      </div>
    </main>
  )
}

export default App
