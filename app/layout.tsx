import "./globals.css";

export const metadata = {
  title: 'Crim Pro Notes', // Must match your Google App Name exactly
  description: 'A study and reference application for Criminal Procedure notes.', // Required clear explanation
  openGraph: {
    siteName: 'Crim Pro Notes', // Must match
  }
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

