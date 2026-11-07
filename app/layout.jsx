import { Fredoka, Lilita_One } from "next/font/google";
import "./snow360-fonts.css";
import "./snow360-cloud-buttons.css";
import "./snow360-hud-effects.css";
import Snow360HudEffects from "../components/Snow360HudEffects";

// Fonts are optimized and self-hosted by Next.js on build.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: "700",
  display: "swap",
  variable: "--snow360-fredoka",
});

const lilita = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--snow360-lilita",
});

export const metadata = {
  title: "PidgeonKitty",
  description: "Animated 3D character website",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${lilita.variable}`}>
      <body style={{ margin: 0, background: "#0b1222", color: "#ffffff" }}>
        {children}
        <Snow360HudEffects />
      </body>
    </html>
  );
}
