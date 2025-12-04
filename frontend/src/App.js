import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import './App.css';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="raw-materials" element={<RawMaterials />} />
            <Route path="production-orders" element={<ProductionOrders />} />
            <Route path="counting" element={<Counting />} />
            <Route path="team" element={<Team />} />
            <Route path="trash" element={<Trash />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" theme="dark" />
    </AuthProvider>
  );
}

export default App;
