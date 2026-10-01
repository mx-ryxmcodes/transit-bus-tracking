import './globals.css';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/components/RoleGate';
import Navbar from '@/components/Navbar';

export const metadata = { title: 'Smart Transit', description: 'Live bus tracking & fleet operations' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <SessionProvider>
          <Navbar />
          <main className="mx-auto max-w-6xl p-4">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
