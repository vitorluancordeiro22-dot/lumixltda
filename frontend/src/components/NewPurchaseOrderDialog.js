import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu';
import { Plus, Search, Truck, ChevronLeft, ArrowRight, Check, ShoppingCart, Trash2, Loader2, Building2, MoreHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { ORDER_UNITS, emptyOrderDraft, hasOrderDraft, readOrderDraft, parseOrderQuantity, searchOrderText, orderItemsPayload } from '../lib/purchaseOrderDraft';

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
      const response = await api.post('/suppliers', {
        name: name.trim(),
        contact: contact.trim(),
        email: email.trim(),
      });
      toast.success('Fornecedor adicionado com sucesso!');
      setName('');
      setContact('');
      setEmail('');
      onCreated(response.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao adicionar fornecedor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[calc(100%-1rem)] max-w-md max-h-[85dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl [&>button]:h-11 [&>button]:w-11 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:right-1 [&>button]:top-1">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Novo Fornecedor
          </DialogTitle>
          <DialogDescription>Cadastre o fornecedor para montar o pedido.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground">Nome *</Label>
            <Input
              placeholder="Ex: Distribuidora XYZ"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="bg-input border-border text-foreground h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Contato (opcional)</Label>
            <Input
              placeholder="Ex: (11) 98765-4321"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              disabled={submitting}
              className="bg-input border-border text-foreground h-12 text-base"
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
              className="bg-input border-border text-foreground h-12 text-base"
            />
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="border-border text-foreground flex-1 h-12"
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:flex-1 bg-primary hover:bg-primary/90 h-12"
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

const itemKey = (item) => item.raw_material_id ? `rm-${item.raw_material_id}` : `c-${item.name.toLowerCase()}`;
const formatQuantity = (number) => number.toLocaleString('pt-BR', { maximumFractionDigits: 6 });

// Account-scoped and browser-local: a draft never writes to inventory or creates an order.
export const NewPurchaseOrderDialog = (props) => {
  const { user } = useAuth();
  if (!user) return null;
  const storageKey = `lumix:purchase-order-draft:v1:${user.id || user.email}`;
  return <OrderComposer key={storageKey} storageKey={storageKey} {...props} />;
};

const OrderComposer = ({ open, onOpenChange, onCreated, storageKey }) => {
  const [initial] = useState(() => {
    try { return { draft: readOrderDraft(localStorage, storageKey), warning: '' }; }
    catch { return { draft: emptyOrderDraft(), warning: 'Não foi possível recuperar o rascunho deste navegador.' }; }
  });
  const [draft, setDraft] = useState(initial.draft);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [suppliersError, setSuppliersError] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [itemSearch, setItemSearch] = useState('');
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [message, setMessage] = useState(null);
  const notify = (type, text) => setMessage({ type, text });
  const [submitting, setSubmitting] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [viewport, setViewport] = useState({ height: '100dvh', top: '0px' });
  const bodyRef = useRef(null);
  const submitRef = useRef(false);
  const catalogGeneration = useRef(0);
  const { step, supplier, cart, quantities, unit, observations, newName } = draft;
  const change = (patch) => { setMessage(null); setDraft((previous) => ({ ...previous, ...patch })); };

  useEffect(() => {
    try {
      if (hasOrderDraft(draft)) localStorage.setItem(storageKey, JSON.stringify({ ...draft, version: 1 }));
      else localStorage.removeItem(storageKey);
    } catch { setStorageWarning('O navegador não conseguiu salvar. Mantenha esta tela aberta até criar o pedido.'); }
  }, [draft, storageKey]);

  useEffect(() => {
    if (!open) return undefined;
    const visual = window.visualViewport;
    let frame;
    let keyboardTimer;
    const revealField = () => {
      const body = bodyRef.current;
      const field = document.activeElement;
      if (!body?.contains(field) || !field.matches('input, textarea')) return;
      const bounds = body.getBoundingClientRect();
      const input = field.getBoundingClientRect();
      if (input.bottom > bounds.bottom - 12) body.scrollTop += input.bottom - bounds.bottom + 12;
      else if (input.top < bounds.top + 12) body.scrollTop -= bounds.top - input.top + 12;
    };
    const update = () => {
      setViewport({ height: `${visual?.height || window.innerHeight}px`, top: `${visual?.offsetTop || 0}px` });
      window.cancelAnimationFrame(frame);
      window.clearTimeout(keyboardTimer);
      frame = window.requestAnimationFrame(revealField);
      // Some browsers finish repositioning the focused field after the resize.
      // Reveal it again once that keyboard/focus animation has settled.
      keyboardTimer = window.setTimeout(revealField, 250);
    };
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(keyboardTimer);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => { setMessage(null); }, [step, open]);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [step, open]);

  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    setSuppliersError(false);
    try { const response = await api.get('/suppliers'); setSuppliers(response.data); }
    catch { setSuppliersError(true); }
    finally { setLoadingSuppliers(false); }
  }, []);
  useEffect(() => { if (open) loadSuppliers(); }, [open, loadSuppliers]);

  const supplierId = supplier?.id;
  useEffect(() => {
    if (!open || !supplierId) { setCatalog([]); return undefined; }
    let active = true;
    catalogGeneration.current += 1;
    setCatalog([]);
    setLoadingCatalog(true);
    setCatalogError(false);
    api.get(`/suppliers/${supplierId}/catalog`)
      .then((response) => { if (active) setCatalog(response.data); })
      .catch(() => { if (active) setCatalogError(true); })
      .finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; catalogGeneration.current += 1; };
  }, [open, supplierId, catalogRetry]);

  const close = (nextOpen) => { if (!submitting && !addingItem) onOpenChange(nextOpen); };
  const selectSupplier = (nextSupplier) => {
    if (supplier && supplier.id !== nextSupplier.id && hasOrderDraft({ ...draft, supplier: null })) {
      setConfirmation({ kind: 'supplier', supplier: nextSupplier });
      return;
    }
    change({ supplier: nextSupplier, step: 'items' });
    setItemSearch('');
  };

  const addToCart = (item) => {
    const quantity = parseOrderQuantity(quantities[item.id]);
    if (quantity === null) { notify('error', 'Informe uma quantidade maior que zero. Exemplo: 1,5 (sem separador de milhar).'); return; }
    const key = itemKey(item);
    setDraft((previous) => ({
      ...previous,
      cart: previous.cart.some((entry) => entry.key === key)
        ? previous.cart.map((entry) => entry.key === key ? { ...entry, quantity: String(quantities[item.id]) } : entry)
        : [...previous.cart, { key, name: item.name, quantity: String(quantities[item.id]), raw_material_id: item.raw_material_id || null }],
      quantities: { ...previous.quantities, [item.id]: '' },
    }));
    setMessage(null);
  };

  const addNewItem = async () => {
    const name = newName.trim();
    if (!name || addingItem) return;
    const key = `c-${name.toLowerCase()}`;
    if (cart.some((entry) => entry.key === key)) { notify('info', 'Esse item já está no pedido. Ajuste a quantidade na revisão.'); return; }
    setAddingItem(true);
    const generation = catalogGeneration.current;
    try {
      const response = await api.post(`/suppliers/${supplier.id}/catalog`, { name, unit: '' });
      if (generation === catalogGeneration.current) setCatalog((previous) => previous.some((entry) => entry.id === response.data.id)
        ? previous : [...previous, response.data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch { notify('info', 'Item incluído só neste pedido; não foi possível salvar no catálogo.'); }
    setDraft((previous) => ({ ...previous, newName: '', cart: [...previous.cart, { key, name, quantity: '1', raw_material_id: null }] }));
    setAddingItem(false);
    notify('success', 'Item incluído com quantidade 1. Confira na revisão.');
  };

  const performConfirmation = async () => {
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === 'discard') {
      setDraft(emptyOrderDraft());
      setSupplierSearch(''); setItemSearch('');
      notify('info', 'Rascunho descartado');
    } else if (action.kind === 'supplier') {
      setDraft({ ...emptyOrderDraft(), supplier: action.supplier, step: 'items' });
      setItemSearch('');
    } else if (action.kind === 'catalog') {
      try {
        await api.delete(`/suppliers/${supplier.id}/catalog/${action.item.id}`);
        setCatalog((previous) => previous.filter((item) => item.id !== action.item.id));
        // Removing a catalog entry does not silently remove an already selected order item.
        notify('success', 'Item removido do catálogo. Os itens do pedido foram mantidos.');
      } catch { notify('error', 'Não foi possível remover do catálogo'); }
    }
  };

  const review = () => {
    if (addingItem) return;
    const pending = Object.values(quantities).some((value) => value.trim());
    if (pending || newName.trim()) {
      notify('error', 'Há um item ainda não incluído. Toque em Adicionar/Atualizar ou limpe o campo antes de revisar.');
      return;
    }
    try { orderItemsPayload(draft); change({ step: 'summary' }); }
    catch (error) { notify('error', error.message); }
  };

  const finalize = async () => {
    if (submitRef.current) return;
    let items;
    try { items = orderItemsPayload(draft); }
    catch (error) { notify('error', error.message); return; }
    submitRef.current = true;
    setSubmitting(true);
    try {
      await api.post('/purchase-orders', { supplier_id: supplier.id, supplier_name: supplier.name, items, unit, observations: observations.trim() });
      setDraft(emptyOrderDraft());
      try { localStorage.removeItem(storageKey); } catch { /* The storage warning is already visible. */ }
      toast.success('Pedido criado com sucesso!', { position: 'bottom-center', duration: 2000 });
      onOpenChange(false);
      onCreated();
    } catch (error) {
      notify('error', error.response?.data?.detail || 'Não foi possível confirmar a criação. Confira o histórico antes de tentar novamente. Seu rascunho foi mantido.');
    } finally { setSubmitting(false); submitRef.current = false; }
  };

  const filteredSuppliers = suppliers.filter((entry) => searchOrderText(entry.name).includes(searchOrderText(supplierSearch)));
  const filteredCatalog = catalog.filter((entry) => searchOrderText(entry.name).includes(searchOrderText(itemSearch)));
  const total = cart.reduce((sum, entry) => sum + (parseOrderQuantity(entry.quantity) || 0), 0);
  const stepIndex = ['suppliers', 'items', 'summary'].indexOf(step);
  const working = submitting || addingItem;

  return <>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        aria-describedby="purchase-order-description"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        style={{ '--order-vh': viewport.height, '--order-top': viewport.top }}
        className="left-0 top-[var(--order-top)] h-[var(--order-vh)] max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 gap-0 flex flex-col overflow-hidden bg-card sm:left-1/2 sm:top-1/2 sm:h-[min(90dvh,850px)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border [&>button]:hidden"
      >
        <header className="shrink-0 border-b px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-xl font-semibold text-foreground">Novo pedido</DialogTitle>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => close(false)} disabled={working} aria-label="Salvar rascunho e sair"><X className="h-5 w-5" /></Button>
          </div>
          <DialogDescription id="purchase-order-description" className="text-xs text-muted-foreground">
            {storageWarning || 'Rascunho salvo automaticamente neste navegador.'}
          </DialogDescription>
          <ol className="mt-3 flex gap-2" aria-label="Etapas do pedido">
            {['Fornecedor', 'Itens', 'Revisão'].map((label, index) => <li key={label} aria-current={index === stepIndex ? 'step' : undefined}
              className={`flex flex-1 items-center gap-1.5 text-xs ${index === stepIndex ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${index <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {index < stepIndex ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>{label}
            </li>)}
          </ol>
        </header>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" data-testid="order-scroll-body">
          {step === 'suppliers' && <section className="space-y-4" aria-label="Escolher fornecedor">
            <div><h2 className="text-lg font-semibold">De quem vamos comprar?</h2><p className="text-sm text-muted-foreground">Escolha o fornecedor para ver os materiais.</p></div>
            {supplier && <Button variant="outline" className="h-12 w-full justify-between" onClick={() => change({ step: 'items' })}><span className="min-w-0 truncate">Continuar com {supplier.name}</span><ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>}
            <div className="relative"><Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar fornecedor" placeholder="Buscar fornecedor" value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} className="h-12 pl-10 text-base" /></div>
            <Button variant="outline" className="h-12 w-full border-dashed" onClick={() => setAddSupplierOpen(true)}><Plus className="mr-2 h-4 w-4" />Cadastrar fornecedor</Button>
            {loadingSuppliers ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">Carregando fornecedores…</p> : suppliersError ? <div className="rounded-xl border p-4 text-sm"><p>Não foi possível carregar os fornecedores.</p><Button variant="outline" className="mt-3 h-11" onClick={loadSuppliers}>Tentar novamente</Button></div> : <div className="space-y-2">
              {filteredSuppliers.map((entry) => <button type="button" key={entry.id} onClick={() => selectSupplier({ id: entry.id, name: entry.name })} className="flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-muted/50 active:bg-muted">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Truck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{entry.name}</span>{entry.contact && <span className="block break-words text-xs text-muted-foreground">{entry.contact}</span>}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>)}
              {!filteredSuppliers.length && <p className="py-8 text-center text-sm text-muted-foreground">{supplierSearch ? 'Nenhum fornecedor encontrado.' : 'Cadastre o primeiro fornecedor para começar.'}</p>}
            </div>}
          </section>}

          {step === 'items' && supplier && <section className="space-y-5" aria-label="Escolher materiais">
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3"><Truck className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Fornecedor</p><p className="break-words text-sm font-semibold">{supplier.name}</p></div><Button variant="ghost" className="h-11 shrink-0" disabled={working} onClick={() => change({ step: 'suppliers' })}>Trocar</Button></div>
            <fieldset disabled={working}><legend className="mb-2 text-sm font-medium">Unidade para todos os itens</legend><div className="grid grid-cols-4 gap-2">{ORDER_UNITS.map((value) => <button type="button" key={value} aria-pressed={unit === value} onClick={() => change({ unit: value })} className={`min-h-11 rounded-lg border px-1 text-sm ${unit === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{value}</button>)}</div></fieldset>
            <div className="space-y-2"><Label htmlFor="order-item-search" className="text-base font-semibold">Materiais do fornecedor</Label><div className="relative"><Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" /><Input id="order-item-search" placeholder="Buscar pelo nome do material" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} className="h-12 pl-10 text-base" /></div><p className="text-xs text-muted-foreground">Para decimais, use 1,5 ou 1.5. Não use separador de milhar.</p></div>
            {loadingCatalog ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">Carregando materiais…</p> : catalogError ? <div className="rounded-xl border p-4 text-sm"><p>Não foi possível carregar o catálogo.</p><Button className="mt-3 h-11" variant="outline" onClick={() => setCatalogRetry((value) => value + 1)}>Tentar novamente</Button></div> : <div className="space-y-3">
              {filteredCatalog.map((item) => {
                const selected = cart.find((entry) => entry.key === itemKey(item));
                return <article key={item.id} className={`rounded-xl border p-3 ${selected ? 'border-primary/35 bg-primary/5' : 'bg-card'}`}>
                  <div className="mb-3 flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-base font-medium leading-snug">{item.name}</h3>{selected && <p className="mt-1 text-xs font-medium text-primary">No pedido: {selected.quantity} {unit}</p>}</div>
                    {item.source === 'custom' && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={`Opções de ${item.name}`} disabled={working}><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="min-h-11 text-red-600" onSelect={() => setConfirmation({ kind: 'catalog', item })}><Trash2 />Remover do catálogo</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
                  </div>
                  <div className="flex items-end gap-3"><div className="min-w-0 flex-1"><Label htmlFor={`order-qty-${item.id}`} className="mb-1 block text-xs">Quantidade em {unit}</Label><Input id={`order-qty-${item.id}`} type="text" inputMode="decimal" autoComplete="off" placeholder={selected ? String(selected.quantity) : 'Ex.: 25'} value={quantities[item.id] || ''} disabled={working} onChange={(event) => change({ quantities: { ...quantities, [item.id]: event.target.value } })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addToCart(item); } }} className="h-12 text-base" /></div><Button className="h-12 min-w-[112px] px-3" disabled={working || !String(quantities[item.id] || '').trim()} onClick={() => addToCart(item)}>{selected ? <Check className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}{selected ? 'Atualizar' : 'Adicionar'}</Button></div>
                </article>;
              })}
              {!filteredCatalog.length && <p className="py-5 text-center text-sm text-muted-foreground">{itemSearch ? 'Nenhum material encontrado. Tente outro nome.' : 'Este fornecedor ainda não tem materiais cadastrados.'}</p>}
            </div>}
            <div className="space-y-2 rounded-xl border border-dashed p-3"><Label htmlFor="order-new-item" className="text-sm font-medium">Não encontrou? Inclua outro item</Label><Input id="order-new-item" placeholder="Nome completo do material" className="h-12 text-base" value={newName} disabled={working} onChange={(event) => change({ newName: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addNewItem(); } }} /><Button variant="outline" className="h-11 w-full" disabled={working || !newName.trim()} onClick={addNewItem}>{addingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Incluir no pedido</Button><p className="text-xs text-muted-foreground">Será incluído com quantidade 1. Você pode ajustar na revisão.</p></div>
          </section>}

          {step === 'summary' && supplier && <section className="space-y-5" aria-label="Revisar pedido">
            <div><h2 className="text-lg font-semibold">Confira antes de criar</h2><p className="mt-1 break-words text-sm text-muted-foreground">{supplier.name} · {cart.length} {cart.length === 1 ? 'item' : 'itens'}</p></div>
            <div className="space-y-3">{cart.map((entry, index) => {
              const invalid = parseOrderQuantity(entry.quantity) === null;
              return <article key={entry.key} className="rounded-xl border p-3"><div className="mb-3 flex items-start justify-between gap-2"><h3 className="min-w-0 break-words pt-2 text-base font-medium">{entry.name}</h3><Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 text-red-600" disabled={submitting} aria-label={`Remover ${entry.name} do pedido`} onClick={() => change({ cart: cart.filter((item) => item.key !== entry.key) })}><Trash2 className="h-5 w-5" /></Button></div><Label htmlFor={`review-qty-${index}`} className="mb-1 block text-xs">Quantidade em {unit}</Label><Input id={`review-qty-${index}`} type="text" inputMode="decimal" autoComplete="off" className="h-12 text-base" value={entry.quantity} disabled={submitting} aria-invalid={invalid} aria-describedby={invalid ? `review-error-${index}` : undefined} onChange={(event) => change({ cart: cart.map((item) => item.key === entry.key ? { ...item, quantity: event.target.value } : item) })} />{invalid && <p id={`review-error-${index}`} className="mt-1 text-xs text-red-600">Informe um número maior que zero. Exemplo: 1,5.</p>}</article>;
            })}{!cart.length && <p className="rounded-xl bg-muted p-4 text-sm">Seu pedido está vazio. Volte para adicionar materiais.</p>}</div>
            <div className="flex items-center justify-between rounded-xl bg-muted/60 p-4 text-sm"><span>Total em {unit}</span><strong>{formatQuantity(total)} {unit}</strong></div>
            <div className="space-y-2"><Label htmlFor="order-notes">Observações (opcional)</Label><Textarea id="order-notes" rows={3} className="text-base" placeholder="Entrega, condições de pagamento ou outras informações" value={observations} disabled={submitting} onChange={(event) => change({ observations: event.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Criar o pedido registra a compra. A entrada no estoque continua sendo feita em “Lotear MP”.</p>
          </section>}
        </div>

        <footer className="shrink-0 border-t bg-card px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
          {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`mb-2 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>{message.text}</p>}
          {step === 'items' && <p className="mb-2 flex items-center justify-between text-xs text-muted-foreground" aria-live="polite"><span>{cart.length} {cart.length === 1 ? 'item incluído' : 'itens incluídos'}</span><span>{formatQuantity(total)} {unit}</span></p>}
          <div className="flex gap-2">
            {step === 'suppliers' ? <Button variant="outline" className="h-12 flex-1" onClick={() => close(false)}>Salvar e sair</Button> : <>
              <Button variant="outline" className="h-12 px-3 sm:px-4" disabled={working} onClick={() => change({ step: step === 'summary' ? 'items' : 'suppliers' })}><ChevronLeft className="mr-1 h-4 w-4" />Voltar</Button>
              <Button className="h-12 min-w-0 flex-1 px-3" disabled={working || !cart.length || (step === 'summary' && cart.some((entry) => parseOrderQuantity(entry.quantity) === null))} onClick={step === 'summary' ? finalize : review}>
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando…</> : step === 'summary' ? <><Check className="mr-2 h-4 w-4" />Criar pedido</> : <><ShoppingCart className="mr-2 h-4 w-4" />Revisar pedido · {cart.length}</>}
              </Button>
            </>}
            {hasOrderDraft(draft) && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="h-12 w-11 shrink-0" disabled={working} aria-label="Opções do rascunho"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="min-h-11" onSelect={() => close(false)}>Salvar e sair</DropdownMenuItem><DropdownMenuItem className="min-h-11 text-red-600" onSelect={() => setConfirmation({ kind: 'discard' })}>Descartar rascunho</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
    <AddSupplierDialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen} onCreated={(created) => { loadSuppliers(); if (created?.id) selectSupplier({ id: created.id, name: created.name }); }} />
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(next) => { if (!next) setConfirmation(null); }}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md"><AlertDialogHeader><AlertDialogTitle>{confirmation?.kind === 'supplier' ? 'Trocar de fornecedor?' : confirmation?.kind === 'catalog' ? 'Remover do catálogo?' : 'Descartar rascunho?'}</AlertDialogTitle><AlertDialogDescription>{confirmation?.kind === 'supplier' ? 'Os itens e as observações atuais serão descartados. O novo pedido começará vazio para o outro fornecedor.' : confirmation?.kind === 'catalog' ? 'Esse material deixará o catálogo do fornecedor. Se já estiver no pedido, será mantido na revisão.' : 'Os itens e as informações deste rascunho serão apagados deste navegador. Pedidos já criados não serão alterados.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="gap-2"><AlertDialogCancel className="h-12">Continuar editando</AlertDialogCancel><AlertDialogAction className="h-12 bg-red-600 hover:bg-red-700" onClick={performConfirmation}>{confirmation?.kind === 'supplier' ? 'Trocar e limpar' : confirmation?.kind === 'catalog' ? 'Remover do catálogo' : 'Descartar'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
};
