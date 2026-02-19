import { Sidebar } from '@/components/layout/Sidebar';
import { RefreshButton } from '@/components/ui/RefreshButton';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-end border-b border-border bg-surface px-8 py-3">
          <RefreshButton />
        </header>
        <main className="flex-1 overflow-auto bg-background p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
