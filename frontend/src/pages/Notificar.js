import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { Bell, Plus, Trash2, Package } from 'lucide-react';
import { PushToggle } from '../components/PushToggle';

const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

export const Notificar = () => {
  const [products, setProducts] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [productName, setProductName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchNotifs = useCallback(async () => {
    try { const r = await api.get('/notifications'); setNotifs(r.data); } catch { toast.error('Erro ao carregar notificações'); }
  }, []);

  useEffect(() => {
    api.get('/products').then((r) => setProducts(r.data)).catch(() => {});
    fetchNotifs();
  }, [fetchNotifs]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!productName.trim()) { toast.error('Informe o produto'); return; }
    setSubmitting(true);
    try {
      await api.post('/notifications', { product_name: productName.trim(), message: message.trim() });
      toast.success('Notificação enviada a todos os usuários!');
      setProductName(''); setMessage('');
      fetchNotifs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar notificação');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/notifications/${deleteTarget.id}`);
      toast.success('Notificação removida');
      setDeleteTarget(null);
      fetchNotifs();
    } catch { toast.error('Erro ao remover'); }
  };

  return (
    <div className="space-y-7" data-testid="notificar-page">
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-1">Avisos internos</p>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">Notificar equipe</h1>
        <p className="text-sm font-medium text-slate-500 mt-1">Crie um aviso rápido — ele aparece no sino de notificações de todos os usuários.</p>
      </div>

      <PushToggle />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Formulário */}
        <div className="lumix-card p-6 lg:col-span-2 h-fit">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Plus className="w-5 h-5 text-primary" /></div>
            <h2 className="text-base font-bold text-slate-900">Nova notificação</h2>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label className="text-slate-700">Produto</Label>
              <Input
                list="product-options"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Ex: Detergente Neutro"
                className="bg-white border-slate-200 text-slate-800"
                data-testid="notif-product-input"
              />
              <datalist id="product-options">
                {products.map((p) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
            <div>
              <Label className="text-slate-700">Observação</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex: produto com pouco estoque / necessita de um novo lote"
                rows={3}
                className="bg-white border-slate-200 text-slate-800"
                data-testid="notif-message-input"
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary-dark text-white rounded-lg font-medium" data-testid="notif-submit-button">
              <Bell className="w-4 h-4 mr-2" /> Notificar todos
            </Button>
          </form>
        </div>

        {/* Lista */}
        <div className="lg:col-span-3 space-y-3">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Notificações ativas ({notifs.length})</h2>
          {notifs.length === 0 ? (
            <div className="lumix-card p-8 text-center text-slate-400 text-sm">Nenhuma notificação ativa.</div>
          ) : (
            notifs.map((n) => (
              <div key={n.id} data-testid={`notif-item-${n.id}`} className="lumix-card p-5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{n.product_name}</p>
                  {n.message && <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>}
                  <p className="text-[11px] text-slate-400 mt-1.5">{n.created_by} • {fmtDateTime(n.created_at)}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(n)} className="text-red-600 hover:text-red-500 shrink-0" data-testid={`notif-delete-${n.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="delete-notif-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover notificação?</AlertDialogTitle>
            <AlertDialogDescription>Ela deixará de aparecer para todos os usuários.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="notif-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" data-testid="notif-delete-confirm">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
