import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Package, ClipboardList, Droplets } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';

export const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchSummary();
  }, []);

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
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-lg text-slate-300">Visão geral da produção</p>
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
