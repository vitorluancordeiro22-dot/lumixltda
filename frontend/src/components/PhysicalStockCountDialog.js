import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Combobox } from './ui/combobox';
import { toast } from 'sonner';

const format = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const errorMessage = (error) => typeof error.response?.data?.detail === 'string'
  ? error.response.data.detail : 'Não foi possível concluir a contagem. Confira os dados e tente novamente.';

export function PhysicalStockCountDialog({ open, onOpenChange, materials, onSaved }) {
  const [materialId, setMaterialId] = useState('');
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('Contagem física inicial');
  const [preview, setPreview] = useState(null);
  const [lotCounts, setLotCounts] = useState([]);
  const [requestId, setRequestId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const material = materials.find(item => item.id === materialId);

  useEffect(() => {
    if (!open) return;
    setMaterialId(''); setCounted(''); setPreview(null); setLotCounts([]);
    setConfirmed(false); setHistory([]); setReason('Contagem física inicial');
  }, [open]);

  useEffect(() => {
    setHistory([]);
    if (!open || !materialId) return;
    let active = true;
    api.get(`/raw-materials/${materialId}/stock-counts`).then(response => {
      if (active) setHistory(response.data);
    }).catch(() => { if (active) toast.error('Não foi possível carregar o histórico de contagens'); });
    return () => { active = false; };
  }, [open, materialId]);

  const clearPreview = () => { setPreview(null); setLotCounts([]); setConfirmed(false); };
  const numericCount = counted === '' ? NaN : Number(counted);
  const validCount = Number.isFinite(numericCount) && numericCount >= 0;
  const allocated = lotCounts.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const unassigned = preview ? Math.round((preview.counted_stock - allocated) * 1e6) / 1e6 : 0;
  const validLots = lotCounts.every(row => row.quantity !== '' && Number.isFinite(Number(row.quantity)) && Number(row.quantity) >= 0);

  const prepare = async (event) => {
    event.preventDefault();
    if (!material || !validCount || reason.trim().length < 3 || busy) return;
    setBusy(true); clearPreview();
    try {
      const response = await api.post(`/raw-materials/${materialId}/physical-count/preview`, { counted_stock: numericCount });
      setPreview(response.data);
      setLotCounts(response.data.lot_changes.map(row => ({ batch_id: row.batch_id, quantity: String(row.after) })));
      setRequestId(crypto.randomUUID());
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (busy || !confirmed || !preview || !validLots || unassigned < 0) return;
    setBusy(true);
    try {
      const response = await api.post(`/raw-materials/${materialId}/physical-count`, {
        counted_stock: preview.counted_stock, reason: reason.trim(),
        expected_version: preview.expected_version, request_id: requestId,
        lot_counts: lotCounts.map(row => ({ batch_id: row.batch_id, quantity: Number(row.quantity) })),
        confirmed: true,
      });
      setHistory(previous => [response.data, ...previous.filter(item => item.id !== response.data.id)]);
      clearPreview(); setCounted('');
      toast.success(`Contagem registrada: ${format(response.data.counted_stock)} ${response.data.unit}`);
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
      if ([400, 409].includes(error.response?.status)) clearPreview();
      if (error.response?.status === 409) { setCounted(''); await onSaved(); }
      // Em erro de rede, manter a mesma chave de confirmação para que uma
      // repetição consulte o ajuste já salvo em vez de gravá-lo de novo.
    } finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="physical-stock-count-dialog">
      <DialogHeader><DialogTitle>Contagem física de matéria-prima</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Informe o saldo disponível que você contou. Esta é uma correção do saldo atual, não um novo recebimento. Combine uma pausa nos lançamentos de entrada e produção enquanto conta; retome depois de confirmar o ajuste.</p>
      <form onSubmit={prepare} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <div><Label>Matéria-prima</Label>
            <Combobox options={materials.map(item => ({ value: item.id, label: `${item.name} (${item.type})` }))}
              value={materialId} onChange={value => { setMaterialId(value); setCounted(''); clearPreview(); }} placeholder="Selecione a matéria-prima" searchPlaceholder="Pesquisar matéria-prima" />
          </div>
          {material && <p className="text-sm">Saldo cadastrado: <strong>{format(material.total_stock)} {material.type}</strong></p>}
          <div><Label htmlFor="physical-count-value">Saldo contado {material ? `(${material.type})` : ''}</Label>
            <Input id="physical-count-value" type="number" min="0" step="0.000001" required value={counted}
              onChange={event => { setCounted(event.target.value); clearPreview(); }} placeholder="Ex.: 100" />
          </div>
          <div><Label htmlFor="physical-count-reason">Motivo</Label>
            <Input id="physical-count-reason" value={reason} minLength={3} maxLength={500} required
              onChange={event => { setReason(event.target.value); setConfirmed(false); }} />
          </div>
          <Button type="submit" disabled={busy || !material || !validCount || reason.trim().length < 3}>{busy ? 'Aguarde...' : 'Conferir ajuste'}</Button>
        </fieldset>
      </form>
      {preview && <div className="space-y-4 border-t border-border pt-4" data-testid="physical-count-preview">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>Cadastrado<strong className="block">{format(preview.before_total)} {preview.unit}</strong></div>
          <div>Nos lotes<strong className="block">{format(preview.before_lots_total)} {preview.unit}</strong></div>
          <div>Após confirmar<strong className="block">{format(preview.counted_stock)} {preview.unit}</strong></div>
        </div>
        <p className="text-sm text-muted-foreground">Confira como o saldo ficará distribuído entre os lotes. Você pode corrigir cada quantidade abaixo. A sugestão reduz os lotes mais recentes primeiro; confirme conforme o que você encontrou fisicamente.</p>
        {preview.lot_changes.length > 0 && <div className="overflow-x-auto max-h-64"><table className="w-full text-sm text-left">
          <thead><tr><th className="p-2">Lote interno / fornecedor</th><th className="p-2">Antes</th><th className="p-2">Contado no lote</th></tr></thead>
          <tbody>{preview.lot_changes.map((lot, index) => <tr key={lot.batch_id} className="border-t border-border">
            <td className="p-2">{lot.batch_number}{lot.supplier_batch_number && <span className="block text-xs text-muted-foreground">{lot.supplier_batch_number}</span>}</td>
            <td className="p-2">{format(lot.before)} {preview.unit}</td>
            <td className="p-2"><Input type="number" min="0" step="0.000001" disabled={busy} aria-label={`Saldo contado do lote ${lot.batch_number}`}
              value={lotCounts[index]?.quantity ?? ''} onChange={event => {
                setLotCounts(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row)); setConfirmed(false);
              }} /></td>
          </tr>)}</tbody>
        </table></div>}
        {unassigned > 0 && <p className="text-sm">{format(unassigned)} {preview.unit} ficarão identificados em um lote de ajuste por contagem, sem fornecedor atribuído. Se souber a quais lotes esse saldo pertence, ajuste as linhas acima.</p>}
        {(unassigned < 0 || !validLots) && <p role="alert" className="text-sm text-red-600">As quantidades por lote precisam ser válidas e não podem somar mais que o saldo contado.</p>}
        <div className="flex items-start gap-2">
          <Checkbox id="physical-count-confirm" checked={confirmed} disabled={busy} onCheckedChange={value => setConfirmed(value === true)} />
          <Label htmlFor="physical-count-confirm" className="text-sm leading-relaxed">Conferi o saldo de {format(preview.counted_stock)} {preview.unit} e sua distribuição nos lotes. Quero registrar esse ajuste, preservando os valores anteriores no histórico.</Label>
        </div>
        <Button type="button" onClick={save} disabled={busy || !confirmed || !validLots || unassigned < 0}>{busy ? 'Registrando...' : 'Confirmar contagem física'}</Button>
      </div>}
      {history.length > 0 && <section className="border-t border-border pt-4 space-y-2">
        <h3 className="font-semibold">Últimas contagens</h3>
        {history.map(item => <div key={item.id} className="text-sm border border-border rounded-md p-3">
          <p>{format(item.before_total)} → <strong>{format(item.counted_stock)} {item.unit}</strong> · {item.status === 'applied' ? 'Registrada' : item.status === 'failed' ? 'Não aplicada' : 'Pendente de conferência'}</p>
          <p className="text-muted-foreground">{item.reason} · {item.created_by_name || item.created_by_email} · {new Date(item.created_at).toLocaleString('pt-BR')}</p>
        </div>)}
      </section>}
    </DialogContent>
  </Dialog>;
}
