import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentLens',
  description: 'Copilot agent governance and observability',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
