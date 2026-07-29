"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
  /** Retraso entre palabras en ms. */
  stagger?: number;
};

/**
 * Revela un texto palabra por palabra (fade + slide) al entrar en el viewport.
 * Para los statements grandes tipo manifiesto, como en el sitio de referencia.
 */
export default function WordsReveal({ text, className = "", stagger = 45 }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const words = text.split(" ");

  return (
    <p
      ref={ref}
      className={`word-reveal ${visible ? "is-visible" : ""} ${className}`}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <span
            className="word"
            style={{ transitionDelay: `${i * stagger}ms` }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}
