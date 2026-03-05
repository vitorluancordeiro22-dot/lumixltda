import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Package, ClipboardList, Droplets, RotateCcw, Calculator, TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

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
    fetchSummary();
    fetchChartData();
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
      color: 'text-muted-foreground',
      bg: 'bg-muted'
    },
    {
      label: 'Litros Envasados (Mês)',
      value: summary?.liters_bottled_month?.toFixed(1) || '0.0',
      icon: Droplets,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
    },
  ];

  // Tooltip customizado para os gráficos
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-lg">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-sm text-emerald-600">
            {payload[0].value.toFixed(1)} Litros
          </p>
        </div>
      );
    }
    return null;
  };

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          [...Array(2)].map((_, i) => (
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Produção Diária */}
        <Card className="p-6 border shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-semibold text-foreground">Produção Diária (Últimos 30 dias)</h2>
          </div>
          {chartsLoading ? (
            <Skeleton className="h-[300px] bg-muted" />
          ) : dailyData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Nenhum dado de produção disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorLiters" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis 
                  dataKey="day" 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  tickFormatter={(value) => `${value}L`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="liters" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorLiters)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Gráfico de Produção Mensal */}
        <Card className="p-6 border shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-foreground">Produção Mensal (Últimos 12 meses)</h2>
          </div>
          {chartsLoading ? (
            <Skeleton className="h-[300px] bg-muted" />
          ) : monthlyData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Nenhum dado de produção disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  tickFormatter={(value) => `${value}L`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="liters" 
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Resumo dos Gráficos */}
      {!chartsLoading && (dailyData.length > 0 || monthlyData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Melhor dia */}
          {dailyData.length > 0 && (
            <Card className="p-4 border bg-emerald-50/50">
              <p className="text-sm text-muted-foreground mb-1">Melhor Dia (30 dias)</p>
              <p className="text-2xl font-bold text-emerald-600">
                {Math.max(...dailyData.map(d => d.liters)).toFixed(1)}L
              </p>
              <p className="text-xs text-muted-foreground">
                {dailyData.find(d => d.liters === Math.max(...dailyData.map(x => x.liters)))?.day || '-'}
              </p>
            </Card>
          )}
          
          {/* Melhor mês */}
          {monthlyData.length > 0 && (
            <Card className="p-4 border bg-blue-50/50">
              <p className="text-sm text-muted-foreground mb-1">Melhor Mês (12 meses)</p>
              <p className="text-2xl font-bold text-blue-600">
                {Math.max(...monthlyData.map(d => d.liters)).toFixed(1)}L
              </p>
              <p className="text-xs text-muted-foreground">
                {monthlyData.find(d => d.liters === Math.max(...monthlyData.map(x => x.liters)))?.month || '-'}
              </p>
            </Card>
          )}
          
          {/* Média diária */}
          {dailyData.length > 0 && (
            <Card className="p-4 border bg-purple-50/50">
              <p className="text-sm text-muted-foreground mb-1">Média Diária</p>
              <p className="text-2xl font-bold text-purple-600">
                {(dailyData.reduce((acc, d) => acc + d.liters, 0) / dailyData.length).toFixed(1)}L
              </p>
              <p className="text-xs text-muted-foreground">
                Últimos {dailyData.length} dias com produção
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
