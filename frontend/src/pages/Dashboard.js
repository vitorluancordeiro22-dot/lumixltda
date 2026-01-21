import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Package, ClipboardList, Droplets, RotateCcw, Calculator } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';

export const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

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

  const handleRecalculateLiters = async () => {
    setRecalculating(true);
    try {
      const response = await api.post('/dashboard/recalculate-liters');
      toast.success(`Litragem recalculada! Total: ${response.data.total_liters.toFixed(1)}L (${response.data.from_active} ativas + ${response.data.from_archived} arquivadas)`);
      await fetchSummary();
    } catch (error) {
      console.error('Error recalculating liters:', error);
      toast.error('Erro ao recalcular litragem');
    } finally {
      setRecalculating(false);
    }
  };

  const stats = [
    {
      label: 'Lotes em Aberto',
      value: summary?.open_batches || 0,
      icon: Package,
      color: 'text-muted-foreground',
      bg: 'bg-muted'
    },
    {
      label: 'Ordens em Produção',
      value: summary?.in_production_orders || 0,
      icon: ClipboardList,
      color: 'text-amber-600',
      bg: 'bg-amber-50'
    },
    {
      label: 'Litros Envasados (Mês)',
      value: summary?.liters_bottled_month?.toFixed(1) || '0.0',
      icon: Droplets,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-lg text-muted-foreground">Visão geral da produção</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleRecalculateLiters}
            disabled={recalculating}
            variant="default"
            data-testid="recalculate-liters-btn"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            <Calculator className="w-4 h-4 mr-2" />
            {recalculating ? 'Calculando...' : 'Recalcular Litragem Mensal'}
          </Button>
          <Button
            onClick={handleResetLiters}
            disabled={resetting}
            variant="outline"
            data-testid="reset-liters-btn"
            className="border-border text-foreground hover:bg-muted shrink-0"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {resetting ? 'Resetando...' : 'Resetar Litros'}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i} className="p-6 border shadow-sm">
              <Skeleton className="h-20 bg-muted" />
            </Card>
          ))
        ) : (
          stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={index}
                data-testid={`stat-card-${index}`}
                className="p-6 border shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-foreground">{stat.value}</p>
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
      <Card className="p-6 border shadow-sm">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Bem-vindo ao Lumix</h2>
        <p className="text-muted-foreground leading-relaxed">
          Sistema completo de gestão de produção industrial. Gerencie produtos, matérias-primas, 
          ordens de produção e contagens de forma eficiente e organizada.
        </p>
      </Card>
    </div>
  );
};
