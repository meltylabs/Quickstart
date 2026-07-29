"use client";

import { useEffect, useRef, useState, type ElementType } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Retraso en ms para escalonar (stagger) las animaciones. */
  delay?: number;
  /** Variante de animación. */
  variant?: "up" | "zoom";
  as?: ElementType;
};

/**
 * Envuelve contenido y lo revela (fade + slide/zoom) cuando entra en el viewport.
 * Replica las animaciones de scroll del sitio de referencia.
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  variant = "up",
  as,
}: Props) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);
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
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const base = variant === "zoom" ? "reveal-zoom" : "reveal";

  return (
    <Tag
      ref={ref}
      className={`${base} ${visible ? "is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
