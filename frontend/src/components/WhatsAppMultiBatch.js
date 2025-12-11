import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { MessageCircle, Trash2, Copy, Download } from 'lucide-react';
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

  const generateTableImage = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Configurações da tabela
    const padding = 40;
    const headerHeight = 80;
    const rowHeight = 50;
    const colWidths = [180, 400, 120, 150]; // DATA, PRODUTO, QTD, LOTE
    const totalWidth = colWidths.reduce((a, b) => a + b, 0) + padding * 2;
    const totalHeight = headerHeight + (selectedBatchesData.length * rowHeight) + padding * 2;
    
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    
    // Fundo branco
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Título
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('LOTES LIBERADOS', padding, 50);
    
    // Cabeçalho da tabela
    let x = padding;
    const headerY = headerHeight + padding;
    
    // Fundo do cabeçalho
    ctx.fillStyle = '#0EA5E9';
    ctx.fillRect(x, headerY, colWidths.reduce((a, b) => a + b, 0), rowHeight);
    
    // Texto do cabeçalho
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial';
    const headers = ['DATA', 'PRODUTO', 'QTD', 'LOTE'];
    headers.forEach((header, i) => {
      ctx.fillText(header, x + 15, headerY + 32);
      x += colWidths[i];
    });
    
    // Linhas da tabela
    selectedBatchesData.forEach((batch, index) => {
      const product = products.find(p => p.id === batch.product_id);
      const date = new Date(batch.date).toLocaleDateString('pt-BR');
      const rowY = headerY + rowHeight + (index * rowHeight);
      
      // Fundo alternado
      ctx.fillStyle = index % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      ctx.fillRect(padding, rowY, colWidths.reduce((a, b) => a + b, 0), rowHeight);
      
      // Bordas
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.strokeRect(padding, rowY, colWidths.reduce((a, b) => a + b, 0), rowHeight);
      
      // Dados
      ctx.fillStyle = '#1E293B';
      ctx.font = '16px Arial';
      
      let colX = padding;
      const values = [
        date,
        (product?.name || 'N/A').substring(0, 35),
        `${batch.planned_liters}L`,
        batch.batch_number
      ];
      
      values.forEach((value, i) => {
        ctx.fillText(value, colX + 15, rowY + 32);
        colX += colWidths[i];
      });
    });
    
    // Bordas da tabela
    ctx.strokeStyle = '#0EA5E9';
    ctx.lineWidth = 3;
    ctx.strokeRect(padding, headerY, colWidths.reduce((a, b) => a + b, 0), rowHeight + (selectedBatchesData.length * rowHeight));
    
    return canvas.toDataURL('image/png');
  };

  const handleCopyImage = async () => {
    if (selectedBatches.length === 0) {
      toast.error('Selecione pelo menos um lote');
      return;
    }

    try {
      const imageData = generateTableImage();
      
      // Converter base64 para blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      
      // Copiar para área de transferência
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);
      
      toast.success('✅ Imagem copiada! Cole no WhatsApp (Ctrl+V)');
    } catch (error) {
      console.error('Erro ao copiar:', error);
      toast.error('Erro ao copiar imagem. Use o botão de baixar.');
    }
  };

  const handleDownloadImage = () => {
    if (selectedBatches.length === 0) {
      toast.error('Selecione pelo menos um lote');
      return;
    }

    const imageData = generateTableImage();
    const link = document.createElement('a');
    link.download = `lotes_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.png`;
    link.href = imageData;
    link.click();
    
    toast.success('Imagem baixada! Agora envie pelo WhatsApp');
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

    // Baixar a imagem primeiro
    handleDownloadImage();
    
    // Abrir WhatsApp
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanNumber}`;
    
    setTimeout(() => {
      window.open(whatsappUrl, '_blank');
      toast.info('Envie a imagem que foi baixada!');
      
      setTimeout(() => {
        setDialogOpen(false);
        setPhoneNumber('');
        setSelectedBatches([]);
      }, 1000);
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

          {/* Preview da Imagem */}
          {selectedBatchesData.length > 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <Label className="mb-2 block">Preview da Imagem</Label>
              <div className="bg-white p-3 rounded border border-border">
                <img 
                  src={generateTableImage()} 
                  alt="Preview da tabela de lotes"
                  className="w-full rounded shadow-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                📸 A DATA mostrada é a data que você escolheu no lote (não a data de criação)
              </p>
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={handleCopyImage}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
                <Button
                  onClick={handleDownloadImage}
                  variant="outline"
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar
                </Button>
              </div>
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
            Baixar Imagem e Abrir WhatsApp ({selectedBatches.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
