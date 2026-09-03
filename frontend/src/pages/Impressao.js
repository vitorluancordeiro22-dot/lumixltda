import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Printer, FileText, Package, Upload, Trash2, CheckCircle2, Loader2,
  FolderOpen, Search, ListChecks, FileStack,
} from 'lucide-react';

const fmtDate = (iso) => {
  if (!iso) return '-';
  const s = String(iso).split('T')[0].split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : iso;
};

const STATUS_LABEL = {
  em_aberto: { label: 'Em Aberto', cls: 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20' },
  em_producao: { label: 'Em Produção', cls: 'bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20' },
};

// ============ Pasta do Produto (templates fixos) ============
const ProductFolder = ({ product, onChanged }) => {
  const fichaRef = useRef(null);
  const opRef = useRef(null);
  const [uploadingFicha, setUploadingFicha] = useState(false);
  const [uploadingOp, setUploadingOp] = useState(false);

  const uploadFicha = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('A Ficha deve ser um arquivo .docx (retrato)');
      return;
    }
    setUploadingFicha(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/products/${product.id}/ficha-template`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Ficha (.docx) fixada na pasta!');
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar Ficha');
    } finally {
      setUploadingFicha(false);
      if (fichaRef.current) fichaRef.current.value = '';
    }
  };

  const uploadOp = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xls')) {
      toast.error('A Ordem de Produção deve ser um arquivo .xls (paisagem)');
      return;
    }
    setUploadingOp(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/products/${product.id}/op-template`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Ordem de Produção (.xls) fixada na pasta!');
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar OP');
    } finally {
      setUploadingOp(false);
      if (opRef.current) opRef.current.value = '';
    }
  };

  const removeFicha = async () => {
    try {
      await api.delete(`/products/${product.id}/ficha-template`);
      toast.success('Ficha removida da pasta');
      onChanged();
    } catch { toast.error('Erro ao remover'); }
  };

  const removeOp = async () => {
    try {
      await api.delete(`/products/${product.id}/op-template`);
      toast.success('Ordem de Produção removida da pasta');
      onChanged();
    } catch { toast.error('Erro ao remover'); }
  };

  const bothReady = product.has_ficha_template && product.has_op_template;

  return (
    <Card
      className="p-4 rounded-2xl border shadow-sm hover:shadow-md transition-all"
      data-testid={`product-folder-${product.id}`}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bothReady ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <FolderOpen className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground text-sm truncate">{product.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {bothReady ? 'Pasta completa' : 'Fixe os 2 modelos'}
          </p>
        </div>
        {bothReady && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
      </div>

      {/* FICHA — DOCX retrato */}
      <div className="rounded-xl border border-border bg-muted/30 p-2.5 mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-secondary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ficha · DOCX · Retrato</p>
            <p className="text-[11px] font-medium text-foreground truncate">
              {product.has_ficha_template ? (product.ficha_filename || 'Modelo fixado') : 'Nenhum modelo'}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2">
          <input ref={fichaRef} type="file" accept=".docx" onChange={uploadFicha} className="hidden" data-testid={`ficha-input-${product.id}`} />
          <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px] flex-1" disabled={uploadingFicha} onClick={() => fichaRef.current?.click()} data-testid={`ficha-upload-${product.id}`}>
            {uploadingFicha ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Upload className="w-3 h-3 mr-1" /> {product.has_ficha_template ? 'Trocar' : 'Fixar'}</>}
          </Button>
          {product.has_ficha_template && (
            <Button size="sm" variant="outline" className="h-7 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10" onClick={removeFicha} data-testid={`ficha-remove-${product.id}`}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* OP — XLS paisagem */}
      <div className="rounded-xl border border-border bg-muted/30 p-2.5">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ordem Produção · XLS · Paisagem</p>
            <p className="text-[11px] font-medium text-foreground truncate">
              {product.has_op_template ? (product.op_filename || 'Modelo fixado') : 'Nenhum modelo'}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2">
          <input ref={opRef} type="file" accept=".xls" onChange={uploadOp} className="hidden" data-testid={`op-input-${product.id}`} />
          <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px] flex-1" disabled={uploadingOp} onClick={() => opRef.current?.click()} data-testid={`op-upload-${product.id}`}>
            {uploadingOp ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Upload className="w-3 h-3 mr-1" /> {product.has_op_template ? 'Trocar' : 'Fixar'}</>}
          </Button>
          {product.has_op_template && (
            <Button size="sm" variant="outline" className="h-7 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10" onClick={removeOp} data-testid={`op-remove-${product.id}`}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

// ============ Modal Imprimir Ordens em Aberto ============
const BulkPrintDialog = ({ open, onOpenChange, orders }) => {
  const [selected, setSelected] = useState({});
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) {
      const all = {};
      orders.forEach((o) => { all[o.batch_id] = true; });
      setSelected(all);
    }
  }, [open, orders]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const allSelected = orders.length > 0 && selectedIds.length === orders.length;

  const toggleAll = () => {
    if (allSelected) { setSelected({}); }
    else { const all = {}; orders.forEach((o) => { all[o.batch_id] = true; }); setSelected(all); }
  };

  const handlePrint = async () => {
    if (selectedIds.length === 0) { toast.error('Selecione ao menos uma ordem'); return; }
    setPrinting(true);
    try {
      const res = await api.post('/documentation/batch-print', { batch_ids: selectedIds }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      toast.success('PDF gerado — Ficha + OP de cada ordem');
      onOpenChange(false);
    } catch (err) {
      let msg = 'Erro ao gerar PDF em lote';
      try {
        const text = await err.response?.data?.text?.();
        if (text) msg = JSON.parse(text).detail || msg;
      } catch { /* ignore */ }
      toast.error(msg);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[calc(100%-1rem)] max-w-lg rounded-2xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FileStack className="w-5 h-5 text-primary" />
            Imprimir Ordens em Aberto
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Gera um PDF único com <span className="font-semibold text-foreground">Ficha (retrato) + Ordem de Produção (paisagem)</span> de cada lote selecionado.
        </p>

        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-2 text-xs font-semibold text-primary self-start"
          data-testid="toggle-all-orders"
        >
          <ListChecks className="w-4 h-4" />
          {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
        </button>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
          {orders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma ordem em aberto.</p>
          )}
          {orders.map((o) => {
            const sm = STATUS_LABEL[o.status] || STATUS_LABEL.em_aberto;
            const isSel = !!selected[o.batch_id];
            return (
              <button
                key={o.batch_id}
                type="button"
                onClick={() => setSelected((s) => ({ ...s, [o.batch_id]: !s[o.batch_id] }))}
                data-testid={`order-check-${o.batch_id}`}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                  isSel ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${isSel ? 'bg-primary text-white' : 'border border-border'}`}>
                  {isSel && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{o.product_name || 'Produto'}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">Lote {o.batch_number} · {fmtDate(o.date)}</p>
                </div>
                <Badge className={`text-[10px] font-semibold ${sm.cls}`}>{sm.label}</Badge>
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="bg-primary hover:bg-primary/90 h-10"
            disabled={printing || selectedIds.length === 0}
            onClick={handlePrint}
            data-testid="confirm-bulk-print"
          >
            {printing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> : <><Printer className="w-4 h-4 mr-2" /> Gerar PDF ({selectedIds.length})</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============ Página Impressão ============
export const Impressao = () => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const r = await api.get('/documentation/print-center');
      setProducts(r.data.products || []);
      setOrders(r.data.open_orders || []);
    } catch {
      toast.error('Erro ao carregar central de impressão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = products.filter((p) => (p.name || '').toLowerCase().includes(search.toLowerCase()));
  const readyCount = products.filter((p) => p.has_ficha_template && p.has_op_template).length;

  return (
    <div className="space-y-5 p-3 sm:p-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-1">Central de Documentos</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Printer className="w-7 h-7 text-primary" /> Impressão
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada produto tem uma pasta com seus modelos fixos. Ao gerar documentação em qualquer lugar, o sistema usa estes arquivos automaticamente.
          </p>
        </div>
        <Button
          onClick={() => setBulkOpen(true)}
          className="bg-primary hover:bg-primary/90 h-11 shrink-0 shadow-sm"
          data-testid="bulk-print-btn"
        >
          <FileStack className="w-4 h-4 mr-2" />
          Imprimir Ordens em Aberto
          {orders.length > 0 && <Badge className="ml-2 bg-white/20 text-white">{orders.length}</Badge>}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-input text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="product-search"
          />
        </div>
        <Badge className="bg-primary/10 text-primary ring-1 ring-primary/20 h-8 px-3">
          {readyCount}/{products.length} pastas completas
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" data-testid="folders-grid">
          {filtered.map((p) => (
            <ProductFolder key={p.id} product={p} onChanged={fetchData} />
          ))}
          {filtered.length === 0 && (
            <p className="text-muted-foreground col-span-full py-12 text-center text-sm">Nenhum produto encontrado.</p>
          )}
        </div>
      )}

      <BulkPrintDialog open={bulkOpen} onOpenChange={setBulkOpen} orders={orders} />
    </div>
  );
};

export default Impressao;
