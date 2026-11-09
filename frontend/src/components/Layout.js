import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMobile } from '../context/MobileContext';
import api from '../lib/api';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import {
  LayoutDashboard,
  Package,
  Boxes,
  Calculator,
  Users,
  Trash2,
  Settings,
  Menu,
  LogOut,
  ListChecks,
  Truck,
  Archive,
  FileCheck,
  Smartphone,
  Monitor,
  FlaskConical,
  Factory,
  ShoppingCart,
  ClipboardCheck,
  Beaker,
  Bell,
  Search,
  Printer,
  Warehouse,
} from 'lucide-react';

const LAB_EMAIL = 'laboratoriolumix@outlook.com';
const PEDIDOS_ALLOWLIST = ['leonicelaboratorio@lumix.com', 'laboratoriolumix@outlook.com'];

const menuCategories = [
  {
    title: 'GERAL',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['laboratorio'] },
      { path: '/pedidos', icon: ShoppingCart, label: 'Pedidos', roles: ['laboratorio', 'pedidos'], emailAllowlist: PEDIDOS_ALLOWLIST },
    ],
  },
  {
    title: 'PRODUÇÃO',
    items: [
      { path: '/fichas-analise', icon: ClipboardCheck, label: 'Ordem de Produção', roles: ['laboratorio'], emailOnly: LAB_EMAIL },
      { path: '/in-production', icon: Factory, label: 'Em Produção', allAuthenticated: true },
      { path: '/batch-management', icon: ListChecks, label: 'Gerenciar Lotes', roles: ['laboratorio'] },
      { path: '/impressao', icon: Printer, label: 'Impressão', roles: ['laboratorio'] },
    ],
  },
  {
    title: 'LABORATÓRIO',
    items: [
      { path: '/ficha-analise', icon: FlaskConical, label: 'Ficha de Análise', roles: ['laboratorio'], emailOnly: LAB_EMAIL },
      { path: '/samples', icon: Beaker, label: 'Amostras', roles: ['laboratorio', 'producao'] },
    ],
  },
  {
    title: 'ESTOQUE',
    items: [
      { path: '/estoque', icon: Warehouse, label: 'Estoque', roles: ['laboratorio', 'producao'] },
      { path: '/products', icon: Package, label: 'Produtos', roles: ['laboratorio'] },
      { path: '/raw-materials', icon: Boxes, label: 'Matérias-Primas', roles: ['laboratorio'] },
      { path: '/suppliers', icon: Truck, label: 'Fornecedores', roles: ['laboratorio'] },
      { path: '/counting', icon: Calculator, label: 'Contagem', roles: ['laboratorio', 'producao'] },
    ],
  },
  {
    title: 'SISTEMA',
    items: [
      { path: '/laudos', icon: FileCheck, label: 'Pastas', roles: ['laboratorio'] },
      { path: '/archives', icon: Archive, label: 'Arquivos', roles: ['laboratorio', 'producao'] },
      { path: '/team', icon: Users, label: 'Equipe', roles: ['laboratorio'] },
      { path: '/trash', icon: Trash2, label: 'Lixeira', roles: ['laboratorio'] },
      { path: '/settings', icon: Settings, label: 'Configurações', roles: ['laboratorio'] },
    ],
  },
];

const logoUrl = 'https://customer-assets.emergentagent.com/job_prodman-lumix/artifacts/aod9p9yw_images.png';

const Sidebar = ({ onItemClick }) => {
  const location = useLocation();
  const { user, role, logout } = useAuth();

  const isVisible = (item) => {
    if (item.allAuthenticated) return Boolean(user);
    if (!item.roles.includes(role || 'producao')) return false;
    if (item.emailOnly && user?.email !== item.emailOnly) return false;
    if (item.emailAllowlist && !item.emailAllowlist.some((e) => e.toLowerCase() === (user?.email || '').toLowerCase())) return false;
    return true;
  };

  const roleMeta = role === 'laboratorio'
    ? { label: 'Laboratório', icon: FlaskConical, cls: 'bg-primary/10 text-primary ring-1 ring-primary/20' }
    : role === 'pedidos'
    ? { label: 'Pedidos', icon: ShoppingCart, cls: 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20' }
    : { label: 'Produção', icon: Factory, cls: 'bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20' };
  const RoleIcon = roleMeta.icon;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Logo */}
      <div className="h-[70px] flex items-center px-5 border-b border-slate-100 shrink-0">
        <img src={logoUrl} alt="Lumix" className="h-9 w-auto object-contain" />
      </div>

      {/* Role badge */}
      <div className="px-5 pt-4 pb-1">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${roleMeta.cls}`}>
          <RoleIcon className="h-3 w-3" /> {roleMeta.label}
        </div>
      </div>

      {/* Navigation por categorias */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {menuCategories.map((category) => {
          const visibleItems = category.items.filter(isVisible);
          if (visibleItems.length === 0) return null;
          return (
            <div key={category.title} className="mb-5">
              <p className="px-3 mb-1.5 text-[10px] font-bold tracking-[0.12em] text-slate-400">{category.title}</p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      data-testid={`nav-${item.path.slice(1)}`}
                      onClick={onItemClick}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-250 ${
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-slate-500 font-medium hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors duration-250 ${
                        isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                      }`}>
                        <Icon className="w-4 h-4" strokeWidth={2} />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0 ring-1 ring-primary/15">
            {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate">{user?.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          onClick={logout}
          data-testid="logout-button"
          variant="outline"
          className="w-full justify-start h-9 text-sm border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
        >
          <LogOut className="w-4 h-4 mr-2" /> Sair
        </Button>
      </div>
    </div>
  );
};

