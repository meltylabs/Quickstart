import "../styles/site.css";

export const metadata = {
  title: "Biologix × OVO — Operating Partnership Brief",
  description:
    "A founder-to-founder operating partnership brief prepared for Braden Lowder.",
  openGraph: {
    title: "Biologix × OVO — Operating Partnership",
    description: "A founder-to-founder brief prepared for Braden Lowder."
  }
};

export const viewport = {
  themeColor: "#f7f4ee"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex,nofollow,noarchive" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,540&family=Manrope:wght@400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
