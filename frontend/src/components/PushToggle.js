import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { BellRing, BellOff, Smartphone } from 'lucide-react';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
};

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const PushToggle = () => {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canUse, setCanUse] = useState(true);

  useEffect(() => {
    if (!supported()) { setCanUse(false); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, []);

  const enable = async () => {
    if (!supported()) { toast.error('Este dispositivo/navegador não suporta notificações push.'); return; }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('Permissão de notificação negada. Ative nas configurações do navegador.');
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { data } = await api.get('/push/vapid-public-key');
      if (!data.publicKey) { toast.error('Chave de push não configurada no servidor.'); setBusy(false); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
      await api.post('/push/subscribe', sub.toJSON());
      setEnabled(true);
      toast.success('Notificações ativadas neste dispositivo!');
    } catch (e) {
      toast.error('Não foi possível ativar as notificações.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', sub.toJSON()).catch(() => {});
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success('Notificações desativadas neste dispositivo.');
    } catch (e) {
      toast.error('Erro ao desativar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lumix-card p-5 flex items-center gap-4" data-testid="push-toggle-card">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${enabled ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}>
        <Smartphone className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900">Notificações no celular</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {!canUse
            ? 'Não suportado neste navegador. No iPhone, use "Adicionar à Tela de Início".'
            : enabled
            ? 'Ativadas — você recebe avisos mesmo com o app fechado.'
            : 'Ative para receber os avisos no celular, mesmo fora do app.'}
        </p>
      </div>
      {canUse && (enabled ? (
        <Button onClick={disable} disabled={busy} variant="outline" className="border-slate-200 text-slate-600 rounded-lg shrink-0" data-testid="push-disable-button">
          <BellOff className="w-4 h-4 mr-2" /> Desativar
        </Button>
      ) : (
        <Button onClick={enable} disabled={busy} className="bg-primary hover:bg-primary-dark text-white rounded-lg shrink-0" data-testid="push-enable-button">
          <BellRing className="w-4 h-4 mr-2" /> {busy ? 'Ativando...' : 'Ativar'}
        </Button>
      ))}
    </div>
  );
};
