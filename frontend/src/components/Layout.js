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

import {
  ClipboardCheck, FlaskConical as FlaskIcon
} from 'lucide-react';

const allMenuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['laboratorio'] },
  { path: '/products', icon: Package, label: 'Produtos', roles: ['laboratorio'] },
  { path: '/raw-materials', icon: Boxes, label: 'Matérias-Primas', roles: ['laboratorio'] },
  { path: '/in-production', icon: Factory, label: 'Em Produção', roles: ['laboratorio', 'producao'], testId: 'nav-in-production' },
  { path: '/counting', icon: Calculator, label: 'Contagem', roles: ['laboratorio', 'producao'] },
  { path: '/samples', icon: FlaskConical, label: 'Amostras', roles: ['laboratorio', 'producao'] },
  { path: '/fichas-analise', icon: ClipboardCheck, label: 'Ordem de Produção', roles: ['laboratorio'], emailOnly: 'laboratoriolumix@outlook.com' },
  { path: '/ficha-analise', icon: FlaskIcon, label: 'Ficha de Análise', roles: ['laboratorio'], emailOnly: 'laboratoriolumix@outlook.com' },
  { path: '/batch-management', icon: ListChecks, label: 'Gerenciar Lotes', roles: ['laboratorio'] },
  { path: '/suppliers', icon: Truck, label: 'Fornecedores', roles: ['laboratorio'] },
  { path: '/laudos', icon: FileCheck, label: 'Pastas', roles: ['laboratorio'] },
  { path: '/archives', icon: Archive, label: 'Arquivos', roles: ['laboratorio', 'producao'] },
  { path: '/team', icon: Users, label: 'Equipe', roles: ['laboratorio'] },
  { path: '/trash', icon: Trash2, label: 'Lixeira', roles: ['laboratorio'] },
  { path: '/settings', icon: Settings, label: 'Configurações', roles: ['laboratorio'] },
];

const Sidebar = ({ mobile = false, onItemClick }) => {
  const location = useLocation();
  const { user, role, logout } = useAuth();

  // Filtra itens do menu baseado na role do usuário e email
  const menuItems = allMenuItems.filter(item => {
    if (!item.roles.includes(role || 'producao')) return false;
    if (item.emailOnly && user?.email !== item.emailOnly) return false;
    return true;
  });

  // URL da logo oficial Lumix
  const logoUrl = "https://customer-assets.emergentagent.com/job_prodman-lumix/artifacts/aod9p9yw_images.png";

  return (
    <div className="flex flex-col h-full">
      {/* Header com Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-border/60">
        <div className="flex items-center gap-3">
          <img 
            src={logoUrl} 
            alt="Lumix - Produtos de Limpeza" 
            className="h-12 w-auto object-contain"
          />
        </div>
        {/* Role Badge */}
        <div className={`mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${
          role === 'laboratorio' 
            ? 'bg-primary/10 text-primary ring-1 ring-primary/20' 
            : 'bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20'
        }`}>
          {role === 'laboratorio' ? <FlaskConical className="h-3 w-3" /> : <Factory className="h-3 w-3" />}
          {role === 'laboratorio' ? 'Laboratório' : 'Produção'}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.slice(1)}`}
              onClick={onItemClick}
              className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-primary text-primary-foreground font-semibold shadow-soft'
                  : 'text-muted-foreground font-medium hover:bg-primary/10 hover:text-primary'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary'}`} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="px-4 py-4 border-t border-border/60">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0 ring-1 ring-primary/15">
            {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          onClick={logout}
          data-testid="logout-button"
          variant="outline"
          className="w-full justify-start h-9 text-sm border-border hover:bg-muted hover:text-foreground rounded-xl"
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
        <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col bg-card border-r border-border/60 z-50">
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
