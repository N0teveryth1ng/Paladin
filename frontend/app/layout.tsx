import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import '@xyflow/react/dist/style.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Paladin — architecture canvas',
  description: 'Design systems with an AI assistant on an infinite canvas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`}>
      <body className="h-full bg-[#0A0A0A] font-sans text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
