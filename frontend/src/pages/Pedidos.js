import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
import {
  Plus, ShoppingCart, Search, Trash2, Truck, FileText, Share2,
  MessageCircle, CheckCircle2, Send, Clock, PackageCheck, X, ChevronLeft,
} from 'lucide-react';

const ORDER_UNITS = ['Kg', 'Litros', 'Fardos', 'Unidades'];

const STATUS_META = {
  pendente: { label: 'Pendente', cls: 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20', icon: Clock },
  enviado: { label: 'Enviado', cls: 'bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20', icon: Send },
  recebido: { label: 'Recebido', cls: 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20', icon: PackageCheck },
};

const fmtQty = (q) => (Number(q) === Math.trunc(Number(q)) ? String(Math.trunc(Number(q))) : String(q));
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
};

const buildShareText = (order) => {
  const lines = [];
  lines.push(`*PEDIDO DE COMPRA - ${order.order_number}*`);
  lines.push(`Fornecedor: ${order.supplier_name}`);
  lines.push(`Data: ${fmtDate(order.created_at)}`);
  lines.push('');
  lines.push('*Itens:*');
  (order.items || []).forEach((it, i) => {
    lines.push(`${i + 1}. ${it.name} — ${fmtQty(it.quantity)} ${it.unit || ''}`.trim());
  });
  if (order.observations) {
    lines.push('');
    lines.push(`*Obs:* ${order.observations}`);
  }
  lines.push('');
  lines.push(`Responsável: ${order.created_by || ''}`);
  return lines.join('\n');
};

// ====================== Novo Pedido (modal) ======================
const NewOrderDialog = ({ open, onOpenChange, onCreated }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null); // {id, name} ou {id:'', name} avulso
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [qtyMap, setQtyMap] = useState({});
  const [cart, setCart] = useState([]);
  const [observations, setObservations] = useState('');
  const [newName, setNewName] = useState('');
  const [orderUnit, setOrderUnit] = useState('Kg');
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setSupplierSearch(''); setSelectedSupplier(null); setCatalog([]);
    setQtyMap({}); setCart([]); setObservations(''); setNewName(''); setOrderUnit('Kg');
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      api.get('/suppliers').then((r) => setSuppliers(r.data)).catch(() => toast.error('Erro ao carregar fornecedores'));
    }
  }, [open, reset]);

  const loadCatalog = async (supplier) => {
    setSelectedSupplier(supplier);
    if (!supplier.id) { setCatalog([]); return; }
    setLoadingCatalog(true);
    try {
      const r = await api.get(`/suppliers/${supplier.id}/catalog`);
      setCatalog(r.data);
    } catch {
      toast.error('Erro ao carregar itens do fornecedor');
    } finally {
      setLoadingCatalog(false);
    }
  };

  const addToCart = (item) => {
    const qty = parseFloat(qtyMap[item.id]);
    if (!qty || qty <= 0) { toast.error('Informe a quantidade'); return; }
    const key = item.raw_material_id ? `rm-${item.raw_material_id}` : `c-${item.name.toLowerCase()}`;
    setCart((prev) => {
      const exists = prev.find((c) => c.key === key);
      if (exists) return prev.map((c) => (c.key === key ? { ...c, quantity: qty } : c));
      return [...prev, { key, name: item.name, unit: item.unit, quantity: qty, raw_material_id: item.raw_material_id || null }];
    });
    setQtyMap((m) => ({ ...m, [item.id]: '' }));
    toast.success(`${item.name} adicionado`);
  };

  const addNewItem = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Digite o nome do item'); return; }
    // Persiste no catálogo do fornecedor (se houver) para reaparecer da próxima vez
    if (selectedSupplier?.id) {
      try {
        const r = await api.post(`/suppliers/${selectedSupplier.id}/catalog`, { name, unit: '' });
        setCatalog((prev) => (prev.find((p) => p.id === r.data.id) ? prev : [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name))));
      } catch { /* segue mesmo assim */ }
    }
    const key = `c-${name.toLowerCase()}`;
    setCart((prev) => (prev.find((c) => c.key === key) ? prev : [...prev, { key, name, quantity: 0, raw_material_id: null }]));
    setNewName('');
    toast.success('Item adicionado — defina a quantidade no resumo');
  };

  const updateCartQty = (key, qty) => setCart((prev) => prev.map((c) => (c.key === key ? { ...c, quantity: qty } : c)));
  const removeFromCart = (key) => setCart((prev) => prev.filter((c) => c.key !== key));

  const finalize = async () => {
    if (!selectedSupplier) { toast.error('Selecione um fornecedor'); return; }
    const items = cart.filter((c) => parseFloat(c.quantity) > 0).map((c) => ({
      name: c.name, unit: orderUnit, quantity: parseFloat(c.quantity), raw_material_id: c.raw_material_id,
    }));
    if (items.length === 0) { toast.error('Adicione itens com quantidade ao pedido'); return; }
    setSubmitting(true);
    try {
      await api.post('/purchase-orders', {
        supplier_id: selectedSupplier.id || '',
        supplier_name: selectedSupplier.name,
        items,
        unit: orderUnit,
        observations,
      });
      toast.success('Pedido criado com sucesso!');
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao criar pedido');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
  const cartTotalItems = cart.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="new-order-dialog">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" /> Novo Pedido
          </DialogTitle>
        </DialogHeader>

        {/* ETAPA 1 — Fornecedor */}
        {!selectedSupplier ? (
          <div className="space-y-3">
            <Label className="text-foreground">1. Selecione o fornecedor</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                data-testid="supplier-search-input"
                placeholder="Pesquisar fornecedor..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                className="pl-9 bg-input border-border text-foreground"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {filteredSuppliers.map((s) => (
                <button
                  key={s.id}
                  data-testid={`supplier-option-${s.id}`}
                  onClick={() => loadCatalog({ id: s.id, name: s.name })}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                    {s.contact && <p className="text-xs text-muted-foreground truncate">{s.contact}</p>}
                  </div>
                </button>
              ))}
              {filteredSuppliers.length === 0 && supplierSearch && (
                <Button
                  variant="outline"
                  data-testid="supplier-avulso-button"
                  onClick={() => loadCatalog({ id: '', name: supplierSearch.trim() })}
                  className="w-full border-dashed border-border text-foreground"
                >
                  <Plus className="w-4 h-4 mr-2" /> Usar &ldquo;{supplierSearch}&rdquo; como fornecedor avulso
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Fornecedor selecionado */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 ring-1 ring-primary/15">
              <div className="flex items-center gap-3 min-w-0">
                <Truck className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate" data-testid="selected-supplier-name">{selectedSupplier.name}</p>
                  {!selectedSupplier.id && <span className="text-xs text-muted-foreground">Fornecedor avulso</span>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} data-testid="change-supplier-button">
                <ChevronLeft className="w-4 h-4 mr-1" /> Trocar
              </Button>
            </div>

            {/* Unidade de medida (única para todo o pedido) */}
            <div className="space-y-2">
              <Label className="text-foreground">Unidade de medida <span className="text-muted-foreground font-normal">(vale para todos os itens)</span></Label>
              <div className="grid grid-cols-4 gap-2">
                {ORDER_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    data-testid={`order-unit-${u}`}
                    onClick={() => setOrderUnit(u)}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${orderUnit === u ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-primary/5'}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* ETAPA 2 — Catálogo */}
            <div className="space-y-2">
              <Label className="text-foreground">2. Itens do fornecedor</Label>
              {loadingCatalog ? (
                <p className="text-sm text-muted-foreground">Carregando itens...</p>
              ) : catalog.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item salvo ainda. Adicione novos itens abaixo.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {catalog.map((item) => (
                    <div key={item.id} data-testid={`catalog-item-${item.id}`} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      </div>
                      <Input
                        type="number" min="0" step="any"
                        value={qtyMap[item.id] || ''}
                        onChange={(e) => setQtyMap((m) => ({ ...m, [item.id]: e.target.value }))}
                        placeholder="Qtd"
                        className="w-20 h-9 bg-input border-border text-foreground"
                        data-testid={`catalog-qty-${item.id}`}
                      />
                      <Button size="sm" onClick={() => addToCart(item)} className="bg-primary hover:bg-primary/90 h-9" data-testid={`catalog-add-${item.id}`}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Adicionar item novo */}
              <div className="flex gap-2 pt-2 border-t border-border/60">
                <Input
                  placeholder="+ Adicionar item novo (ex: Galão 5L)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 bg-input border-border text-foreground"
                  data-testid="new-item-name-input"
                />
                <Button onClick={addNewItem} variant="outline" className="border-border text-foreground" data-testid="add-new-item-button">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </div>

            {/* ETAPA 3 — Resumo */}
            <div className="space-y-2">
              <Label className="text-foreground">3. Resumo do pedido ({cartTotalItems})</Label>
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
              ) : (
                <div className="space-y-1.5">
                  {cart.map((c) => (
                    <div key={c.key} data-testid={`cart-item-${c.key}`} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                      <span className="flex-1 text-sm text-foreground truncate">{c.name}</span>
                      <Input
                        type="number" min="0" step="any"
                        value={c.quantity || ''}
                        onChange={(e) => updateCartQty(c.key, e.target.value)}
                        className="w-20 h-8 bg-input border-border text-foreground"
                        data-testid={`cart-qty-${c.key}`}
                      />
                      <span className="text-xs text-muted-foreground w-16 truncate">{orderUnit}</span>
                      <Button size="icon" variant="ghost" onClick={() => removeFromCart(c.key)} className="text-red-600 hover:text-red-500 h-8 w-8" data-testid={`cart-remove-${c.key}`}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-foreground">Observações (opcional)</Label>
              <Textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Ex: entregar pela manhã, condições de pagamento..."
                className="bg-input border-border text-foreground"
                rows={2}
                data-testid="order-observations-input"
              />
            </div>

            <DialogFooter>
              <Button
                onClick={finalize}
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary/90"
                data-testid="finalize-order-button"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> Finalizar Pedido
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ====================== Card de Pedido ======================
const OrderCard = ({ order, onStatus, onDelete, onPdf, onShare }) => {
  const meta = STATUS_META[order.status] || STATUS_META.pendente;
  const StatusIcon = meta.icon;
  return (
    <Card className="p-5 border shadow-sm" data-testid={`order-card-${order.id}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-foreground">{order.order_number}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cls}`}>
              <StatusIcon className="w-3 h-3" /> {meta.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{order.supplier_name} • {fmtDate(order.created_at)}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => onDelete(order)} className="text-red-600 hover:text-red-500 shrink-0" data-testid={`order-delete-${order.id}`}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-1 mb-3">
        {(order.items || []).slice(0, 5).map((it, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-foreground truncate mr-2">{it.name}</span>
            <span className="text-muted-foreground shrink-0">{fmtQty(it.quantity)} {it.unit}</span>
          </div>
        ))}
        {(order.items || []).length > 5 && (
          <p className="text-xs text-muted-foreground">+{order.items.length - 5} item(ns)</p>
        )}
      </div>

      {order.observations && (
        <p className="text-xs text-muted-foreground italic mb-3 line-clamp-2">Obs: {order.observations}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onPdf(order)} className="border-border text-foreground" data-testid={`order-pdf-${order.id}`}>
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
        <Button size="sm" onClick={() => onShare(order)} className="bg-green-600 hover:bg-green-700" data-testid={`order-share-${order.id}`}>
          <Share2 className="w-4 h-4 mr-1" /> Compartilhar
        </Button>
        {order.status === 'pendente' && (
          <Button size="sm" variant="outline" onClick={() => onStatus(order, 'enviado')} className="border-border text-foreground" data-testid={`order-mark-sent-${order.id}`}>
            <Send className="w-4 h-4 mr-1" /> Marcar Enviado
          </Button>
        )}
        {order.status !== 'recebido' && (
          <Button size="sm" variant="outline" onClick={() => onStatus(order, 'recebido')} className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-50" data-testid={`order-mark-received-${order.id}`}>
            <PackageCheck className="w-4 h-4 mr-1" /> Recebido
          </Button>
        )}
        {order.status === 'recebido' && (
          <Button size="sm" variant="ghost" onClick={() => onStatus(order, 'pendente')} className="text-muted-foreground" data-testid={`order-reopen-${order.id}`}>
            Reabrir
          </Button>
        )}
      </div>
    </Card>
  );
};

// ====================== Página Pedidos ======================
export const Pedidos = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

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
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('Erro ao gerar PDF');
    }
  };

  const handleShare = async (order) => {
    const text = buildShareText(order);
    if (navigator.share) {
      try {
        await navigator.share({ title: order.order_number, text });
        return;
      } catch { /* usuário cancelou ou indisponível -> fallback */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const pendentes = orders.filter((o) => o.status !== 'recebido');
  const recebidos = orders.filter((o) => o.status === 'recebido');

  const renderList = (list, emptyMsg, testid) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid={testid}>
      {list.map((o) => (
        <OrderCard key={o.id} order={o} onStatus={handleStatus} onDelete={setDeleteTarget} onPdf={handlePdf} onShare={handleShare} />
      ))}
      {list.length === 0 && <p className="text-muted-foreground col-span-full py-8 text-center">{emptyMsg}</p>}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="pedidos-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Pedidos</h1>
          <p className="text-lg text-muted-foreground">Pedidos de compra aos fornecedores</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/90 glow-primary" data-testid="fazer-pedido-button">
          <Plus className="w-4 h-4 mr-2" /> Fazer Pedido
        </Button>
      </div>

      <Tabs defaultValue="historico" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="historico" data-testid="tab-historico">Histórico</TabsTrigger>
          <TabsTrigger value="status" data-testid="tab-status">Pendentes / Entregues</TabsTrigger>
        </TabsList>

        <TabsContent value="historico" className="mt-5">
          {loading ? <p className="text-muted-foreground">Carregando...</p> : renderList(orders, 'Nenhum pedido realizado ainda. Clique em "Fazer Pedido".', 'historico-list')}
        </TabsContent>

        <TabsContent value="status" className="mt-5 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Pendentes ({pendentes.length})
            </h2>
            {renderList(pendentes, 'Nenhum pedido pendente.', 'pendentes-list')}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-emerald-500" /> Entregues ({recebidos.length})
            </h2>
            {renderList(recebidos, 'Nenhum pedido recebido.', 'recebidos-list')}
          </div>
        </TabsContent>
      </Tabs>

      <NewOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={fetchOrders} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="delete-order-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido {deleteTarget?.order_number} será removido permanentemente desta lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-cancel-button">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" data-testid="delete-confirm-button">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
