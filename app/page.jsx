import Snow64Welcome from "../components/Snow64Welcome";
import Snow64ReactiveMusic from "../components/Snow64ReactiveMusic";
import Snow360TrickOverlay from "../components/Snow360TrickOverlay";
import Snow360StartupLoader from "../components/Snow360StartupLoader";

export const metadata = {
  title: "SNOW360 | Alien Cat Downhill Freestyle",
  description: "Ride with the plush Alien Cat in SNOW360: carving, jumps, spins and tricks on an endless snowy course.",
};

export default function HomePage() {
  return <>
    <Snow64Welcome />
    <Snow64ReactiveMusic />
    <Snow360TrickOverlay />
    <Snow360StartupLoader />
  </>;
}
