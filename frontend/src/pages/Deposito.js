import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Search, Camera, ClipboardList, FileUp, History, Undo2, PackageOpen, ChevronDown, ChevronUp, Warehouse, Layers,
} from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { StockBottle } from '../components/StockBottle';
import { SalesImportDialog } from '../components/SalesImportDialog';
import { PendingBatches } from '../components/PendingBatches';
import { MovementDialog } from './Estoque';
import { STOCK_SIZES, errorMessage } from '../lib/stockSizes';

const MIXED = 'misturado';
const ORIGIN = { estoque: 'Veio do Estoque', producao: 'Direto da produção', inventario: 'Inventário', venda: 'Venda GigaMob' };

const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};
const batchLabel = (n) => (!n || n === MIXED ? 'Lotes misturados' : `Lote ${n}`);

export const Deposito = () => {
  const { user, role } = useAuth();
  const isLab = role === 'laboratorio';
  const [data, setData] = useState({ products: [] });
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState([]);
  const [team, setTeam] = useState([]);
  const [view, setView] = useState('deposit'); // deposit | total
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [showZero, setShowZero] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState(null);
  const [pendingKey, setPendingKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([
        api.get('/finished-stock/deposit/overview'),
        api.get('/finished-stock/deposit/movements', { params: { limit: 60 } }),
      ]);
      setData(o.data); setMovements(m.data);
      setPendingKey((k) => k + 1);
    } catch (e) { toast.error(errorMessage(e, 'Erro ao carregar o Depósito')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    api.get('/team').then((r) => setTeam((r.data || []).filter((t) => t.active !== false))).catch(() => {});
  }, [load]);

  const amount = (s) => (view === 'total' ? s.total : s.deposit);

  const usedSizes = useMemo(() => {
    const set = new Set();
    data.products.forEach((p) => p.sizes.forEach((s) => set.add(s.size)));
    return STOCK_SIZES.filter((s) => set.has(s.size));
  }, [data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sizes.some((s) => s.barcode && s.barcode === search.trim()))
      .map((p) => ({ ...p, sizes: p.sizes.filter((s) => (!sizeFilter || s.size === sizeFilter) && (showZero || amount(s) > 0)) }))
      .filter((p) => p.sizes.length > 0);
  }, [data, search, sizeFilter, showZero, view]);

  const totalUnits = visible.reduce((a, p) => a + p.sizes.reduce((b, s) => b + amount(s), 0), 0);
  const empty = data.products.every((p) => p.sizes.every((s) => s.deposit === 0));

  // Mesmo formato do Estoque, para reaproveitar o diálogo de inventário
  const asStockShape = useMemo(() => data.products.map((p) => ({
    product_id: p.product_id, name: p.name, kind: p.kind,
    sizes: p.sizes.map((s) => ({ size: s.size, label: s.label, quantity: s.deposit, minimum: 0, low: false, lots: s.lots })),
  })), [data]);

  const onScan = useCallback(async (code) => {
    setScanOpen(false);
    try {
      const r = await api.get(`/finished-stock/barcode/${encodeURIComponent(code)}`);
      setSearch(r.data.name); setSizeFilter(r.data.size); setShowZero(true);
      setHighlight(`${r.data.product_id}:${r.data.size}`);
      toast.success(`${r.data.name} ${r.data.label}`);
    } catch (e) { toast.error(errorMessage(e, 'Código não encontrado')); }
  }, []);

  const onSearchKey = (e) => {
    if (e.key === 'Enter' && /^(\d{6,}|LX[0-9A-F]{10,11})$/i.test(search.trim())) onScan(search.trim());
  };

  const undo = async () => {
    const m = undoTarget; setUndoTarget(null);
    try {
      await api.post(`/finished-stock/deposit/movements/${m.id}/cancel`);
      toast.success('Movimentação estornada'); load();
    } catch (e) { toast.error(errorMessage(e, 'Não foi possível estornar')); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold mb-1">Depósito</h1>
          <p className="text-muted-foreground">O que está guardado no depósito, separado por tamanho</p>
        </div>
        {isLab && (
          <div className="grid grid-cols-2 sm:flex gap-2">
            <Button className="h-12 bg-primary hover:bg-primary/90" onClick={() => setSalesOpen(true)} data-testid="open-sales"><FileUp className="w-5 h-5 mr-2" /> Saída</Button>
            <Button className="h-12" variant="outline" onClick={() => setInventoryOpen(true)} data-testid="open-inventory"><ClipboardList className="w-5 h-5 mr-2" /> Inventário</Button>
          </div>
        )}
      </div>

      <PendingBatches reloadKey={pendingKey} operator={user?.name || ''} onChanged={load} />

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2" role="tablist">
          {[['deposit', 'Só o Depósito', Warehouse], ['total', 'Estoque total', Layers]].map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`view-${k}`}
                    className={`h-12 rounded-xl border-2 font-semibold flex items-center justify-center gap-2 transition ${
                      view === k ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        {view === 'total' && <p className="text-xs text-muted-foreground">Tudo o que a empresa tem: <b>Estoque + Depósito</b>.</p>}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setHighlight(null); }} onKeyDown={onSearchKey}
                   placeholder="Pesquisar produto ou código de barras" className="pl-9 h-11" />
          </div>
          <Button variant="outline" className="h-11" title="Ler código de barras" onClick={() => setScanOpen(true)}><Camera className="w-5 h-5 sm:mr-2" /><span className="hidden sm:inline">Câmera</span></Button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ size: '', label: 'Todos' }, ...usedSizes].map((s) => (
            <button key={s.size || 'all'} type="button" onClick={() => setSizeFilter(s.size)}
                    className={`px-4 h-10 rounded-full border-2 text-sm font-semibold whitespace-nowrap transition ${
                      sizeFilter === s.size ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50'}`}>
              {s.label}
            </button>
          ))}
          <button type="button" onClick={() => setShowZero(!showZero)}
                  className={`px-4 h-10 rounded-full border-2 text-sm font-semibold whitespace-nowrap transition ${showZero ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
            Mostrar zerados
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? 'produto' : 'produtos'} · {totalUnits} {totalUnits === 1 ? 'unidade' : 'unidades'}{sizeFilter ? ` de ${STOCK_SIZES.find((s) => s.size === sizeFilter)?.label}` : ''}</p>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground" data-testid="empty">
          <PackageOpen className="w-10 h-10 mx-auto mb-2" />
          {empty && view === 'deposit'
            ? <>O Depósito está vazio.{isLab ? ' Use o Inventário para lançar a contagem inicial.' : ''}<br />Tudo que sai do Estoque aparece aqui.</>
            : 'Nenhum produto encontrado.'}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const isOpen = expanded[p.product_id];
            return (
              <Card key={p.product_id} data-testid={`dep-card-${p.product_id}`} className="p-4 space-y-3">
                <h3 className="font-bold text-lg leading-tight">{p.name}</h3>
                <div className="grid grid-cols-4 gap-2">
                  {p.sizes.map((s) => (
                    <div key={s.size} data-testid={`dep-${p.product_id}-${s.size}`}
                         className={`flex flex-col items-center justify-end gap-1 rounded-xl border p-2 min-h-28 ${highlight === `${p.product_id}:${s.size}` ? 'ring-2 ring-primary' : ''}`}>
                      <StockBottle size={s.size} empty={amount(s) === 0} />
                      <span className="text-xl font-bold leading-none">{amount(s)}</span>
                      <span className="text-xs font-semibold text-muted-foreground leading-none">{s.label}</span>
                      {view === 'total' && <span className="text-[10px] text-muted-foreground leading-none text-center">Est. {s.stock} · Dep. {s.deposit}</span>}
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded({ ...expanded, [p.product_id]: !isOpen })}>
                  Lotes do Depósito {isOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                </Button>
                {isOpen && (
                  <div className="text-xs space-y-1 border-t pt-2">
                    {p.sizes.every((s) => s.lots.length === 0) && <p className="text-muted-foreground">Sem unidades no Depósito.</p>}
                    {p.sizes.map((s) => s.lots.map((l) => (
                      <div key={`${s.size}-${l.batch_number}`} className="flex justify-between">
                        <span>{s.label} · {batchLabel(l.batch_number)}</span><b>{l.quantity}</b>
                      </div>
                    )))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4">
        <button type="button" className="w-full flex items-center justify-between font-bold" onClick={() => setShowHistory(!showHistory)}>
          <span className="flex items-center gap-2"><History className="w-5 h-5" /> Últimas movimentações</span>
          {showHistory ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {showHistory && (
          <div className="mt-3 divide-y">
            {movements.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhuma movimentação ainda.</p>}
            {movements.map((m) => (
              <div key={m.id} className={`flex items-center justify-between gap-2 py-2 text-sm ${m.cancelled ? 'opacity-50 line-through' : ''}`}>
                <div className="min-w-0">
                  <p className="truncate">
                    <span className={m.type === 'saida' ? 'text-orange-600 font-semibold' : 'text-primary font-semibold'}>{m.type === 'saida' ? '▲ Saída' : '▼ Entrada'}</span>{' '}
                    {m.quantity}× {m.product_name} {m.size_label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ORIGIN[m.origin] || m.origin} · {batchLabel(m.batch_number)} · {m.operator} · {fmtDateTime(m.created_at)}{m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
                {isLab && !m.cancelled && m.type === 'entrada' && m.origin !== 'estoque' && (
                  <Button size="sm" variant="ghost" title="Estornar" onClick={() => setUndoTarget(m)}><Undo2 className="w-4 h-4" /></Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <MovementDialog mode="inventario" open={inventoryOpen} onOpenChange={setInventoryOpen} products={asStockShape} team={team}
                      defaultOperator={user?.name || ''} initial={null} onDone={load}
                      entriesPath="/finished-stock/deposit/entries" title="Inventário do Depósito"
                      hint="Conte o que está no Depósito e lance aqui. Não tem limite da Contagem e o lote é opcional." />
      {isLab && <SalesImportDialog open={salesOpen} onOpenChange={setSalesOpen} products={data.products} onDone={load} />}
      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScan} />

      <AlertDialog open={Boolean(undoTarget)} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar movimentação?</AlertDialogTitle>
            <AlertDialogDescription>
              {undoTarget && `${undoTarget.quantity}× ${undoTarget.product_name} ${undoTarget.size_label} saem do Depósito, como se não tivessem entrado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={undo} className="bg-primary">Estornar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Deposito;
