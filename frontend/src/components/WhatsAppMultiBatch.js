import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { MessageCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

export const WhatsAppMultiBatch = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dialogOpen) {
      fetchData();
    }
  }, [dialogOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [batchesRes, productsRes] = await Promise.all([
        api.get('/product-batches'),
        api.get('/products')
      ]);
      
      // Ordenar por data (mais recentes primeiro)
      const sortedBatches = batchesRes.data.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      
      setBatches(sortedBatches);
      setProducts(productsRes.data);
    } catch (error) {
      toast.error('Erro ao carregar lotes');
    } finally {
      setLoading(false);
    }
  };

  const toggleBatch = (batchId) => {
    setSelectedBatches(prev => {
      if (prev.includes(batchId)) {
        return prev.filter(id => id !== batchId);
      } else {
        return [...prev, batchId];
      }
    });
  };

  const removeBatch = (batchId) => {
    setSelectedBatches(prev => prev.filter(id => id !== batchId));
  };

  const generateMessage = () => {
    if (selectedBatches.length === 0) return '';

    const selectedBatchesData = batches.filter(b => selectedBatches.includes(b.id));
    
    let message = '*LOTES LIBERADOS*\n\n';
    message += '```\n';
    message += 'DATA       | PRODUTO                    | QTD    | LOTE\n';
    message += '-----------|----------------------------|--------|----------\n';
    
    selectedBatchesData.forEach(batch => {
      const product = products.find(p => p.id === batch.product_id);
      const date = new Date(batch.date).toLocaleDateString('pt-BR');
      const productName = (product?.name || 'N/A').padEnd(26).substring(0, 26);
      const qty = `${batch.planned_liters}L`.padEnd(6);
      
      message += `${date} | ${productName} | ${qty} | ${batch.batch_number}\n`;
    });
    
    message += '```';
    return message;
  };

  const handleSendWhatsApp = () => {
    if (!phoneNumber.trim()) {
      toast.error('Digite um número de telefone');
      return;
    }

    if (selectedBatches.length === 0) {
      toast.error('Selecione pelo menos um lote');
      return;
    }

    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const message = generateMessage();
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
    toast.success('WhatsApp aberto!');
    
    setTimeout(() => {
      setDialogOpen(false);
      setPhoneNumber('');
      setSelectedBatches([]);
    }, 500);
  };

  const selectedBatchesData = batches.filter(b => selectedBatches.includes(b.id));

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button className="bg-green-600 hover:bg-green-700">
          <MessageCircle className="w-4 h-4 mr-2" />
          Enviar Lotes WhatsApp
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            Enviar Múltiplos Lotes via WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Número de Telefone */}
          <div>
            <Label>Número de Telefone *</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Ex: 5511999999999"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Código do país + DDD + número (sem espaços)
            </p>
          </div>

          {/* Lotes Selecionados */}
          {selectedBatchesData.length > 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <Label className="mb-2 block">Lotes Selecionados ({selectedBatchesData.length})</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedBatchesData.map(batch => {
                  const product = products.find(p => p.id === batch.product_id);
                  const date = new Date(batch.date).toLocaleDateString('pt-BR');
                  
                  return (
                    <div key={batch.id} className="flex items-center justify-between bg-background p-2 rounded text-sm">
                      <span className="flex-1 font-mono">
                        {date} • {product?.name} • {batch.batch_number}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeBatch(batch.id)}
                        className="h-6 w-6 p-0 text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview da Mensagem */}
          {selectedBatchesData.length > 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <Label className="mb-2 block">Preview da Mensagem</Label>
              <pre className="text-xs bg-background p-3 rounded whitespace-pre-wrap font-mono">
                {generateMessage()}
              </pre>
            </div>
          )}

          {/* Lista de Lotes Disponíveis */}
          <div>
            <Label className="mb-2 block">Selecione os Lotes</Label>
            {loading ? (
              <p className="text-center py-4 text-muted-foreground">Carregando...</p>
            ) : (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {batches.map(batch => {
                  const product = products.find(p => p.id === batch.product_id);
                  const date = new Date(batch.date).toLocaleDateString('pt-BR');
                  const isSelected = selectedBatches.includes(batch.id);
                  
                  return (
                    <div
                      key={batch.id}
                      className={`flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted cursor-pointer ${
                        isSelected ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => toggleBatch(batch.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleBatch(batch.id)}
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{product?.name || 'Produto desconhecido'}</p>
                        <p className="text-xs text-muted-foreground">
                          Lote: {batch.batch_number} • Data: {date}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={() => {
              setDialogOpen(false);
              setPhoneNumber('');
              setSelectedBatches([]);
            }}
            variant="outline"
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSendWhatsApp}
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={selectedBatches.length === 0 || !phoneNumber.trim()}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Enviar WhatsApp ({selectedBatches.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
