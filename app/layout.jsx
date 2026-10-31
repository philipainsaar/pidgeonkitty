
export const metadata = {
  title: "PidgeonKitty",
  description: "Animated 3D character website",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0b1222",
          color: "#ffffff",
        }}
      >
        {children}
      </body>
    </html>
  );
}
