import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Direction = 'ltr' | 'rtl'

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

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function App() {
  const [trains, setTrains] = useState<Train[]>([])
  const [puffs, setPuffs] = useState<Puff[]>([])
  const [count, setCount] = useState(0)
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem('wtc:muted') === '1'
  })
  const [night, setNight] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem('wtc:night') === '1'
  })
  const [hasDispatched, setHasDispatched] = useState(false)

  const stars = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 78,
        size: 6 + Math.random() * 8,
        delay: Math.random() * 4,
        duration: 2.4 + Math.random() * 3.2,
      })),
    [],
  )

  const nextIdRef = useRef(1)
  const lastDispatchRef = useRef(0)
  const lastLaneRef = useRef(-1)
  const lastDirRef = useRef<Direction>('rtl')
  const chooRef = useRef<HTMLAudioElement | null>(null)
  const mutedRef = useRef(muted)

  useEffect(() => {
    mutedRef.current = muted
    localStorage.setItem('wtc:muted', muted ? '1' : '0')
  }, [muted])

  useEffect(() => {
    localStorage.setItem('wtc:night', night ? '1' : '0')
    document.body.classList.toggle('night', night)
  }, [night])

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
      } else if (e.key === 'n' || e.key === 'N') {
        setNight((n) => !n)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return (
    <main onClick={dispatch}>
      {night && (
        <div className="night-sky" aria-hidden="true">
          <span className="moon" role="img" aria-label="moon">🌙</span>
          {stars.map((s) => (
            <span
              key={s.id}
              className="star"
              style={{
                left: `${s.left}vw`,
                top: `${s.top}vh`,
                fontSize: `${s.size}px`,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
              }}
            >
              ✦
            </span>
          ))}
        </div>
      )}

      <div className={`hero${hasDispatched ? ' dispatched' : ''}`} aria-hidden={hasDispatched}>
        <span className="train-emoji" role="img" aria-label="train">{night ? '🌃' : '🚂'}</span>
        <span className="tagline">click anywhere to dispatch a {night ? 'night ' : ''}train</span>
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

      <button
        className="night-toggle"
        onClick={(e) => {
          e.stopPropagation()
          setNight((n) => !n)
        }}
        aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
        aria-pressed={night}
      >
        {night ? '☀️' : '🌙'}
      </button>

      <div className="counter" aria-live="polite">
        {count} {count === 1 ? 'train' : 'trains'} dispatched
      </div>
    </main>
  )
}

export default App
