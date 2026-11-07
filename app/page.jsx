import Snow64Welcome from "../components/Snow64Welcome";
import Snow64ReactiveMusic from "../components/Snow64ReactiveMusic";
import Snow360TrickOverlay from "../components/Snow360TrickOverlay";
import Snow360StartupLoader from "../components/Snow360StartupLoader";
import Snow360WelcomeBrandLogo from "../components/Snow360WelcomeBrandLogo";

export const metadata = {
  title: "SNOW360 | Alien Cat Downhill Freestyle",
  description: "Ride with the plush Alien Cat in SNOW360: carving, jumps, spins and tricks on an endless snowy course.",
};

export default function HomePage() {
  return <>
    <style>{`
      /* The original Welcome screen contains two uncropped images. Hide
         those old children and portal the actual in-game logo in their place. */
      .snow360-start-logo {
        left: clamp(9px, 2vw, 22px) !important;
        top: clamp(9px, 2vw, 22px) !important;
        width: auto !important;
        height: auto !important;
        aspect-ratio: auto !important;
        transform: none !important;
        animation: none !important;
        filter: none !important;
      }
      .snow360-start-logo > img { display: none !important; }
      @media (max-width:720px),(pointer:coarse) {
        .snow360-start-logo {
          left: 9px !important;
          top: max(8px, env(safe-area-inset-top)) !important;
        }
      }
    `}</style>
    <Snow64Welcome />
    <Snow360WelcomeBrandLogo />
    <Snow64ReactiveMusic />
    <Snow360TrickOverlay />
    <Snow360StartupLoader />
  </>;
}
