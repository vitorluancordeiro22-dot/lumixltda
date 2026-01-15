import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

const AuthContext = createContext();

// Email do usuário com acesso completo ao Laboratório
const LAB_EMAIL = 'laboratoriolumix@outlook.com';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'laboratorio' ou 'producao'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedRole = localStorage.getItem('userRole');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      setRole(savedRole || 'producao');
    }
    setLoading(false);
  }, []);

  const login = async (email, password, selectedRole = 'producao') => {
    const response = await api.post('/auth/login', { email, password });
    const { token, user } = response.data;
    
    // Determina a role baseada no email e na seleção
    // Apenas o email do laboratório pode acessar o modo "Laboratório"
    let finalRole = selectedRole;
    if (selectedRole === 'laboratorio' && email.toLowerCase() !== LAB_EMAIL.toLowerCase()) {
      finalRole = 'producao'; // Força produção se não for o email autorizado
    }
    
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userRole', finalRole);
    setUser(user);
    setRole(finalRole);
    return { user, role: finalRole };
  };

  const register = async (email, password, name) => {
    const response = await api.post('/auth/register', { email, password, name });
    const { token, user } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userRole', 'producao'); // Novos usuários sempre começam como produção
    setUser(user);
    setRole('producao');
    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userRole');
    setUser(null);
    setRole(null);
    window.location.href = '/login';
  };

  // Verifica se o usuário tem acesso a determinada rota
  const hasAccess = (path) => {
    if (role === 'laboratorio') return true;
    // Rotas permitidas para produção
    const producaoRoutes = ['/counting', '/samples', '/archives', '/dashboard'];
    return producaoRoutes.some(route => path.startsWith(route));
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, register, logout, hasAccess }}>
      {children}
    </AuthContext.Provider>
  );
};
