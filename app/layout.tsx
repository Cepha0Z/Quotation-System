import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Interix — Quotation Studio',
  description: 'Local-first interior design quotation and BOQ workspace.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
