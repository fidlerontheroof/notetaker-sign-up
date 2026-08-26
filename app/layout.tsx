import "./globals.css";

export const metadata = {
  title: "Class Notes Submission",
  description: "Submit class notes for the shared notes page.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
