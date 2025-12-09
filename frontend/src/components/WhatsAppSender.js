import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export const WhatsAppSender = ({ batch, product, trigger }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  const generateMessage = () => {
    if (!batch || !product) return '';

    return `🏭 *Novo Lote Liberado!*

📦 *Produto:* ${product.name}
🔢 *Lote:* ${batch.batch_number}
📊 *Quantidade:* ${batch.planned_liters} ${batch.unit}
📅 *Data:* ${new Date(batch.date).toLocaleDateString('pt-BR')}

✅ Lote pronto para produção!`;
  };

  const handleSendWhatsApp = () => {
    if (!phoneNumber.trim()) {
      toast.error('Digite um número de telefone ou nome de grupo');
      return;
    }

    // Limpar número (remover caracteres especiais)
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Mensagem final (customizada ou padrão)
    const finalMessage = customMessage.trim() || generateMessage();

    // Criar URL do WhatsApp Web
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(finalMessage)}`;

    // Abrir WhatsApp
    window.open(whatsappUrl, '_blank');

    toast.success('WhatsApp aberto! Confirme o envio.');
    
    // Fechar dialog
    setTimeout(() => {
      setDialogOpen(false);
      setPhoneNumber('');
      setCustomMessage('');
    }, 500);
  };

  React.useEffect(() => {
    if (dialogOpen && !customMessage) {
      setCustomMessage(generateMessage());
    }
  }, [dialogOpen, customMessage]);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger && React.cloneElement(trigger, { onClick: () => setDialogOpen(true) })}
      
      <DialogContent className="bg-card border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            Enviar Mensagem WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-white">Número ou Nome do Grupo *</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="bg-slate-900/50 border-slate-700 text-white"
              placeholder="Ex: 5511999999999 ou Nome do Grupo"
            />
            <p className="text-xs text-slate-400 mt-1">
              Para número: use código do país + DDD + número (sem espaços)
            </p>
            <p className="text-xs text-slate-400">
              Para grupo: digite o nome exato do grupo salvo no WhatsApp
            </p>
          </div>

          <div>
            <Label className="text-white">Mensagem</Label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="bg-slate-900/50 border-slate-700 text-white"
              rows={10}
              placeholder="Edite a mensagem se desejar..."
            />
            <p className="text-xs text-slate-400 mt-1">
              Você pode editar a mensagem antes de enviar
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => {
                setDialogOpen(false);
                setPhoneNumber('');
                setCustomMessage('');
              }}
              variant="outline"
              className="flex-1 border-slate-700 text-white hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendWhatsApp}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Abrir WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
