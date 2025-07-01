
import { Inter } from 'next/font/google';
import '../globals.css';
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Shared View - CodexStructure',
  description: 'Publicly shared data from CodexStructure.',
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Note: No AppProviders or main AppLayout here to keep the view minimal
    <>
      <div className="flex flex-col min-h-screen bg-muted/40">
        <main className="flex-1">
          {children}
        </main>
        <Toaster />
      </div>
    </>
  );
}
