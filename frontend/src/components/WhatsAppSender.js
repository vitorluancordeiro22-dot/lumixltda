import React, { useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export const WhatsAppSender = ({ batch, product, trigger }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  const generateMessage = React.useCallback(() => {
    if (!batch || !product) return '';

    const date = new Date(batch.date).toLocaleDateString('pt-BR');
    return `DATA ${date}     PRODUTO: ${product.name}     LOTE: ${batch.batch_number}`;
  }, [batch, product]);

  const handleSendWhatsApp = () => {
    // Mensagem final (customizada ou padrão)
    const finalMessage = customMessage.trim() || generateMessage();

    // Abre o WhatsApp com a mensagem pronta; a pessoa escolhe a conversa ou o grupo lá dentro
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(finalMessage)}`;

    // Abrir WhatsApp
    window.open(whatsappUrl, '_blank');

    toast.success('WhatsApp aberto! Escolha a conversa e confirme o envio.');
    
    // Fechar dialog
    setTimeout(() => {
      setDialogOpen(false);
      setCustomMessage('');
    }, 500);
  };

  React.useEffect(() => {
    if (dialogOpen && !customMessage) {
      setCustomMessage(generateMessage());
    }
  }, [dialogOpen, customMessage, generateMessage]);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger && React.cloneElement(trigger, { onClick: () => setDialogOpen(true) })}
      
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            Enviar Mensagem WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-foreground">Mensagem</Label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="bg-input border-border text-foreground"
              rows={10}
              placeholder="Edite a mensagem se desejar..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Você pode editar a mensagem antes de enviar
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => {
                setDialogOpen(false);
                setCustomMessage('');
              }}
              variant="outline"
              className="flex-1 border-border text-foreground hover:bg-muted"
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
