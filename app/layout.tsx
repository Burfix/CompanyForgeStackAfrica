import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Founder OS — ForgeStack Africa',
  description: 'Internal operating system for running ForgeStack Africa.',
  robots: { index: false, follow: false }, // internal tool, never indexed
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
