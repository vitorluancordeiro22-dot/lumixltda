import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { User, Zap } from 'lucide-react';

export const Settings = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Configurações</h1>
        <p className="text-lg text-muted-foreground">Gerencie suas preferências</p>
      </div>

      <Card className="p-6 border shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{user?.name}</h2>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 border shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-foreground mb-2">Sobre o Lumix</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Sistema de Gestão Inteligente de Produção desenvolvido por Vitor.
            </p>
            <p className="text-sm text-muted-foreground/70">
              Versão 1.0.0 • 2025
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