const TopBar = ({ onMenuClick, hideMenuOnDesktop }) => {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const [notifs, setNotifs] = useState([]);
  const [openNotif, setOpenNotif] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem('notifLastSeen') || 0));

  const fetchNotifs = useCallback(async () => {
    try { const r = await api.get('/notifications'); setNotifs(r.data); } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, 60000);
    return () => clearInterval(t);
  }, [fetchNotifs]);

  const unread = notifs.filter((n) => new Date(n.created_at).getTime() > lastSeen).length;

  const toggleNotif = () => {
    if (!openNotif) {
      const now = Date.now();
      setLastSeen(now);
      localStorage.setItem('notifLastSeen', String(now));
    }
    setOpenNotif((o) => !o);
  };

  const dismiss = async (id) => {
    try { await api.delete(`/notifications/${id}`); fetchNotifs(); } catch { /* noop */ }
  };

  const fmt = (iso) => {
    try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <header className="h-[70px] bg-white border-b border-slate-100 flex items-center justify-between gap-4 px-4 md:px-6">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Button variant="ghost" size="icon" data-testid="mobile-menu-button" onClick={onMenuClick} className={`shrink-0 ${hideMenuOnDesktop ? 'md:hidden' : ''}`}>
          <Menu className="h-5 w-5" />
        </Button>
        {/* Pesquisa (visual) */}
        <div className="relative max-w-md w-full hidden sm:block" data-testid="topbar-search">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar..."
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-slate-50 border border-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-slate-200 focus:outline-none transition-all duration-250"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <span className="hidden md:inline text-sm font-medium text-slate-500 capitalize">{today}</span>

        {/* Notificações */}
        <div className="relative">
          <button data-testid="topbar-notifications" onClick={toggleNotif} className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors duration-250">
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span data-testid="notif-badge" className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{unread}</span>
            )}
          </button>
          {openNotif && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpenNotif(false)} />
              <div data-testid="notification-panel" className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white rounded-2xl shadow-premium border border-slate-100 z-50">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800">Notificações</p>
                  <Link to="/notificar" onClick={() => setOpenNotif(false)} data-testid="notif-panel-link" className="text-xs font-semibold text-primary hover:underline">Gerenciar</Link>
                </div>
                {notifs.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">Nenhuma notificação.</p>
                ) : (
                  notifs.map((n) => (
                    <div key={n.id} className="px-4 py-3 border-b border-slate-50 flex items-start gap-2 hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{n.product_name}</p>
                        {n.message && <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">{n.created_by} • {fmt(n.created_at)}</p>
                      </div>
                      <button onClick={() => dismiss(n.id)} className="text-slate-300 hover:text-red-500 text-xs shrink-0" title="Remover">✕</button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <Link to="/settings" data-testid="topbar-settings" className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors duration-250">
          <Settings className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2.5 pl-2 md:pl-3 md:border-l md:border-slate-100">
          <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="hidden lg:block leading-tight">
            <p className="text-sm font-semibold text-slate-800 truncate max-w-[140px]">{user?.name}</p>
            <p className="text-[11px] text-slate-400 truncate max-w-[140px]">{user?.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export const Layout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { forceMobileView, toggleMobileView } = useMobile();

  const showDesktopShell = !forceMobileView;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop fixa */}
      {showDesktopShell && (
        <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 md:w-64 md:flex-col bg-white border-r border-slate-100 z-40">
          <Sidebar />
        </aside>
      )}

      {/* Sidebar mobile (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 bg-white border-r border-slate-100">
          <Sidebar onItemClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* TopBar fixa */}
      <div className={`fixed top-0 right-0 left-0 ${showDesktopShell ? 'md:left-64' : ''} z-30`}>
        <TopBar onMenuClick={() => setMobileOpen(true)} hideMenuOnDesktop={showDesktopShell} />
      </div>

      {/* Botão flutuante alternar mobile/desktop */}
      <Button
        onClick={toggleMobileView}
        variant="outline"
        size="sm"
        className="fixed bottom-6 right-4 z-50 bg-white shadow-premium border-primary/40 hover:bg-primary/5 gap-2 rounded-xl"
        title={forceMobileView ? 'Voltar para modo Desktop' : 'Usar no Celular'}
      >
        {forceMobileView ? (
          <><Monitor className="h-4 w-4" /><span className="hidden sm:inline">Modo Desktop</span></>
        ) : (
          <><Smartphone className="h-4 w-4" /><span className="hidden sm:inline">Usar no Celular</span></>
        )}
      </Button>

      {/* Conteúdo principal */}
      <main className={`${showDesktopShell ? 'md:pl-64' : ''} pt-[70px] min-h-screen`}>
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fade-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
