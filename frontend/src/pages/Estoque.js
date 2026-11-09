import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Combobox } from '../components/ui/combobox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  ArrowDownToLine, ArrowUpFromLine, ClipboardList, Search, Camera, Printer, Check, X,
  Plus, Minus, Trash2, AlertTriangle, History, Undo2, PackageOpen, ChevronDown, ChevronUp, Gauge,
} from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { StockBottle } from '../components/StockBottle';
import { MinimumsManager } from '../components/MinimumsManager';
import { STOCK_SIZES, sizeInfo, errorMessage } from '../lib/stockSizes';
import { code128Svg } from '../lib/code128';

const MIXED = 'misturado';

const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};
const fmtDate = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : d || '');
const batchLabel = (n) => (!n || n === MIXED ? 'Lotes misturados' : `Lote ${n}`);

// ---------- seletor de quantidade com botões grandes ----------
const QuantityInput = ({ value, onChange, max }) => {
  const n = parseInt(value, 10) || 0;
  const set = (v) => onChange(String(Math.max(0, max != null ? Math.min(v, max) : v)));
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => set(n - 1)}><Minus className="w-5 h-5" /></Button>
      <Input type="number" inputMode="numeric" min="1" value={value} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); onChange(v && max != null && parseInt(v, 10) > max ? String(max) : v); }}
             className="h-12 text-center text-2xl font-bold" placeholder="0" />
      <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => set(n + 1)}><Plus className="w-5 h-5" /></Button>
    </div>
  );
};

