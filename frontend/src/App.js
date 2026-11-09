import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MobileProvider } from './context/MobileContext';
import { Toaster } from './components/ui/sonner';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { RawMaterials } from './pages/RawMaterials';
import { ProductionOrders } from './pages/ProductionOrders';
import { Counting } from './pages/Counting';
import { Team } from './pages/Team';
import { Trash } from './pages/Trash';
import { Settings } from './pages/Settings';
import { Batches } from './pages/Batches';
import { Suppliers } from './pages/Suppliers';
import { Archives } from './pages/Archives';
import { IndustrialOPs } from './pages/IndustrialOPs';
import { Laudos } from './pages/Laudos';
import { BatchManagement } from './pages/BatchManagement';
import { Samples } from './pages/Samples';
import { InProduction } from './pages/InProduction';
import FichasAnalise from './pages/FichasAnalise';
import FichaAnalise from './pages/FichaAnalise';
import { Pedidos } from './pages/Pedidos';
import { Notificar } from './pages/Notificar';
import { Impressao } from './pages/Impressao';
import { Estoque } from './pages/Estoque';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-foreground text-xl">Carregando...</div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" replace />;
};

// Componente para proteger rotas baseado na role
const RoleRoute = ({ children, allowedRoles }) => {
  const { role } = useAuth();

  if (allowedRoles.includes(role)) {
    return children;
  }

  // Fallback baseado na role do usuário
  const fallback = role === 'pedidos' ? '/pedidos' : '/counting';
  return <Navigate to={fallback} replace />;
};

// Redirecionamento inicial baseado na role
const HomeRedirect = () => {
  const { role } = useAuth();
  if (role === 'pedidos') return <Navigate to="/pedidos" replace />;
  if (role === 'laboratorio') return <Navigate to="/dashboard" replace />;
  return <Navigate to="/counting" replace />;
};

function App() {
  return (
    <AuthProvider>
      <MobileProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<HomeRedirect />} />
              <Route path="dashboard" element={<RoleRoute allowedRoles={['laboratorio']}><Dashboard /></RoleRoute>} />
              <Route path="products" element={<RoleRoute allowedRoles={['laboratorio']}><Products /></RoleRoute>} />
              <Route path="raw-materials" element={<RoleRoute allowedRoles={['laboratorio']}><RawMaterials /></RoleRoute>} />
              <Route path="production-orders" element={<RoleRoute allowedRoles={['laboratorio']}><ProductionOrders /></RoleRoute>} />
              <Route path="in-production" element={<InProduction />} />
              <Route path="counting" element={<RoleRoute allowedRoles={['laboratorio', 'producao']}><Counting /></RoleRoute>} />
              <Route path="samples" element={<RoleRoute allowedRoles={['laboratorio', 'producao']}><Samples /></RoleRoute>} />
              <Route path="archives" element={<RoleRoute allowedRoles={['laboratorio', 'producao']}><Archives /></RoleRoute>} />
              <Route path="batches" element={<RoleRoute allowedRoles={['laboratorio']}><Batches /></RoleRoute>} />
              <Route path="suppliers" element={<RoleRoute allowedRoles={['laboratorio']}><Suppliers /></RoleRoute>} />
              <Route path="industrial-ops" element={<RoleRoute allowedRoles={['laboratorio']}><IndustrialOPs /></RoleRoute>} />
              <Route path="laudos" element={<RoleRoute allowedRoles={['laboratorio']}><Laudos /></RoleRoute>} />
              <Route path="fichas-analise" element={<RoleRoute allowedRoles={['laboratorio']}><FichasAnalise /></RoleRoute>} />
              <Route path="ficha-analise" element={<RoleRoute allowedRoles={['laboratorio']}><FichaAnalise /></RoleRoute>} />
              <Route path="batch-management" element={<RoleRoute allowedRoles={['laboratorio']}><BatchManagement /></RoleRoute>} />
              <Route path="impressao" element={<RoleRoute allowedRoles={['laboratorio']}><Impressao /></RoleRoute>} />
              <Route path="pedidos" element={<RoleRoute allowedRoles={['laboratorio', 'pedidos']}><Pedidos /></RoleRoute>} />
              <Route path="estoque" element={<RoleRoute allowedRoles={['laboratorio', 'producao']}><Estoque /></RoleRoute>} />
              <Route path="notificar" element={<RoleRoute allowedRoles={['laboratorio', 'producao']}><Notificar /></RoleRoute>} />
              <Route path="team" element={<RoleRoute allowedRoles={['laboratorio']}><Team /></RoleRoute>} />
              <Route path="trash" element={<RoleRoute allowedRoles={['laboratorio']}><Trash /></RoleRoute>} />
              <Route path="settings" element={<RoleRoute allowedRoles={['laboratorio']}><Settings /></RoleRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" theme="dark" />
      </MobileProvider>
    </AuthProvider>
  );
}

export default App;