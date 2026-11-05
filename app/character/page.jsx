import CharacterViewer from "../../components/CharacterViewer";

export const metadata = {
  title: "Alien Cat | SNOW360",
  description: "Inspect the Alien Cat and all SNOW360 riding animations.",
};

export default function CharacterPage() {
  return (
    <main style={{ maxWidth: 1000, padding: "clamp(12px,3vw,32px)", margin: "0 auto" }}>
      <h1 style={{ font: "700 1.6rem system-ui, sans-serif", marginBottom: 16 }}>
        Alien Cat · SNOW360
      </h1>
      <p style={{color:"#a8bdce"}}>Drag to inspect the plush shape. Preview every riding motion and character animation below. <a href="/" style={{color:"#d5efa4"}}>Play SNOW360</a></p>
      <CharacterViewer />
    </main>
  );
}
