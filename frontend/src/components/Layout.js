import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMobile } from '../context/MobileContext';
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
  FileCheck,
  Smartphone,
  Monitor,
  FlaskConical,
  Factory
} from 'lucide-react';

const allMenuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['laboratorio'] },
  { path: '/products', icon: Package, label: 'Produtos', roles: ['laboratorio'] },
  { path: '/raw-materials', icon: Boxes, label: 'Matérias-Primas', roles: ['laboratorio'] },
  { path: '/production-orders', icon: ClipboardList, label: 'Ordens de Produção', roles: ['laboratorio'] },
  { path: '/industrial-ops', icon: FileText, label: 'OP Industrial', roles: ['laboratorio'] },
  { path: '/counting', icon: Calculator, label: 'Contagem', roles: ['laboratorio', 'producao'] },
  { path: '/samples', icon: FlaskConical, label: 'Amostras', roles: ['laboratorio', 'producao'] },
  { path: '/batch-management', icon: ListChecks, label: 'Gerenciar Lotes', roles: ['laboratorio'] },
  { path: '/suppliers', icon: Truck, label: 'Fornecedores', roles: ['laboratorio'] },
  { path: '/laudos', icon: FileCheck, label: 'Laudos', roles: ['laboratorio'] },
  { path: '/archives', icon: Archive, label: 'Arquivos', roles: ['laboratorio'] },
  { path: '/team', icon: Users, label: 'Equipe', roles: ['laboratorio'] },
  { path: '/trash', icon: Trash2, label: 'Lixeira', roles: ['laboratorio'] },
  { path: '/settings', icon: Settings, label: 'Configurações', roles: ['laboratorio'] },
];

const Sidebar = ({ mobile = false, onItemClick }) => {
  const location = useLocation();
  const { user, role, logout } = useAuth();

  // Filtra itens do menu baseado na role do usuário
  const menuItems = allMenuItems.filter(item => item.roles.includes(role || 'producao'));

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
        {/* Role Badge */}
        <div className={`mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
          role === 'laboratorio' 
            ? 'bg-primary/10 text-primary' 
            : 'bg-orange-500/10 text-orange-600'
        }`}>
          {role === 'laboratorio' ? <FlaskConical className="h-3 w-3" /> : <Factory className="h-3 w-3" />}
          {role === 'laboratorio' ? 'Laboratório' : 'Produção'}
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
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
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
  const { forceMobileView, toggleMobileView } = useMobile();

  // Se forceMobileView está ativo, escondemos a sidebar desktop e mostramos o menu mobile
  const showDesktopSidebar = !forceMobileView;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar - escondido se forceMobileView está ativo */}
      {showDesktopSidebar && (
        <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col bg-card border-r border-border z-50 shadow-sm">
          <Sidebar />
        </aside>
      )}

      {/* Mobile Sidebar - sempre disponível quando forceMobileView ou em tela pequena */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="mobile-menu-button"
            className={`${forceMobileView ? 'fixed' : 'md:hidden fixed'} top-4 left-4 z-50 bg-card shadow-md border border-border`}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 bg-card border-r border-border">
          <Sidebar mobile onItemClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Botão Flutuante - Alternar Modo Mobile/Desktop */}
      <Button
        onClick={toggleMobileView}
        variant="outline"
        size="sm"
        className="fixed bottom-20 right-4 z-50 bg-card shadow-lg border-primary/50 hover:bg-primary/10 gap-2"
        title={forceMobileView ? 'Voltar para modo Desktop' : 'Usar no Celular'}
      >
        {forceMobileView ? (
          <>
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">Modo Desktop</span>
          </>
        ) : (
          <>
            <Smartphone className="h-4 w-4" />
            <span className="hidden sm:inline">Usar no Celular</span>
          </>
        )}
      </Button>

      {/* Main Content */}
      <main className={`${showDesktopSidebar ? 'md:pl-64' : 'pl-0'} min-h-screen`}>
        <div className={`p-4 ${showDesktopSidebar ? 'md:p-8' : 'pt-16 px-4 pb-4'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};
