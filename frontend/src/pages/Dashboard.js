import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Package, Droplets, RotateCcw, Calculator, TrendingUp, BarChart3, Activity, CalendarDays, Users, ClipboardList } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const GREEN = '#0B8F5A';
const PETROL = '#164E63';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-100 px-3.5 py-2.5 rounded-xl shadow-premium">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-sm font-bold text-slate-900">
          {payload[0].value.toFixed(1)} <span className="text-slate-400 font-medium">Litros</span>
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
  const [reportPeriod, setReportPeriod] = useState('week');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);

  const fetchReport = async (period) => {
    setReportLoading(true);
    try {
      const r = await api.get(`/reports/production?period=${period}`);
      setReport(r.data);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setReportLoading(false);
    }
  };

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

  useEffect(() => {
    fetchReport(reportPeriod);
  }, [reportPeriod]);

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

  const avgDaily = dailyData.length > 0
    ? (dailyData.reduce((acc, d) => acc + d.liters, 0) / dailyData.length)
    : 0;

  const kpis = [
    {
      label: 'Lotes em Aberto',
      value: summary?.open_batches ?? 0,
      icon: Package,
      iconCls: 'bg-primary/10 text-primary',
      hint: 'Em produção',
      hintCls: 'text-primary bg-primary/10',
    },
    {
      label: 'Litros Envasados (Mês)',
      value: summary?.liters_bottled_month?.toFixed(1) ?? '0.0',
      icon: Droplets,
      iconCls: 'bg-secondary/10 text-secondary',
      hint: 'Mês atual',
      hintCls: 'text-secondary bg-secondary/10',
    },
    {
      label: 'Média Diária',
      value: avgDaily.toFixed(1),
      icon: Activity,
      iconCls: 'bg-emerald-500/10 text-emerald-600',
      hint: `${dailyData.length} dias`,
      hintCls: 'text-emerald-600 bg-emerald-50',
    },
  ];

  return (
    <div className="space-y-7">
      {/* Header contido */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-1">Visão Geral</p>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">Produção em tempo real</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleRecalculateLiters}
            disabled={recalculating}
            data-testid="recalculate-liters-btn"
            className="bg-primary hover:bg-primary-dark text-white shrink-0 rounded-lg h-10 px-4 shadow-sm font-medium"
          >
            <Calculator className="w-4 h-4 mr-2" />
            {recalculating ? 'Calculando...' : 'Recalcular Litragem'}
          </Button>
          <Button
            onClick={handleResetLiters}
            disabled={resetting}
            variant="outline"
            data-testid="reset-liters-btn"
            className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 rounded-lg h-10 px-4 font-medium"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {resetting ? 'Resetando...' : 'Resetar Litros'}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="lumix-card p-6"><Skeleton className="h-24 bg-slate-100" /></div>
          ))
        ) : (
          kpis.map((kpi, index) => {
            const Icon = kpi.icon;
            return (
              <div key={index} data-testid={`kpi-card-${index}`} className="lumix-card p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${kpi.iconCls}`}>
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${kpi.hintCls}`}>
                    {kpi.hint}
                  </span>
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight text-slate-900">{kpi.value}</p>
                  <p className="text-sm font-medium text-slate-500 mt-0.5">{kpi.label}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Produção Diária */}
        <div className="lumix-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Produção Diária</h2>
              <p className="text-xs font-medium text-slate-400">Últimos 30 dias</p>
            </div>
          </div>
          {chartsLoading ? (
            <Skeleton className="h-[300px] bg-slate-100 rounded-xl" />
          ) : dailyData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">Nenhum dado de produção disponível</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLiters" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GREEN} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}L`} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#CBD5E1', strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="liters" stroke={GREEN} strokeWidth={2.5} fillOpacity={1} fill="url(#colorLiters)" activeDot={{ r: 5, strokeWidth: 0, fill: GREEN }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Produção Mensal */}
        <div className="lumix-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-secondary" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Produção Mensal</h2>
              <p className="text-xs font-medium text-slate-400">Últimos 12 meses</p>
            </div>
          </div>
          {chartsLoading ? (
            <Skeleton className="h-[300px] bg-slate-100 rounded-xl" />
          ) : monthlyData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">Nenhum dado de produção disponível</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PETROL} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={PETROL} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}L`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(22, 78, 99, 0.05)' }} />
                <Bar dataKey="liters" fill="url(#colorBar)" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Resumo */}
      {!chartsLoading && (dailyData.length > 0 || monthlyData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {dailyData.length > 0 && (
            <div className="lumix-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Melhor Dia (30d)</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">
                {Math.max(...dailyData.map(d => d.liters)).toFixed(1)}<span className="text-base text-slate-400 font-medium ml-1">L</span>
              </p>
              <p className="text-xs font-medium text-slate-400 mt-1">{dailyData.find(d => d.liters === Math.max(...dailyData.map(x => x.liters)))?.day || '-'}</p>
            </div>
          )}
          {monthlyData.length > 0 && (
            <div className="lumix-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-secondary" /></div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Melhor Mês (12m)</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">
                {Math.max(...monthlyData.map(d => d.liters)).toFixed(1)}<span className="text-base text-slate-400 font-medium ml-1">L</span>
              </p>
              <p className="text-xs font-medium text-slate-400 mt-1">{monthlyData.find(d => d.liters === Math.max(...monthlyData.map(x => x.liters)))?.month || '-'}</p>
            </div>
          )}
          {dailyData.length > 0 && (
            <div className="lumix-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><CalendarDays className="w-4 h-4 text-primary" /></div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Média Diária</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">
                {avgDaily.toFixed(1)}<span className="text-base text-slate-400 font-medium ml-1">L</span>
              </p>
              <p className="text-xs font-medium text-slate-400 mt-1">Últimos {dailyData.length} dias com produção</p>
            </div>
          )}
        </div>
      )}

      {/* Relatório de Envase por período */}
      <div className="lumix-card p-6" data-testid="production-report">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Relatório de Envase</h2>
              <p className="text-xs font-medium text-slate-400">O que foi feito, quanto e quem envasou</p>
            </div>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 self-start">
            {[
              { k: 'day', label: 'Diário' },
              { k: 'week', label: 'Semanal' },
              { k: 'month', label: 'Mensal' },
            ].map((p) => (
              <button
                key={p.k}
                onClick={() => setReportPeriod(p.k)}
                data-testid={`report-period-${p.k}`}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  reportPeriod === p.k ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Totais do período */}
        {report && !reportLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-secondary/5 ring-1 ring-secondary/15 p-3.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Litros</p>
              <p className="text-2xl font-bold text-slate-900">{report.total_liters?.toFixed(1)}<span className="text-sm text-slate-400 ml-1">L</span></p>
            </div>
            <div className="rounded-xl bg-primary/5 ring-1 ring-primary/15 p-3.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Kg</p>
              <p className="text-2xl font-bold text-slate-900">{report.total_kg?.toFixed(1)}<span className="text-sm text-slate-400 ml-1">Kg</span></p>
            </div>
            <div className="rounded-xl bg-emerald-500/5 ring-1 ring-emerald-500/15 p-3.5 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lotes Envasados</p>
              <p className="text-2xl font-bold text-slate-900">{report.batches_count}</p>
            </div>
          </div>
        )}

        {reportLoading ? (
          <Skeleton className="h-32 bg-slate-100 rounded-xl" />
        ) : !report || report.items.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">Nenhum envase registrado neste período.</div>
        ) : (
          <div className="space-y-2.5">
            {report.items.map((it) => (
              <div key={it.batch_id} className="rounded-xl border border-slate-100 p-3.5 hover:bg-slate-50/60 transition-all" data-testid={`report-item-${it.batch_id}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{it.product_name || 'Produto'}</p>
                    <p className="text-[11px] font-mono text-slate-400">Lote {it.batch_number}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      {it.operators_label}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {it.total.toFixed(1)}<span className="text-xs text-slate-400 ml-0.5">{it.unit}</span>
                    </span>
                  </div>
                </div>
                {it.sizes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {it.sizes.map((s) => (
                      <span key={s.label} className="text-[11px] font-semibold text-secondary bg-secondary/10 px-2 py-0.5 rounded-md">
                        {s.count} × {s.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
