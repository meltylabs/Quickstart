type Props = {
  className?: string;
};

/** Monograma circular de NIVA — crest elegante estilo editorial. */
export default function Emblem({ className = "" }: Props) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="1" />
      <circle cx="40" cy="40" r="31" stroke="currentColor" strokeWidth="0.6" opacity="0.6" />
      <text
        x="40"
        y="52"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="34"
        fontWeight="500"
        fill="currentColor"
      >
        N
      </text>
    </svg>
  );
}
