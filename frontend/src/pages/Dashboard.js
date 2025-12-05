import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Package, ClipboardList, Droplets, RotateCcw } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';

export const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const fetchSummary = async () => {
    try {
      const response = await api.get('/dashboard/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleResetLiters = async () => {
    if (!window.confirm('Tem certeza que deseja resetar o contador de litros envasados do mês? Esta ação não pode ser desfeita.')) {
      return;
    }

    setResetting(true);
    try {
      const response = await api.post('/dashboard/reset-liters');
      toast.success(`Contador resetado! ${response.data.deleted_count} registros removidos.`);
      await fetchSummary();
    } catch (error) {
      console.error('Error resetting counter:', error);
      toast.error('Erro ao resetar contador');
    } finally {
      setResetting(false);
    }
  };

  const stats = [
    {
      label: 'Lotes em Aberto',
      value: summary?.open_batches || 0,
      icon: Package,
      color: 'text-slate-400',
      bg: 'bg-slate-800/50'
    },
    {
      label: 'Ordens em Produção',
      value: summary?.in_production_orders || 0,
      icon: ClipboardList,
      color: 'text-amber-400',
      bg: 'bg-amber-900/20'
    },
    {
      label: 'Litros Envasados (Mês)',
      value: summary?.liters_bottled_month?.toFixed(1) || '0.0',
      icon: Droplets,
      color: 'text-emerald-400',
      bg: 'bg-emerald-900/20'
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-lg text-slate-300">Visão geral da produção</p>
        </div>
        <Button
          onClick={handleResetLiters}
          disabled={resetting}
          variant="outline"
          className="border-slate-700 text-white hover:bg-slate-800"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          {resetting ? 'Resetando...' : 'Resetar Litros'}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i} className="p-6 glass-effect border-white/5">
              <Skeleton className="h-20 bg-slate-800" />
            </Card>
          ))
        ) : (
          stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={index}
                data-testid={`stat-card-${index}`}
                className="p-6 glass-effect border-white/5 hover:border-primary/50 transition-smooth"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-400 uppercase tracking-wider mb-2">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-white">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.bg}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} strokeWidth={1.5} />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Quick Info */}
      <Card className="p-6 glass-effect border-white/5">
        <h2 className="text-2xl font-semibold text-white mb-4">Bem-vindo ao Lumix</h2>
        <p className="text-slate-300 leading-relaxed">
          Sistema completo de gestão de produção industrial. Gerencie produtos, matérias-primas, 
          ordens de produção e contagens de forma eficiente e organizada.
        </p>
      </Card>
    </div>
  );
};
