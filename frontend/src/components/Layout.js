import React, { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { 
  LayoutDashboard, 
  Package, 
  Boxes, 
  ClipboardList, 
  Calculator, 
  Users, 
  Trash2, 
  Settings, 
  Menu,
  LogOut,
  Zap,
  ListChecks,
  Truck,
  Archive,
  FileText,
  FileCheck
} from 'lucide-react';

const menuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/products', icon: Package, label: 'Produtos' },
  { path: '/raw-materials', icon: Boxes, label: 'Matérias-Primas' },
  { path: '/production-orders', icon: ClipboardList, label: 'Ordens de Produção' },
  { path: '/industrial-ops', icon: FileText, label: 'OP Industrial' },
  { path: '/counting', icon: Calculator, label: 'Contagem' },
  { path: '/batches', icon: ListChecks, label: 'Gerenciar Lotes' },
  { path: '/suppliers', icon: Truck, label: 'Fornecedores' },
  { path: '/laudos', icon: FileCheck, label: 'Laudos' },
  { path: '/archives', icon: Archive, label: 'Arquivos' },
  { path: '/team', icon: Users, label: 'Equipe' },
  { path: '/trash', icon: Trash2, label: 'Lixeira' },
  { path: '/settings', icon: Settings, label: 'Configurações' },
];

const Sidebar = ({ mobile = false, onItemClick }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Lumix</h2>
            <p className="text-xs text-muted-foreground">By Vitor</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.slice(1)}`}
              onClick={onItemClick}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-smooth ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={1.5} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button
          onClick={logout}
          data-testid="logout-button"
          variant="outline"
          className="w-full justify-start"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );
};

export const Layout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col bg-card border-r border-border z-50 shadow-sm">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="mobile-menu-button"
            className="md:hidden fixed top-4 left-4 z-50"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 bg-card border-r border-border">
          <Sidebar mobile onItemClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="md:pl-64 min-h-screen">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
