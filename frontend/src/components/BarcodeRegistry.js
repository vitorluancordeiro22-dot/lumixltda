import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { Barcode, Camera, Check, Search, Trash2 } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { StockBottle } from './StockBottle';
import { errorMessage } from '../lib/stockSizes';

const Row = ({ product, s, onSaved, onScan }) => {
  const [code, setCode] = useState(s.barcode || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setCode(s.barcode || ''), [s.barcode]);
  const dirty = code.trim() !== (s.barcode || '');

  const save = async (value = code) => {
    setSaving(true);
    try {
      await api.put('/finished-stock/barcodes', { product_id: product.product_id, size: s.size, code: value.trim() });
      toast.success(value.trim() ? `Código salvo: ${product.name} ${s.label}` : 'Código removido');
      onSaved();
    } catch (e) { toast.error(errorMessage(e, 'Erro ao salvar código')); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="w-12 flex flex-col items-center shrink-0">
        <StockBottle size={s.size} />
        <span className="text-xs font-bold">{s.label}</span>
      </div>
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Sem código" inputMode="numeric"
             onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }} className="h-10" />
      <Button type="button" size="icon" variant="outline" className="shrink-0" title="Ler com a câmera"
              onClick={() => onScan((value) => { setCode(value); save(value); })}>
        <Camera className="w-4 h-4" />
      </Button>
      {dirty ? (
        <Button type="button" size="icon" className="shrink-0 bg-primary" disabled={saving} onClick={() => save()} title="Salvar"><Check className="w-4 h-4" /></Button>
      ) : s.barcode ? (
        <Button type="button" size="icon" variant="ghost" className="shrink-0" disabled={saving} onClick={() => save('')} title="Remover"><Trash2 className="w-4 h-4" /></Button>
      ) : <span className="w-10 shrink-0" />}
    </div>
  );
};

export const BarcodeRegistry = () => {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [scanTarget, setScanTarget] = useState(null);

  const load = useCallback(() => {
    api.get('/finished-stock/overview').then((r) => setProducts(r.data.products)).catch((e) => toast.error(errorMessage(e, 'Erro ao carregar produtos')));
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const total = products.reduce((a, p) => a + p.sizes.length, 0);
  const done = products.reduce((a, p) => a + p.sizes.filter((s) => s.barcode).length, 0);
  const visible = useMemo(() => products
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .map((p) => ({ ...p, sizes: onlyMissing ? p.sizes.filter((s) => !s.barcode) : p.sizes }))
    .filter((p) => p.sizes.length), [products, search, onlyMissing]);

  const onDetected = useCallback((code) => {
    const target = scanTarget;
    setScanTarget(null);
    if (target) target(code);
  }, [scanTarget]);

  return (
    <>
      <Card className="p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Barcode className="w-6 h-6" />
          <div>
            <h3 className="font-bold">Códigos de barras</h3>
            <p className="text-sm text-muted-foreground">Cadastre o código de cada produto e tamanho para usar a câmera no Estoque</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>Registrar códigos</Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Barcode className="w-5 h-5" /> Registrar códigos de barras</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{done} de {total} cadastrados. Os tamanhos de cada produto são definidos em Produtos → Editar.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar produto" className="pl-9" />
            </div>
            <Button variant={onlyMissing ? 'default' : 'outline'} onClick={() => setOnlyMissing(!onlyMissing)}>Faltando</Button>
          </div>
          <div className="space-y-3">
            {visible.map((p) => (
              <div key={p.product_id} className="rounded-lg border px-3 py-2">
                <p className="font-semibold">{p.name}</p>
                <div className="divide-y">
                  {p.sizes.map((s) => <Row key={s.size} product={p} s={s} onSaved={load} onScan={(fn) => setScanTarget(() => fn)} />)}
                </div>
              </div>
            ))}
            {visible.length === 0 && <p className="text-sm text-muted-foreground">Nada encontrado.</p>}
          </div>
        </DialogContent>
      </Dialog>
      <BarcodeScanner open={Boolean(scanTarget)} onOpenChange={(o) => !o && setScanTarget(null)} onDetected={onDetected} />
    </>
  );
};
