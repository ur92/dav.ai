import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <Topbar />
      <Sidebar />
      <main className="layout-content">{children}</main>
    </div>
  );
}

