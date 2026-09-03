import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
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
  Plus, ShoppingCart, Search, Trash2, Truck, Share2,
  CheckCircle2, Send, Clock, PackageCheck, X, ChevronLeft,
  Download, Loader2, ArrowRight, Building2, Edit2,
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

// ====================== Modal Novo Fornecedor ======================
const AddSupplierDialog = ({ open, onOpenChange, onCreated }) => {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Digite o nome do fornecedor');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/suppliers', {
        name: name.trim(),
        contact: contact.trim(),
        email: email.trim(),
      });
      toast.success('Fornecedor adicionado com sucesso!');
      setName('');
      setContact('');
      setEmail('');
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao adicionar fornecedor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[calc(100vw-1rem)] max-w-md max-h-[calc(100dvh-1rem)] overflow-x-hidden overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Novo Fornecedor
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground">Nome *</Label>
            <Input
              placeholder="Ex: Distribuidora XYZ"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="bg-input border-border text-foreground h-11 text-base sm:text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Contato (opcional)</Label>
            <Input
              placeholder="Ex: (11) 98765-4321"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              disabled={submitting}
              className="bg-input border-border text-foreground h-11 text-base sm:text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">E-mail (opcional)</Label>
            <Input
              type="email"
              placeholder="Ex: contato@distribuidora.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="bg-input border-border text-foreground h-11 text-base sm:text-sm"
            />
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="border-border text-foreground flex-1 h-11"
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:flex-1 bg-primary hover:bg-primary/90 h-11"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ====================== Componente: Carrinho de Itens ======================
const CartPreview = ({ cart, orderUnit, onRemove, onUpdateQty, showDeleteButtons = false }) => {
  if (cart.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Nenhum item adicionado.</p>;
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-2 border border-border/30 rounded-lg p-3 bg-muted/30">
      {cart.map((c) => (
        <div
          key={c.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2 rounded-lg bg-card border border-border/50 hover:bg-muted/50 transition-all group"
        >
          <span className="flex-1 text-sm text-foreground truncate font-medium">{c.name}</span>
          <div className="grid grid-cols-[4.5rem_3.25rem_2.75rem] items-center gap-1.5">
            <Input
              type="number"
              min="0"
              step="any"
              value={c.quantity || ''}
              onChange={(e) => onUpdateQty(c.key, e.target.value)}
              inputMode="decimal"
              className="w-full h-11 bg-input border-border text-foreground text-base sm:text-sm"
            />
            <span className="text-sm text-muted-foreground text-right truncate">{orderUnit}</span>
            {showDeleteButtons && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(c.key)}
                className="text-red-600 hover:text-red-500 hover:bg-red-50 h-11 w-11 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                title="Remover item"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            {!showDeleteButtons && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(c.key)}
                className="text-red-600 hover:text-red-500 hover:bg-red-50 h-11 w-11"
                title="Remover item"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ====================== Novo Pedido (modal) ======================
const NewOrderDialog = ({ open, onOpenChange, onCreated, orderToEdit = null }) => {
  const [step, setStep] = useState('suppliers'); // suppliers, items, summary
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [qtyMap, setQtyMap] = useState({});
  const [cart, setCart] = useState([]);
  const [observations, setObservations] = useState('');
  const [newName, setNewName] = useState('');
  const [orderUnit, setOrderUnit] = useState('Kg');
  const [submitting, setSubmitting] = useState(false);

  const loadSuppliers = useCallback(async () => {
    try {
      const r = await api.get('/suppliers');
      setSuppliers(r.data);
    } catch {
      toast.error('Erro ao carregar fornecedores');
    }
  }, []);

  const reset = useCallback(() => {
    setStep('suppliers');
    setSupplierSearch('');
    setSelectedSupplier(null);
    setCatalog([]);
    setQtyMap({});
    setCart([]);
    setObservations('');
    setNewName('');
    setOrderUnit('Kg');
  }, []);

  const loadCatalog = useCallback(async (supplierId) => {
    if (!supplierId) {
      setCatalog([]);
      return;
    }
    setLoadingCatalog(true);
    try {
      const r = await api.get(`/suppliers/${supplierId}/catalog`);
      setCatalog(r.data);
    } catch {
      toast.error('Erro ao carregar itens do fornecedor');
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      loadSuppliers();
      if (orderToEdit) {
        const supplier = {
          id: orderToEdit.supplier_id || '',
          name: orderToEdit.supplier_name || 'Fornecedor',
        };
        setSelectedSupplier(supplier);
        setOrderUnit(orderToEdit.unit || orderToEdit.items?.[0]?.unit || 'Kg');
        setObservations(orderToEdit.observations || '');
        setCart((orderToEdit.items || []).map((item) => ({
          key: item.raw_material_id
            ? `rm-${item.raw_material_id}`
            : `c-${item.name.toLowerCase()}`,
          name: item.name,
          unit: item.unit || orderToEdit.unit || 'Kg',
          quantity: Number(item.quantity) || 0,
          raw_material_id: item.raw_material_id || null,
        })));
        setStep('items');
        loadCatalog(supplier.id);
      }
    }
  }, [open, orderToEdit, reset, loadSuppliers, loadCatalog]);

  const selectSupplier = async (supplier) => {
    setSelectedSupplier(supplier);
    setStep('items');
    await loadCatalog(supplier.id);
  };

  const addToCart = (item) => {
    const qty = parseFloat(qtyMap[item.id]);
    if (!qty || qty <= 0) {
      toast.error('Informe a quantidade');
      return;
    }
    const key = item.raw_material_id ? `rm-${item.raw_material_id}` : `c-${item.name.toLowerCase()}`;
    setCart((prev) => {
      const exists = prev.find((c) => c.key === key);
      if (exists) return prev.map((c) => (c.key === key ? { ...c, quantity: qty } : c));
      return [...prev, {
        key, name: item.name, unit: item.unit, quantity: qty, raw_material_id: item.raw_material_id || null,
      }];
    });
    setQtyMap((m) => ({ ...m, [item.id]: '' }));
    toast.success(`${item.name} adicionado`);
  };

  const addNewItem = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Digite o nome do item');
      return;
    }
    if (selectedSupplier?.id) {
      try {
        const r = await api.post(`/suppliers/${selectedSupplier.id}/catalog`, { name, unit: '' });
        setCatalog((prev) => (prev.find((p) => p.id === r.data.id)
          ? prev
          : [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name))));
      } catch { /* segue mesmo assim */ }
    }
    const key = `c-${name.toLowerCase()}`;
    const newItem = { key, name, quantity: 1, raw_material_id: null };
    setCart((prev) => (prev.find((c) => c.key === key) ? prev : [...prev, newItem]));
    setNewName('');
    toast.success('Item adicionado ao carrinho');
  };

  const updateCartQty = (key, qty) => {
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, quantity: parseFloat(qty) || 0 } : c)));
  };

  const removeFromCart = (key) => {
    setCart((prev) => prev.filter((c) => c.key !== key));
    toast.success('Item removido do carrinho');
  };

  const nextStep = () => {
    if (step === 'items') {
      if (cart.length === 0) {
        toast.error('Adicione pelo menos um item ao carrinho');
        return;
      }
      setStep('summary');
    }
  };

  const prevStep = () => {
    if (step === 'items') setStep('suppliers');
    if (step === 'summary') setStep('items');
  };

  const finalize = async () => {
    const items = cart
      .filter((c) => parseFloat(c.quantity) > 0)
      .map((c) => ({
        name: c.name,
        unit: orderUnit,
        quantity: parseFloat(c.quantity),
        raw_material_id: c.raw_material_id,
      }));
    if (items.length === 0) {
      toast.error('Adicione itens com quantidade ao pedido');
      return;
    }
    if (!selectedSupplier?.name) {
      toast.error('Selecione um fornecedor');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        supplier_id: selectedSupplier.id || '',
        supplier_name: selectedSupplier.name,
        items,
        unit: orderUnit,
        observations,
      };
      if (orderToEdit) {
        await api.put(`/purchase-orders/${orderToEdit.id}`, payload);
      } else {
        await api.post('/purchase-orders', payload);
      }
      toast.success(orderToEdit ? 'Pedido atualizado com sucesso!' : 'Pedido criado com sucesso!');
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao criar pedido');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSuppliers = suppliers.filter(
    (s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()),
  );

  const cartTotalItems = cart.length;
  const cartTotalQty = cart.reduce((sum, c) => sum + parseFloat(c.quantity || 0), 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border w-[calc(100vw-1rem)] max-w-2xl max-h-[calc(100dvh-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 rounded-xl">
          <DialogHeader className="mb-6">
            <div className="flex items-center justify-between gap-2 pr-8">
              <DialogTitle className="text-foreground flex items-center gap-2 text-xl sm:text-2xl">
                <ShoppingCart className="w-5 h-5 text-primary" />
                {orderToEdit ? `Editar ${orderToEdit.order_number}` : 'Novo Pedido'}
              </DialogTitle>
              {!orderToEdit && (
                <div className="text-xs text-muted-foreground">
                  Etapa
                  {' '}
                  {step === 'suppliers' ? '1' : step === 'items' ? '2' : '3'}
                  {' '}
                  de 3
                </div>
              )}
            </div>
          </DialogHeader>

          {/* ETAPA 1 — Fornecedores */}
          {step === 'suppliers' && (
            <div className="space-y-4">
              <div>
                <Label className="text-foreground text-base mb-3 block">Escolha um fornecedor</Label>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Pesquisar fornecedor..."
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    className="pl-9 bg-input border-border text-foreground h-11 text-base sm:text-sm"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-2 mb-4">
                  {filteredSuppliers.length > 0 ? (
                    filteredSuppliers.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectSupplier({ id: s.id, name: s.name })}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left active:bg-primary/10 group"
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-all">
                          <Truck className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                          {s.contact && <p className="text-xs text-muted-foreground truncate">{s.contact}</p>}
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    ))
                  ) : supplierSearch ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum fornecedor encontrado</p>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum fornecedor registrado</p>
                  )}
                </div>

                <Button
                  onClick={() => setAddSupplierOpen(true)}
                  variant="outline"
                  className="w-full border-dashed border-primary/50 text-primary hover:bg-primary/5 h-10"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Novo Fornecedor
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 2 — Itens */}
          {step === 'items' && selectedSupplier && (
            <div className="space-y-4">
              {/* Fornecedor selecionado */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 ring-1 ring-primary/15">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Truck className="w-5 h-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{selectedSupplier.name}</p>
                    {!selectedSupplier.id && <span className="text-xs text-muted-foreground">Fornecedor customizado</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSupplier(null);
                    setStep('suppliers');
                  }}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Trocar
                </Button>
              </div>

              {/* Unidade de medida */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm">
                  Unidade de medida
                  {' '}
                  <span className="text-muted-foreground font-normal">(todos os itens)</span>
                </Label>
                <div className="mobile-two-cols grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ORDER_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setOrderUnit(u)}
                      className={`min-h-11 px-2 py-2 rounded-lg text-sm font-medium border transition-all ${
                        orderUnit === u
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-foreground hover:bg-primary/5'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Catálogo */}
              <div className="space-y-2">
                <Label className="text-foreground text-base">Itens do fornecedor</Label>
                {loadingCatalog ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : catalog.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum item no catálogo. Adicione itens abaixo.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-2 border border-border/30 rounded-lg p-3 bg-muted/30">
                    {catalog.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[minmax(0,1fr)_4.75rem_2.75rem] items-center gap-1.5 p-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={qtyMap[item.id] || ''}
                          onChange={(e) => setQtyMap((m) => ({ ...m, [item.id]: e.target.value }))}
                          placeholder="Qtd"
                          className="w-full h-11 bg-input border-border text-foreground text-base sm:text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => addToCart(item)}
                          className="bg-primary hover:bg-primary/90 h-11 w-11 p-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Adicionar item novo */}
              <div className="space-y-2 border-t border-border/60 pt-2">
                <Label className="text-foreground text-sm">Adicionar item customizado</Label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Input
                    placeholder="Nome do item..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full min-w-0 bg-input border-border text-foreground h-11 text-base sm:text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addNewItem();
                      }
                    }}
                  />
                  <Button
                    onClick={addNewItem}
                    variant="outline"
                    className="border-border text-foreground h-11 px-3"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    <span className="hidden min-[360px]:inline">Adicionar</span>
                  </Button>
                </div>
              </div>

              {/* Preview do carrinho na etapa de items */}
              {cart.length > 0 && (
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground text-sm">
                      Carrinho (
                      {cartTotalItems}
                      )
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Total:
                      {' '}
                      {fmtQty(cartTotalQty)}
                    </span>
                  </div>
                  <CartPreview
                    cart={cart}
                    orderUnit={orderUnit}
                    onRemove={removeFromCart}
                    onUpdateQty={updateCartQty}
                    showDeleteButtons
                  />
                </div>
              )}
            </div>
          )}

          {/* ETAPA 3 — Resumo */}
          {step === 'summary' && selectedSupplier && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                <div>
                  <p className="text-xs text-muted-foreground">Fornecedor</p>
                  <p className="text-sm font-semibold text-foreground truncate">{selectedSupplier.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unidade</p>
                  <p className="text-sm font-semibold text-foreground">{orderUnit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Itens</p>
                  <p className="text-sm font-semibold text-foreground">{cartTotalItems}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Quantidade Total</p>
                  <p className="text-sm font-semibold text-foreground">{fmtQty(cartTotalQty)}</p>
                </div>
              </div>

              {/* Itens do carrinho */}
              <div className="space-y-2">
                <Label className="text-foreground text-base">Itens do pedido</Label>
                <CartPreview
                  cart={cart}
                  orderUnit={orderUnit}
                  onRemove={removeFromCart}
                  onUpdateQty={updateCartQty}
                  showDeleteButtons
                />
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm">Observações (opcional)</Label>
                <Textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Especifique detalhes da entrega, condições de pagamento, etc..."
                  className="bg-input border-border text-foreground resize-none text-base sm:text-sm"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Footer com botões de navegação */}
          <DialogFooter className="mt-6 gap-2 flex">
            {step !== 'suppliers' && (
              <Button
                onClick={prevStep}
                variant="outline"
                className="border-border text-foreground h-11"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            )}
            {step === 'suppliers' && (
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="border-border text-foreground flex-1 h-11"
              >
                Cancelar
              </Button>
            )}
            {step !== 'summary' && step !== 'suppliers' && (
              <Button
                onClick={nextStep}
                className="flex-1 bg-primary hover:bg-primary/90 h-11"
              >
                Próximo
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {step === 'summary' && (
              <>
                <Button
                  onClick={() => onOpenChange(false)}
                  variant="outline"
                  className="border-border text-foreground h-11"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={finalize}
                  disabled={submitting}
                  className="flex-1 bg-primary hover:bg-primary/90 h-11"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {orderToEdit ? 'Salvar Alterações' : 'Finalizar Pedido'}
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddSupplierDialog
        open={addSupplierOpen}
        onOpenChange={setAddSupplierOpen}
        onCreated={loadSuppliers}
      />
    </>
  );
};

// ====================== Card de Pedido (Mobile Optimized) ======================
const OrderCard = ({
  order, onStatus, onDelete, onPdf, onShare, onEdit,
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

  return (
    <Card className="min-w-0 p-3 sm:p-4 border shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base sm:text-lg font-bold text-foreground">{order.order_number}</span>
            <Badge className={`text-[10px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0.5 ${meta.cls}`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {meta.label}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            {order.supplier_name}
            {' '}
            •
            {' '}
            {fmtDate(order.created_at)}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(order)}
          className="text-red-600 hover:text-red-500 shrink-0 h-11 w-11 -mr-1 -mt-1"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Items Preview */}
      <div className="space-y-1 mb-3">
        {(order.items || []).slice(0, 4).map((it, i) => (
          <div key={i} className="flex justify-between text-xs sm:text-sm gap-2">
            <span className="text-foreground truncate">{it.name}</span>
            <span className="text-muted-foreground shrink-0">
              {fmtQty(it.quantity)}
              {' '}
              {it.unit}
            </span>
          </div>
        ))}
        {(order.items || []).length > 4 && (
          <p className="text-xs text-muted-foreground">
            +
            {order.items.length - 4}
            {' '}
            item(ns)
          </p>
        )}
      </div>

      {order.observations && (
        <p className="text-xs text-muted-foreground italic mb-3 line-clamp-2">
          Obs:
          {' '}
          {order.observations}
        </p>
      )}

      {/* Action Buttons */}
      <div className="mobile-two-cols grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(order)}
          className="border-primary/40 text-primary w-full sm:w-auto h-11 sm:h-9 text-sm"
        >
          <Edit2 className="w-3.5 h-3.5 mr-1" />
          Editar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPdf(order)}
          className="border-border text-foreground w-full sm:w-auto h-11 sm:h-9 text-sm"
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          PDF
        </Button>
        <Button
          size="sm"
          onClick={handleSharePdf}
          disabled={sharingPdf}
          className="bg-green-600 hover:bg-green-700 w-full sm:w-auto h-11 sm:h-9 text-sm"
        >
          {sharingPdf ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 mr-1" />
              WhatsApp
            </>
          )}
        </Button>

        {order.status === 'pendente' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStatus(order, 'enviado')}
            className="border-border text-foreground w-full sm:w-auto h-11 sm:h-9 text-sm"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            Enviado
          </Button>
        )}
        {order.status !== 'recebido' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStatus(order, 'recebido')}
            className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 w-full sm:w-auto h-11 sm:h-9 text-sm"
          >
            <PackageCheck className="w-3.5 h-3.5 mr-1" />
            Recebido
          </Button>
        )}
        {order.status === 'recebido' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStatus(order, 'pendente')}
            className="text-muted-foreground w-full sm:w-auto h-11 sm:h-9 text-sm"
          >
            Reabrir
          </Button>
        )}
      </div>
    </Card>
  );
};

// ====================== Página Pedidos ======================
export const Pedidos = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
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

  const pendentes = orders.filter((o) => o.status !== 'recebido');
  const recebidos = orders.filter((o) => o.status === 'recebido');

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
          onEdit={(order) => {
            setEditTarget(order);
            setDialogOpen(true);
          }}
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
    <div className="w-full min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-foreground mb-1 sm:mb-2">
            Pedidos
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Gerencie seus pedidos de compra</p>
        </div>
        <Button
          onClick={() => {
            setEditTarget(null);
            setDialogOpen(true);
          }}
          className="bg-primary hover:bg-primary/90 w-full sm:w-auto h-11 text-base sm:text-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Pedido
        </Button>
      </div>

      <Tabs defaultValue="historico" className="w-full">
        <TabsList className="mobile-two-cols grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="historico" className="text-xs sm:text-sm">
            Histórico
          </TabsTrigger>
          <TabsTrigger value="status" className="text-xs sm:text-sm">
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
            renderList(orders, 'Nenhum pedido realizado. Clique em "Novo Pedido".', 'historico-list')
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

      <NewOrderDialog
        key={editTarget?.id || 'new-order'}
        open={dialogOpen}
        orderToEdit={editTarget}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
        onCreated={fetchOrders}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6 rounded-xl">
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
            <AlertDialogCancel className="h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 h-11"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