// ---------- botões de tamanho ----------
const SizePicker = ({ sizes, value, onChange, showQty = false }) => (
  <div className="grid grid-cols-4 gap-2">
    {sizes.map((s) => (
      <button key={s.size} type="button" onClick={() => onChange(s.size)}
              className={`flex flex-col items-center justify-end gap-1 rounded-xl border-2 p-2 h-24 transition ${
                value === s.size ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
        <StockBottle size={s.size} low={s.low} empty={showQty && s.quantity === 0} />
        <span className="text-sm font-bold">{s.label}</span>
        {showQty && <span className="text-[11px] text-muted-foreground leading-none">{s.quantity} un</span>}
      </button>
    ))}
  </div>
);

// ---------- diálogo de entrada / saída / inventário ----------
const MODE_META = {
  entrada: { title: 'Entrada no estoque', icon: ArrowDownToLine, button: 'Registrar entrada' },
  inventario: { title: 'Inventário inicial / ajuste', icon: ClipboardList, button: 'Registrar no inventário' },
  saida: { title: 'Saída para o depósito', icon: ArrowUpFromLine, button: 'Registrar saída' },
};

const MovementDialog = ({ mode, open, onOpenChange, products, team, defaultOperator, initial, onDone }) => {
  const [productId, setProductId] = useState('');
  const [size, setSize] = useState('');
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [operator, setOperator] = useState('');
  const [note, setNote] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const meta = MODE_META[mode] || MODE_META.entrada;

  useEffect(() => {
    if (!open) return;
    setProductId(initial?.product_id || '');
    setSize(initial?.size || '');
    setBatchId(mode === 'inventario' ? MIXED : '');
    setQty('');
    setNote('');
    setOperator((o) => o || defaultOperator || '');
  }, [open, initial, mode, defaultOperator]);

  const product = products.find((p) => p.product_id === productId);
  const sizeRow = product?.sizes.find((s) => s.size === size);

  useEffect(() => {
    if (product && product.sizes.length === 1) setSize(product.sizes[0].size);
  }, [product]);

  useEffect(() => {
    if (!open || !productId || mode === 'saida') { setBatches([]); return; }
    api.get(`/finished-stock/products/${productId}/batches`).then((r) => setBatches(r.data)).catch(() => setBatches([]));
  }, [open, productId, mode]);

  const batchOptions = useMemo(() => {
    const rows = batches.map((b) => {
      const info = size ? b.sizes[size] : null;
      const avail = info ? info.available : null;
      const status = b.status === 'arquivado' ? 'arquivado' : b.status === 'finalizado' ? 'finalizado' : 'em andamento';
      const extra = mode === 'entrada' && info ? ` · disp. ${avail}/${info.counted}` : '';
      return { value: b.batch_id, label: `${b.batch_number} · ${fmtDate(b.date).slice(0, 5)} · ${status}${extra}`, avail };
    });
    const visible = mode === 'entrada' && size ? rows.filter((r) => r.avail > 0) : rows;
    return mode === 'inventario' ? [{ value: MIXED, label: 'Lotes misturados / não sei o lote' }, ...visible] : visible;
  }, [batches, size, mode]);

  const selectedBatch = batches.find((b) => b.batch_id === batchId);
  const maxQty = mode === 'entrada' && selectedBatch && size ? selectedBatch.sizes[size]?.available
    : mode === 'saida' ? sizeRow?.quantity : undefined;

  const onScan = useCallback(async (code) => {
    setScanOpen(false);
    try {
      const r = await api.get(`/finished-stock/barcode/${encodeURIComponent(code)}`);
      setProductId(r.data.product_id);
      setSize(r.data.size);
      setBatchId(mode === 'inventario' ? MIXED : '');
      toast.success(`${r.data.name} ${r.data.label}`);
    } catch (e) { toast.error(errorMessage(e, 'Código não encontrado')); }
  }, [mode]);

  const submit = async (keepOpen) => {
    const quantity = parseInt(qty, 10);
    if (!productId) return toast.error('Escolha o produto');
    if (!size) return toast.error('Escolha o tamanho');
    if (mode === 'entrada' && !batchId) return toast.error('Escolha o lote');
    if (!quantity || quantity <= 0) return toast.error('Informe a quantidade');
    if (!operator.trim()) return toast.error('Informe quem está registrando');
    setSaving(true);
    try {
      if (mode === 'saida') {
        const r = await api.post('/finished-stock/exits', { items: [{ product_id: productId, size, quantity }], operator, note });
        toast.success(`Saída registrada: ${quantity} × ${product.name} ${sizeInfo(size).label}`);
        r.data.notifications?.forEach((n) => toast.warning(n.message, { duration: 10000 }));
      } else {
        await api.post('/finished-stock/entries', {
          product_id: productId, size, quantity, operator, note, mode: mode === 'inventario' ? 'inventario' : 'normal',
          batch_id: batchId && batchId !== MIXED ? batchId : null,
        });
        toast.success(`Entrada registrada: ${quantity} × ${product.name} ${sizeInfo(size).label}`);
      }
      onDone();
      if (keepOpen) {
        setQty('');
        if (mode === 'inventario') { setProductId(''); setSize(''); setBatchId(MIXED); }
        else if (mode === 'entrada') {
          api.get(`/finished-stock/products/${productId}/batches`).then((r) => setBatches(r.data)).catch(() => {});
        }
      } else onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, 'Erro ao registrar'));
    } finally { setSaving(false); }
  };

  const Icon = meta.icon;
  const teamOptions = [...new Set([defaultOperator, ...team.map((t) => t.name)].filter(Boolean))].map((n) => ({ value: n, label: n }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon className="w-5 h-5" /> {meta.title}</DialogTitle></DialogHeader>
          {mode === 'inventario' && (
            <p className="text-xs rounded-md bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 p-2">
              Use para a contagem manual inicial ou para acertar o estoque. Não tem limite da Contagem e o lote é opcional.
              Depois de salvar, a tela fica aberta para o próximo produto.
            </p>
          )}
          <div className="space-y-4">
            <div>
              <Label>Produto</Label>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <Combobox options={products.map((p) => ({ value: p.product_id, label: p.name }))} value={productId}
                            onChange={(v) => { setProductId(v); setSize(''); setBatchId(mode === 'inventario' ? MIXED : ''); }}
                            placeholder="Pesquise o produto" searchPlaceholder="Nome do produto..." emptyText="Nenhum produto" />
                </div>
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setScanOpen(true)} title="Ler código de barras">
                  <Camera className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {product && (
              <div>
                <Label>Tamanho</Label>
                <SizePicker sizes={product.sizes} value={size} onChange={(s) => { setSize(s); if (mode === 'entrada') setBatchId(''); }} showQty />
              </div>
            )}

            {product && size && mode !== 'saida' && (
              <div>
                <Label>{mode === 'inventario' ? 'Lote (opcional)' : 'Lote'}</Label>
                {batchOptions.length === 0 && mode === 'entrada' ? (
                  <p className="text-sm text-muted-foreground border rounded-md p-3">
                    Nenhum lote com garrafas de {sizeInfo(size).label} disponíveis na Contagem.
                    Para estoque antigo, use <b>Inventário</b>.
                  </p>
                ) : (
                  <Combobox options={batchOptions} value={batchId} onChange={setBatchId}
                            placeholder="Escolha ou digite o lote" searchPlaceholder="Número do lote..." emptyText="Lote não encontrado" />
                )}
              </div>
            )}

            {product && size && mode === 'saida' && sizeRow && (
              <div className="text-sm rounded-md border p-3">
                <p>Em estoque: <b>{sizeRow.quantity}</b> {sizeRow.minimum > 0 && <span className="text-muted-foreground">(mínimo {sizeRow.minimum})</span>}</p>
                {sizeRow.lots.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Sai primeiro de: {sizeRow.lots.map((l) => `${batchLabel(l.batch_number)} (${l.quantity})`).join(', ')}</p>
                )}
              </div>
            )}

            {product && size && (
              <div>
                <Label>Quantidade de unidades {maxQty != null && <span className="text-muted-foreground font-normal">(máx. {maxQty})</span>}</Label>
                <QuantityInput value={qty} onChange={setQty} max={maxQty} />
              </div>
            )}

            <div>
              <Label>Quem está registrando</Label>
              <Combobox options={teamOptions} value={operator} onChange={setOperator} placeholder="Selecione" searchPlaceholder="Nome..." emptyText="Ninguém encontrado" />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: palete 3" />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {mode !== 'saida' && (
                <Button type="button" variant="outline" className="flex-1 h-12" disabled={saving} onClick={() => submit(true)}>
                  Salvar e continuar
                </Button>
              )}
              <Button type="button" className="flex-1 h-12 bg-primary hover:bg-primary/90" disabled={saving} onClick={() => submit(false)}>
                {meta.button}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScan} />
    </>
  );
};

// ---------- impressão da lista de gestão ----------
export const listCode = (list) => 'LS' + list.id.replace(/-/g, '').slice(0, 10).toUpperCase();

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const printList = (list, products) => {
  const lotsFor = (item) => {
    const p = products.find((x) => x.product_id === item.product_id);
    const s = p?.sizes.find((x) => x.size === item.size);
    if (!s) return '';
    let left = item.quantity;
    const parts = [];
    for (const lot of s.lots) {
      if (left <= 0) break;
      const take = Math.min(lot.quantity, left);
      parts.push(`${lot.batch_number === MIXED ? 'misturado' : lot.batch_number} (${take})`);
      left -= take;
    }
    return parts.join(', ') + (left > 0 ? ` — faltam ${left}` : '');
  };
  const codeFor = (item) => {
    const p = products.find((x) => x.product_id === item.product_id);
    const s = p?.sizes.find((x) => x.size === item.size);
    return s ? (s.barcode || s.internal_code) : '';
  };
  const barcodeCell = (item) => {
    const code = codeFor(item);
    if (!code) return '';
    try { return code128Svg(code, { height: 34, module: 1.1 }); } catch { return escapeHtml(code); }
  };
  const rows = list.items.map((i, idx) => `
    <tr><td>${idx + 1}</td><td>${escapeHtml(i.name)}</td><td class="c">${escapeHtml(i.label)}</td>
    <td class="c b">${i.quantity}</td><td class="bc">${barcodeCell(i)}</td><td>${escapeHtml(lotsFor(i))}</td><td class="c">☐</td></tr>`).join('');
  const total = list.items.reduce((a, i) => a + i.quantity, 0);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de gestão</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}
    h1{font-size:20px;margin:0}.sub{color:#555;font-size:12px;margin:4px 0 16px}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}
    th{background:#eee}.c{text-align:center}.b{font-weight:bold;font-size:15px}td{vertical-align:middle}
    .bc{text-align:center;padding:4px}.bc svg{display:block;margin:0 auto;max-width:100%}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.lc{text-align:center;font-size:10px;color:#555}
    .sign{display:flex;gap:40px;margin-top:48px;font-size:12px}.sign div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center}
    @media print{body{margin:10mm}}
  </style></head><body>
  <div class="head"><div><h1>Lumix — Lista de gestão (Estoque → Depósito)</h1>
  <p class="sub">Lista ${escapeHtml(listCode(list))} · criada por ${escapeHtml(list.created_by)} em ${escapeHtml(new Date(list.created_at).toLocaleString('pt-BR'))}${list.note ? ' · ' + escapeHtml(list.note) : ''}</p></div>
  <div class="lc">${code128Svg(listCode(list), { height: 40, module: 1.3 })}<div>Leia na aba Estoque para confirmar a saída</div></div></div>
  <table><thead><tr><th>#</th><th>Produto</th><th class="c">Tamanho</th><th class="c">Qtd</th><th class="c">Código</th><th>Retirar dos lotes</th><th class="c">OK</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><th colspan="3">Total de unidades</th><th class="c">${total}</th><th colspan="3"></th></tr></tfoot></table>
  <div class="sign"><div>Separado por</div><div>Conferido por</div><div>Data</div></div>
  <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast.error('Permita pop-ups para imprimir'); return; }
  w.document.open(); w.document.write(html); w.document.close();
};

// ---------- diálogo da lista de gestão ----------
const ListDialog = ({ open, onOpenChange, products, onCreated }) => {
  const [items, setItems] = useState([]);
  const [productId, setProductId] = useState('');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setItems([]); setProductId(''); setSize(''); setQty(''); setNote(''); } }, [open]);

  const product = products.find((p) => p.product_id === productId);
  useEffect(() => { if (product && product.sizes.length === 1) setSize(product.sizes[0].size); }, [product]);

  const hasStock = products.some((p) => p.sizes.some((s) => s.quantity > 0));

  const add = () => {
    const quantity = parseInt(qty, 10);
    if (!product || !size || !quantity) return toast.error('Escolha produto, tamanho e quantidade');
    const s = product.sizes.find((x) => x.size === size);
    const already = items.filter((i) => i.product_id === productId && i.size === size).reduce((a, i) => a + i.quantity, 0);
    if (quantity + already > s.quantity) return toast.error(`Em estoque só há ${s.quantity} de ${s.label}`);
    setItems([...items, { product_id: productId, name: product.name, size, label: s.label, quantity, stock: s.quantity }]);
    setProductId(''); setSize(''); setQty('');
  };

  const onScan = async (code) => {
    setScanOpen(false);
    try {
      const r = await api.get(`/finished-stock/barcode/${encodeURIComponent(code)}`);
      setProductId(r.data.product_id); setSize(r.data.size);
    } catch (e) { toast.error(errorMessage(e, 'Código não encontrado')); }
  };

  const save = async () => {
    if (!items.length) return toast.error('Adicione pelo menos um item');
    setSaving(true);
    try {
      const r = await api.post('/finished-stock/lists', { items: items.map(({ product_id, size: s, quantity }) => ({ product_id, size: s, quantity })), note });
      toast.success('Lista criada');
      printList(r.data, products);
      onCreated();
      onOpenChange(false);
    } catch (e) { toast.error(errorMessage(e, 'Erro ao criar lista')); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> Lista de gestão — estoque → depósito</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Monte a lista, imprima para separar e, depois da baldeação, toque em <b>Confirmar saída</b> na lista.</p>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <Combobox options={products.filter((p) => p.sizes.some((s) => s.quantity > 0)).map((p) => ({ value: p.product_id, label: p.name }))}
                          value={productId} onChange={(v) => { setProductId(v); setSize(''); }}
                          placeholder="Produto com estoque" searchPlaceholder="Nome do produto..." emptyText="Nenhum produto com estoque" />
              </div>
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setScanOpen(true)}><Camera className="w-5 h-5" /></Button>
            </div>
            {product && <SizePicker sizes={product.sizes} value={size} onChange={setSize} showQty />}
            {product && size && <QuantityInput value={qty} onChange={setQty} max={product.sizes.find((s) => s.size === size)?.quantity} />}
            <Button type="button" variant="outline" className="w-full" onClick={add} disabled={!product || !size}><Plus className="w-4 h-4 mr-1" /> Adicionar à lista</Button>
          </div>
          {items.length > 0 && (
            <div className="divide-y rounded-lg border">
              {items.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <StockBottle size={i.size} />
                    <span className="truncate">{i.name} <b>{i.label}</b></span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-lg">{i.quantity}</span>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setItems(items.filter((_, k) => k !== idx))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {items.length === 0 && !hasStock && (
            <p className="text-sm text-muted-foreground">Nenhum produto com estoque no momento.</p>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" />
          <Button className="w-full h-12 bg-primary hover:bg-primary/90" onClick={save} disabled={saving || !items.length}>
            <Printer className="w-4 h-4 mr-2" /> Salvar e imprimir
          </Button>
        </DialogContent>
      </Dialog>
      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScan} />
    </>
  );
};

// ---------- página ----------
export const Estoque = () => {
  const { user, role } = useAuth();
  const isLab = role === 'laboratorio';
  const [data, setData] = useState({ products: [], sizes: [] });
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState([]);
  const [lists, setLists] = useState([]);
  const [movements, setMovements] = useState([]);
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [dialog, setDialog] = useState({ mode: null, initial: null });
  const [listOpen, setListOpen] = useState(false);
  const [minOpen, setMinOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirm, setConfirm] = useState(null); // {type:'list'|'cancelList'|'undo', item}
  const defaultOperator = user?.name || '';

  const load = useCallback(async () => {
    try {
      const [o, l, m] = await Promise.all([
        api.get('/finished-stock/overview'), api.get('/finished-stock/lists'), api.get('/finished-stock/movements', { params: { limit: 60 } }),
      ]);
      setData(o.data); setLists(l.data); setMovements(m.data);
    } catch (e) { toast.error(errorMessage(e, 'Erro ao carregar o estoque')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    api.get('/team').then((r) => setTeam((r.data || []).filter((t) => t.active !== false))).catch(() => {});
  }, [load]);

  const usedSizes = useMemo(() => {
    const set = new Set();
    data.products.forEach((p) => p.sizes.forEach((s) => set.add(s.size)));
    return STOCK_SIZES.filter((s) => set.has(s.size));
  }, [data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sizes.some((s) => s.barcode && s.barcode === search.trim()))
      .map((p) => ({ ...p, sizes: p.sizes.filter((s) => (!sizeFilter || s.size === sizeFilter) && (!onlyLow || s.low)) }))
      .filter((p) => p.sizes.length > 0)
      .filter((p) => !onlyLow || p.sizes.some((s) => s.low));
  }, [data, search, sizeFilter, onlyLow]);

  const lowCount = data.products.reduce((a, p) => a + p.sizes.filter((s) => s.low).length, 0);
  const totalUnits = visible.reduce((a, p) => a + p.sizes.reduce((b, s) => b + s.quantity, 0), 0);
  const pendingLists = lists.filter((l) => l.status === 'pendente');

  const onScan = useCallback(async (code) => {
    setScanOpen(false);
    if (/^LS[0-9A-F]{10}$/i.test(code.trim())) {
      const lst = lists.find((l) => l.status === 'pendente' && listCode(l) === code.trim().toUpperCase());
      if (lst) { setSearch(''); setConfirm({ type: 'list', item: lst }); }
      else toast.error('Lista não encontrada ou já confirmada');
      return;
    }
    try {
      const r = await api.get(`/finished-stock/barcode/${encodeURIComponent(code)}`);
      setSearch(r.data.name); setSizeFilter(r.data.size); setOnlyLow(false);
      setHighlight(`${r.data.product_id}:${r.data.size}`);
      toast.success(`${r.data.name} ${r.data.label}`);
    } catch (e) { toast.error(errorMessage(e, 'Código não encontrado')); }
  }, [lists]);

  const onSearchKey = async (e) => {
    // leitor USB: digita o código e aperta Enter
    if (e.key === 'Enter' && /^(\d{6,}|L[XS][0-9A-F]{10,11})$/i.test(search.trim())) onScan(search.trim());
  };

  const runConfirm = async () => {
    const c = confirm; setConfirm(null);
    try {
      if (c.type === 'list') {
        const r = await api.post(`/finished-stock/lists/${c.item.id}/confirm`, { operator: defaultOperator });
        toast.success('Saída da lista registrada');
        r.data.notifications?.forEach((n) => toast.warning(n.message, { duration: 10000 }));
      } else if (c.type === 'cancelList') {
        await api.delete(`/finished-stock/lists/${c.item.id}`); toast.success('Lista cancelada');
      } else if (c.type === 'undo') {
        await api.post(`/finished-stock/movements/${c.item.id}/cancel`); toast.success('Movimentação estornada');
      }
      load();
    } catch (e) { toast.error(errorMessage(e, 'Não foi possível concluir')); }
  };

  const openMove = (mode, initial = null) => setDialog({ mode, initial });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold mb-1">Estoque</h1>
          <p className="text-muted-foreground">Produtos prontos, separados por tamanho</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Button className="h-12 bg-primary hover:bg-primary/90" onClick={() => openMove('entrada')}><ArrowDownToLine className="w-5 h-5 mr-2" /> Entrada</Button>
          <Button className="h-12" variant="outline" onClick={() => openMove('saida')}><ArrowUpFromLine className="w-5 h-5 mr-2" /> Saída</Button>
          <Button className="h-12" variant="outline" onClick={() => setListOpen(true)}><Printer className="w-5 h-5 mr-2" /> Lista de gestão</Button>
          {isLab && <Button className="h-12" variant="outline" onClick={() => openMove('inventario')}><ClipboardList className="w-5 h-5 mr-2" /> Inventário</Button>}
          {isLab && <Button className="h-12" variant="outline" onClick={() => setMinOpen(true)}><Gauge className="w-5 h-5 mr-2" /> Estoque mínimo</Button>}
        </div>
      </div>

      {lowCount > 0 && (
        <button type="button" onClick={() => { setOnlyLow(true); setSizeFilter(''); setSearch(''); }}
                className="w-full flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-left text-red-800 dark:text-red-200">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm"><b>{lowCount}</b> {lowCount === 1 ? 'item está' : 'itens estão'} no estoque mínimo ou abaixo — necessita nova ordem de produção. Toque para ver.</span>
        </button>
      )}

      <Card className="p-4 space-y-3">
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
          <button type="button" onClick={() => setOnlyLow(!onlyLow)}
                  className={`px-4 h-10 rounded-full border-2 text-sm font-semibold whitespace-nowrap transition ${
                    onlyLow ? 'border-red-500 bg-red-500 text-white' : 'border-border hover:border-red-300'}`}>
            Abaixo do mínimo
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? 'produto' : 'produtos'} · {totalUnits} {totalUnits === 1 ? 'unidade' : 'unidades'}{sizeFilter ? ` de ${sizeInfo(sizeFilter).label}` : ''}</p>
      </Card>

      {pendingLists.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Listas de gestão pendentes</h2>
          {pendingLists.map((l) => (
            <div key={l.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm"><b>{listCode(l)}</b> · {l.created_by} · {fmtDateTime(l.created_at)}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => printList(l, data.products)}><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
                  <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setConfirm({ type: 'list', item: l })}><Check className="w-4 h-4 mr-1" /> Confirmar saída</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ type: 'cancelList', item: l })}><X className="w-4 h-4" /></Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{l.items.map((i) => `${i.quantity}× ${i.name} ${i.label}`).join(' · ')}</p>
            </div>
          ))}
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <PackageOpen className="w-10 h-10 mx-auto mb-2" />
          Nenhum produto encontrado{onlyLow ? ' abaixo do mínimo' : ''}.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const anyLow = p.sizes.some((s) => s.low);
            const isOpen = expanded[p.product_id];
            return (
              <Card key={p.product_id} data-testid={`stock-card-${p.product_id}`} className={`p-4 space-y-3 ${anyLow ? 'border-red-300' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-lg leading-tight">{p.name}</h3>
                  {anyLow && <span className="shrink-0 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200 px-2 py-0.5 text-[11px] font-semibold">Estoque baixo</span>}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {p.sizes.map((s) => (
                    <button key={s.size} type="button" onClick={() => openMove('saida', { product_id: p.product_id, size: s.size })}
                            title="Registrar saída"
                            className={`flex flex-col items-center justify-end gap-1 rounded-xl border p-2 h-28 transition hover:shadow ${
                              s.low ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'border-border'} ${
                              highlight === `${p.product_id}:${s.size}` ? 'ring-2 ring-primary' : ''}`}>
                      <StockBottle size={s.size} low={s.low} empty={s.quantity === 0} />
                      <span className={`text-xl font-bold leading-none ${s.low ? 'text-red-600' : ''}`}>{s.quantity}</span>
                      <span className="text-xs font-semibold text-muted-foreground leading-none">{s.label}</span>
                      {s.minimum > 0 && <span className="text-[10px] text-muted-foreground leading-none">mín {s.minimum}</span>}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openMove('entrada', { product_id: p.product_id, size: p.sizes.length === 1 ? p.sizes[0].size : '' })}>
                    <ArrowDownToLine className="w-4 h-4 mr-1" /> Entrada
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded({ ...expanded, [p.product_id]: !isOpen })}>
                    Lotes {isOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                  </Button>
                </div>
                {isOpen && (
                  <div className="text-xs space-y-1 border-t pt-2">
                    {p.sizes.every((s) => s.lots.length === 0) && <p className="text-muted-foreground">Sem unidades em estoque.</p>}
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
                    <span className={m.type === 'saida' ? 'text-orange-600 font-semibold' : 'text-primary font-semibold'}>
                      {m.type === 'saida' ? '▲ Saída' : m.mode === 'inventario' ? '● Inventário' : '▼ Entrada'}
                    </span>{' '}
                    {m.quantity}× {m.product_name} {m.size_label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {batchLabel(m.batch_number)} · {m.operator} · {fmtDateTime(m.created_at)}{m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
                {isLab && !m.cancelled && (
                  <Button size="sm" variant="ghost" title="Estornar" onClick={() => setConfirm({ type: 'undo', item: m })}><Undo2 className="w-4 h-4" /></Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <MovementDialog mode={dialog.mode} open={Boolean(dialog.mode)} onOpenChange={(o) => !o && setDialog({ mode: null, initial: null })}
                      products={data.products} team={team} defaultOperator={defaultOperator} initial={dialog.initial} onDone={load} />
      <MinimumsManager open={minOpen} onOpenChange={setMinOpen} onSaved={load} />
      <ListDialog open={listOpen} onOpenChange={setListOpen} products={data.products} onCreated={load} />
      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScan} />

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'list' ? 'Confirmar saída da lista?' : confirm?.type === 'cancelList' ? 'Cancelar esta lista?' : 'Estornar movimentação?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'list' && `Lista ${listCode(confirm.item)}: ${confirm.item.items.map((i) => `${i.quantity}× ${i.name} ${i.label}`).join(', ')}. Todos os itens saem do estoque agora. Confirme só depois da baldeação.`}
              {confirm?.type === 'cancelList' && 'A lista é descartada. O estoque não muda.'}
              {confirm?.type === 'undo' && confirm?.item && `${confirm.item.quantity}× ${confirm.item.product_name} ${confirm.item.size_label} — o estoque volta como estava antes desta movimentação.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirm} className="bg-primary">Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Estoque;
