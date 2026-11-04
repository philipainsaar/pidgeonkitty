import Snow64Welcome from "../components/Snow64Welcome";
import Snow64ReactiveMusic from "../components/Snow64ReactiveMusic";
import Snow360TrickOverlay from "../components/Snow360TrickOverlay";

export const metadata = {
  title: "PidgeonKitty Snow 64 | Downhill Freestyle",
  description: "Pidgeon Kitty snowboarding arcade game with carving, jumping, spins and tricks.",
};

export default function HomePage() {
  return <>
    <Snow64Welcome />
    <Snow64ReactiveMusic />
    <Snow360TrickOverlay />
  </>;
}
