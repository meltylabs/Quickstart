import { whatsappLink } from "@/content/site";

type Props = {
  message?: string;
  children: React.ReactNode;
  variant?: "solid" | "outline";
  className?: string;
};

// CTAs en "caja" rectangular con borde, como la referencia.
const base = "btn-box";

const variants = {
  solid: "btn-box--solid",
  outline: "",
};

export default function WhatsAppButton({
  message,
  children,
  variant = "solid",
  className = "",
}: Props) {
  return (
    <a
      href={whatsappLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </a>
  );
}
