import CharacterViewer from "../../components/CharacterViewer";

export const metadata = {
  title: "3D Character Animations",
  description: "Interactive skinned and animated GLB character viewer",
};

export default function CharacterPage() {
  return (
    <main style={{ maxWidth: 1000, padding: "clamp(12px,3vw,32px)", margin: "0 auto" }}>
      <h1 style={{ font: "700 1.6rem system-ui, sans-serif", marginBottom: 16 }}>
        3D Character
      </h1>
      <CharacterViewer />
    </main>
  );
}
