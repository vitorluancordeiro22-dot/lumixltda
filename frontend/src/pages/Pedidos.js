import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { NewPurchaseOrderDialog } from '../components/NewPurchaseOrderDialog';
import { searchOrderText } from '../lib/purchaseOrderDraft';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import {
  Plus, Search, Trash2, Share2, Send, Clock, PackageCheck,
  Download, Loader2, Layers, MoreHorizontal,
} from 'lucide-react';



const STATUS_META = {
  pendente: { label: 'Pendente', cls: 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20', icon: Clock },
  enviado: { label: 'Enviado', cls: 'bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20', icon: Send },
  recebido: { label: 'Recebido', cls: 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20', icon: PackageCheck },
};

const fmtQty = (q) => (Number(q) === Math.trunc(Number(q)) ? String(Math.trunc(Number(q))) : String(q));
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
};

// ====================== Modal Lotear Matérias-Primas ======================
const LoteMateriaisDialog = ({ open, onOpenChange, order, onDone }) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entries, setEntries] = useState([]);
  const [alreadyBatched, setAlreadyBatched] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (!open || !order) return;
    setLoading(true);
    setDate(today);
    api.get(`/purchase-orders/${order.id}/lote-preview`)
      .then((r) => {
        setAlreadyBatched(!!r.data.already_batched);
        setEntries((r.data.entries || []).map((e) => ({
          ...e,
          supplier_batch_number: '',
          expiry_date: '',
        })));
      })
      .catch(() => toast.error('Erro ao carregar matérias-primas do pedido'))
      .finally(() => setLoading(false));
  }, [open, order]);

  const updateEntry = (idx, field, value) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };

  const handleSubmit = async () => {
    if (entries.length === 0) { toast.error('Nenhuma matéria-prima registrada neste pedido'); return; }
    setSubmitting(true);
    try {
      const payload = {
        date,
        entries: entries.map((e) => ({
          raw_material_id: e.raw_material_id,
          quantity: Number(e.quantity) || 0,
          supplier_batch_number: (e.supplier_batch_number || '').trim(),
          expiry_date: e.expiry_date || '',
        })),
      };
      const r = await api.post(`/purchase-orders/${order.id}/generate-batches`, payload);
      toast.success(`${r.data.count} lote(s) soltos no estoque interno!`);
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao soltar lotes');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[calc(100%-1rem)] max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Lotear Matérias-Primas
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Solta lotes novos de todas as matérias-primas registradas do pedido
          {' '}<span className="font-semibold text-foreground">{order?.order_number}</span>.
          O número do lote interno é automático — você só informa o <span className="font-semibold text-foreground">lote do fornecedor</span> e a <span className="font-semibold text-foreground">validade</span>.
        </p>

        {alreadyBatched && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 text-amber-700 text-xs font-medium px-3 py-2">
            Atenção: este pedido já foi loteado antes. Soltar novamente criará lotes adicionais.
          </div>
        )}

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">Data de recebimento</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-auto bg-input border-border" data-testid="lote-date" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
            <span className="text-muted-foreground text-sm">Carregando...</span>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Nenhuma matéria-prima registrada no sistema interno foi encontrada neste pedido.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {entries.map((e, idx) => (
              <div key={e.raw_material_id} className="rounded-xl border border-border bg-muted/30 p-3" data-testid={`lote-row-${idx}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground truncate">{e.name}</p>
                  <Badge className="bg-primary/10 text-primary text-[10px] shrink-0">Lote automático</Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Qtd ({e.unit})</Label>
                    <Input type="number" step="any" value={e.quantity} onChange={(ev) => updateEntry(idx, 'quantity', ev.target.value)} className="h-9 bg-input border-border" data-testid={`lote-qty-${idx}`} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Lote do Fornecedor</Label>
                    <Input value={e.supplier_batch_number} onChange={(ev) => updateEntry(idx, 'supplier_batch_number', ev.target.value)} placeholder="ex: RN-2024" className="h-9 bg-input border-border" data-testid={`lote-supplier-${idx}`} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Validade</Label>
                    <Input type="date" value={e.expiry_date} onChange={(ev) => updateEntry(idx, 'expiry_date', ev.target.value)} className="h-9 bg-input border-border" data-testid={`lote-expiry-${idx}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="bg-primary hover:bg-primary/90 h-10"
            disabled={submitting || loading || entries.length === 0}
            onClick={handleSubmit}
            data-testid="confirm-lotear"
          >
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Soltando...</> : <><Layers className="w-4 h-4 mr-2" /> Soltar {entries.length} Lote(s)</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ====================== Card de Pedido (Mobile Optimized) ======================
const OrderCard = ({
  order, onStatus, onDelete, onPdf, onShare, onLote,
}) => {
  const meta = STATUS_META[order.status] || STATUS_META.pendente;
  const StatusIcon = meta.icon;
  const [sharingPdf, setSharingPdf] = useState(false);

  const handleSharePdf = async () => {
    setSharingPdf(true);
    try {
      await onShare(order);
    } finally {
      setSharingPdf(false);
    }
  };

  const [expanded, setExpanded] = useState(false);
  const items = order.items || [];
  return <Card className="p-4 border shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-base font-bold">{order.order_number}</span><Badge className={`px-2 py-0.5 text-xs ${meta.cls}`}><StatusIcon className="mr-1 h-3 w-3" />{meta.label}</Badge></div>
        <p className="mt-1 break-words text-sm font-medium">{order.supplier_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{fmtDate(order.created_at)} · {items.length} itens</p>
      </div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={`Ações do pedido ${order.order_number}`}><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem className="min-h-11" onSelect={() => onPdf(order)}><Download />Baixar PDF</DropdownMenuItem>
          {order.status === 'pendente' && <DropdownMenuItem className="min-h-11" onSelect={() => onStatus(order, 'enviado')}><Send />Marcar como enviado</DropdownMenuItem>}
          {order.status !== 'recebido' ? <DropdownMenuItem className="min-h-11" onSelect={() => onStatus(order, 'recebido')}><PackageCheck />Marcar como recebido</DropdownMenuItem> : <DropdownMenuItem className="min-h-11" onSelect={() => onStatus(order, 'pendente')}><Clock />Reabrir pedido</DropdownMenuItem>}
          <DropdownMenuItem className="min-h-11" onSelect={() => onLote(order)} data-testid={`lotear-btn-${order.id}`}><Layers />Lotear MP</DropdownMenuItem>
          <DropdownMenuSeparator /><DropdownMenuItem className="min-h-11 text-red-600" onSelect={() => onDelete(order)}><Trash2 />Excluir pedido</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="space-y-2 border-t pt-3">
      {(expanded ? items : items.slice(0, 3)).map((item, index) => <div key={index} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{item.name}</span><span className="shrink-0 font-medium">{fmtQty(item.quantity)} {item.unit}</span></div>)}
      {items.length > 3 && <Button variant="ghost" className="h-11 w-full text-sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Mostrar menos' : `Ver todos os ${items.length} itens`}</Button>}
    </div>
    {order.observations && <p className="mt-3 break-words text-xs text-muted-foreground">{order.observations}</p>}
    <Button variant="outline" onClick={handleSharePdf} disabled={sharingPdf} className="mt-4 h-12 w-full">{sharingPdf ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Compartilhando…</> : <><Share2 className="mr-2 h-4 w-4" />Compartilhar pedido</>}</Button>
  </Card>;
};

// ====================== Página Pedidos ======================
export const Pedidos = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loteOrder, setLoteOrder] = useState(null);
  const [orderSearch, setOrderSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    try {
      const r = await api.get('/purchase-orders');
      setOrders(r.data);
    } catch {
      toast.error('Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatus = async (order, status) => {
    try {
      await api.put(`/purchase-orders/${order.id}/status`, { status });
      toast.success('Status atualizado');
      fetchOrders();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/purchase-orders/${deleteTarget.id}`);
      toast.success('Pedido excluído');
      setDeleteTarget(null);
      fetchOrders();
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const handlePdf = async (order) => {
    try {
      const r = await api.get(`/purchase-orders/${order.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order.order_number || 'pedido'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('PDF gerado — verifique seus downloads');
    } catch {
      toast.error('Erro ao gerar PDF');
    }
  };

  const handleShare = async (order) => {
    try {
      const r = await api.get(`/purchase-orders/${order.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const file = new File([blob], `${order.order_number || 'pedido'}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: order.order_number,
          text: `Pedido de compra - ${order.order_number}`,
        });
      } else {
        const text = encodeURIComponent(
          `Pedido de compra #${order.order_number}\nFornecedor: ${order.supplier_name}`,
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
        toast.info('Envie o PDF do pedido no WhatsApp');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        toast.error('Erro ao compartilhar PDF');
      }
    }
  };

  const filteredOrders = orders.filter((order) => searchOrderText(`${order.order_number || ''} ${order.supplier_name || ''} ${(order.items || []).map((item) => item.name).join(' ')}`).includes(searchOrderText(orderSearch)));
  const pendentes = filteredOrders.filter((o) => o.status !== 'recebido');
  const recebidos = filteredOrders.filter((o) => o.status === 'recebido');

  const renderList = (list, emptyMsg, testid) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" data-testid={testid}>
      {list.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          onStatus={handleStatus}
          onDelete={setDeleteTarget}
          onPdf={handlePdf}
          onShare={handleShare}
          onLote={setLoteOrder}
        />
      ))}
      {list.length === 0 && (
        <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
          {emptyMsg}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
            Pedidos
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Gerencie seus pedidos de compra</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-primary hover:bg-primary/90 w-full sm:w-auto h-12 text-base"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Pedido
        </Button>
      </div>

      <div className="relative"><Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar pedido" placeholder="Buscar pedido, fornecedor ou material" className="h-12 pl-10 text-base" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} /></div>
      <Tabs defaultValue="historico" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 h-12">
          <TabsTrigger value="historico" className="min-h-10 text-sm">
            Histórico
          </TabsTrigger>
          <TabsTrigger value="status" className="min-h-10 text-sm">
            Pendentes/Entregues
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historico" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <p className="text-muted-foreground">Carregando...</p>
            </div>
          ) : (
            renderList(filteredOrders, 'Nenhum pedido encontrado.', 'historico-list')
          )}
        </TabsContent>

        <TabsContent value="status" className="mt-4 space-y-6">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Pendentes (
              {pendentes.length}
              )
            </h2>
            {renderList(pendentes, 'Nenhum pedido pendente.', 'pendentes-list')}
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-emerald-500" />
              Entregues (
              {recebidos.length}
              )
            </h2>
            {renderList(recebidos, 'Nenhum pedido recebido.', 'recebidos-list')}
          </div>
        </TabsContent>
      </Tabs>

      <NewPurchaseOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={fetchOrders} />

      <LoteMateriaisDialog
        open={!!loteOrder}
        onOpenChange={(o) => !o && setLoteOrder(null)}
        order={loteOrder}
        onDone={fetchOrders}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido
              {' '}
              {deleteTarget?.order_number}
              {' '}
              será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="h-9">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 h-9"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
