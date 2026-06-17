import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Package, ClipboardList, Droplets, RotateCcw, Calculator, TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

// Tooltip customizado para os gráficos (definido fora do componente para evitar re-renders)
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border px-3.5 py-2.5 rounded-xl shadow-premium">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-sm font-bold text-foreground">
          {payload[0].value.toFixed(1)} <span className="text-muted-foreground font-medium">Litros</span>
        </p>
      </div>
    );
  }
  return null;
};

export const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [dailyData, setDailyData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(true);

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

  const fetchChartData = async () => {
    setChartsLoading(true);
    try {
      const [dailyRes, monthlyRes] = await Promise.all([
        api.get('/dashboard/chart/daily'),
        api.get('/dashboard/chart/monthly')
      ]);
      setDailyData(dailyRes.data);
      setMonthlyData(monthlyRes.data);
    } catch (error) {
      console.error('Error fetching chart data:', error);
    } finally {
      setChartsLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      fetchSummary();
      fetchChartData();
    });
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
      await fetchChartData();
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
      await fetchChartData();
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
      color: 'text-primary',
      bg: 'bg-primary/10',
      ring: 'ring-primary/15'
    },
    {
      label: 'Litros Envasados (Mês)',
      value: summary?.liters_bottled_month?.toFixed(1) || '0.0',
      icon: Droplets,
      color: 'text-secondary',
      bg: 'bg-secondary/10',
      ring: 'ring-secondary/15'
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Visão Geral</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhamento de produção, lotes e estoque em tempo real</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleRecalculateLiters}
            disabled={recalculating}
            variant="default"
            data-testid="recalculate-liters-btn"
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground shrink-0 rounded-xl h-10 px-4 shadow-soft"
          >
            <Calculator className="w-4 h-4 mr-2" />
            {recalculating ? 'Calculando...' : 'Recalcular Litragem'}
          </Button>
          <Button
            onClick={handleResetLiters}
            disabled={resetting}
            variant="outline"
            data-testid="reset-liters-btn"
            className="border-border text-foreground hover:bg-muted shrink-0 rounded-xl h-10 px-4"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {resetting ? 'Resetando...' : 'Resetar Litros'}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {loading ? (
          [...Array(2)].map((_, i) => (
            <Card key={i} className="p-6 rounded-2xl border border-border shadow-soft">
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
                className="p-6 rounded-2xl border border-border bg-card shadow-soft hover-lift"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      {stat.label}
                    </p>
                    <p className="text-4xl font-bold tracking-tight text-foreground">{stat.value}</p>
                  </div>
                  <div className={`w-11 h-11 rounded-xl ${stat.bg} ring-1 ${stat.ring} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} strokeWidth={2} />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Gráfico de Produção Diária */}
        <Card className="p-6 rounded-2xl border border-border shadow-soft">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 ring-1 ring-secondary/15 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-secondary" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">Produção Diária</h2>
              <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
            </div>
          </div>
          {chartsLoading ? (
            <Skeleton className="h-[300px] bg-muted" />
          ) : dailyData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              Nenhum dado de produção disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLiters" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}L`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#CBD5E1', strokeDasharray: '3 3' }} />
                <Area 
                  type="monotone" 
                  dataKey="liters" 
                  stroke="#10B981" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#colorLiters)" 
                  activeDot={{ r: 5, strokeWidth: 0, fill: '#10B981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Gráfico de Produção Mensal */}
        <Card className="p-6 rounded-2xl border border-border shadow-soft">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 ring-1 ring-primary/15 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">Produção Mensal</h2>
              <p className="text-xs text-muted-foreground">Últimos 12 meses</p>
            </div>
          </div>
          {chartsLoading ? (
            <Skeleton className="h-[300px] bg-muted" />
          ) : monthlyData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              Nenhum dado de produção disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}L`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.05)' }} />
                <Bar 
                  dataKey="liters" 
                  fill="#2563EB" 
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Resumo dos Gráficos */}
      {!chartsLoading && (dailyData.length > 0 || monthlyData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {dailyData.length > 0 && (
            <Card className="p-5 rounded-2xl border border-border bg-card shadow-soft hover-lift">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Melhor Dia (30 dias)</p>
              <p className="text-3xl font-bold text-secondary tracking-tight">
                {Math.max(...dailyData.map(d => d.liters)).toFixed(1)}<span className="text-base text-muted-foreground font-medium ml-1">L</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {dailyData.find(d => d.liters === Math.max(...dailyData.map(x => x.liters)))?.day || '-'}
              </p>
            </Card>
          )}
          
          {monthlyData.length > 0 && (
            <Card className="p-5 rounded-2xl border border-border bg-card shadow-soft hover-lift">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Melhor Mês (12 meses)</p>
              <p className="text-3xl font-bold text-primary tracking-tight">
                {Math.max(...monthlyData.map(d => d.liters)).toFixed(1)}<span className="text-base text-muted-foreground font-medium ml-1">L</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {monthlyData.find(d => d.liters === Math.max(...monthlyData.map(x => x.liters)))?.month || '-'}
              </p>
            </Card>
          )}
          
          {dailyData.length > 0 && (
            <Card className="p-5 rounded-2xl border border-border bg-card shadow-soft hover-lift">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Média Diária</p>
              <p className="text-3xl font-bold text-foreground tracking-tight">
                {(dailyData.reduce((acc, d) => acc + d.liters, 0) / dailyData.length).toFixed(1)}<span className="text-base text-muted-foreground font-medium ml-1">L</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Últimos {dailyData.length} dias com produção
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
