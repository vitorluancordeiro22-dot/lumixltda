import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { MessageCircle, Trash2, Copy, Download, Share2 } from 'lucide-react';
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

    let message = '*LOTES LIBERADOS*\n';
    message += `_${new Date().toLocaleDateString('pt-BR')}_\n\n`;

    selectedBatchesData.forEach(batch => {
      const product = products.find(p => p.id === batch.product_id);
      let date;
      if (batch.date.includes('T')) {
        date = batch.date.split('T')[0].split('-').reverse().join('/');
      } else {
        date = batch.date.split('-').reverse().join('/');
      }
      message += `• *${product?.name || 'N/A'}*\n`;
      message += `   Lote: ${batch.batch_number}  |  ${batch.planned_liters}L  |  ${date}\n\n`;
    });

    message += '_Lumix - Gestão de Produção_';
    return message;
  };

  const generateTableImage = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const selectedBatchesData = batches.filter(b => selectedBatches.includes(b.id));
    
    // Configurações da tabela - Design corporativo verde Lumix
    const padding = 50;
    const logoSize = 80;
    const titleMargin = 100;
    const headerHeight = 60;
    const rowHeight = 48;
    const colWidths = [140, 380, 100, 140];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0) + padding * 2;
    const totalHeight = titleMargin + headerHeight + (selectedBatchesData.length * rowHeight) + padding * 2 + 40;
    
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    
    // Fundo branco
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Fundo verde na parte superior (header decorativo)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#21d463');
    gradient.addColorStop(1, '#21be5b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, titleMargin - 20);
    
    // Título corporativo em branco
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillText('LOTES LIBERADOS', padding + 100, padding + 20);
    
    // Subtítulo em branco
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, padding + 100, padding + 42);
    
    // Carregar e desenhar logo
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = 'https://customer-assets.emergentagent.com/job_prodman-lumix/artifacts/aod9p9yw_images.png';
    
    // Logo circle background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(padding + 40, padding + 20, logoSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Cabeçalho da tabela
    const headerY = padding + titleMargin;
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    
    // Fundo gradiente do cabeçalho - Verde
    const headerGradient = ctx.createLinearGradient(padding, headerY, padding, headerY + headerHeight);
    headerGradient.addColorStop(0, '#51e788');
    headerGradient.addColorStop(1, '#3cd674');
    ctx.fillStyle = headerGradient;
    ctx.fillRect(padding, headerY, tableWidth, headerHeight);
    
    // Texto do cabeçalho
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    const headers = ['DATA', 'PRODUTO', 'QTD', 'LOTE'];
    let x = padding;
    headers.forEach((header, i) => {
      ctx.textAlign = 'left';
      ctx.fillText(header, x + 12, headerY + 38);
      x += colWidths[i];
    });
    
    // Linhas da tabela com design corporativo
    selectedBatchesData.forEach((batch, index) => {
      const product = products.find(p => p.id === batch.product_id);
      
      let date;
      if (batch.date.includes('T')) {
        date = batch.date.split('T')[0].split('-').reverse().join('/');
      } else {
        date = batch.date.split('-').reverse().join('/');
      }
      
      const rowY = headerY + headerHeight + (index * rowHeight);
      
      // Fundo alternado com cores verdes suaves
      if (index % 2 === 0) {
        ctx.fillStyle = '#f0fdf4';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fillRect(padding, rowY, tableWidth, rowHeight);
      
      // Bordas horizontais
      ctx.strokeStyle = '#dcfce7';
      ctx.lineWidth = 1;
      ctx.strokeRect(padding, rowY, tableWidth, rowHeight);
      
      // Dados
      ctx.fillStyle = '#1f2937';
      ctx.font = '15px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'left';
      
      let colX = padding;
      const values = [
        date,
        (product?.name || 'N/A').substring(0, 32),
        `${batch.planned_liters}L`,
        batch.batch_number
      ];
      
      values.forEach((value, i) => {
        ctx.fillText(value, colX + 12, rowY + 30);
        colX += colWidths[i];
      });
    });
    
    // Bordas corporativas da tabela - Verde
    ctx.strokeStyle = '#57e78c';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(padding, headerY, tableWidth, headerHeight + (selectedBatchesData.length * rowHeight));
    
    // Rodapé corporativo com linha divisória verde
    ctx.strokeStyle = '#dcfce7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, totalHeight - 35);
    ctx.lineTo(padding + tableWidth, totalHeight - 35);
    ctx.stroke();
    
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(' Lumix - Sistema de Gestão de Produção', padding, totalHeight - 12);
    
    return canvas.toDataURL('image/png');
  };

  const getImageBlob = async () => {
    const res = await fetch(generateTableImage());
    return res.blob();
  };

  const handleShareImage = async () => {
    if (selectedBatches.length === 0) {
      toast.error('Selecione pelo menos um lote');
      return;
    }
    try {
      const blob = await getImageBlob();
      const file = new File([blob], `lotes_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Lotes Liberados', text: 'Lotes Liberados - Lumix' });
      } else {
        handleDownloadImage();
        toast.info('Compartilhamento direto indisponível — imagem baixada.');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return; // usuário cancelou o compartilhamento
      console.error('Erro ao compartilhar:', error);
      handleDownloadImage();
    }
  };

  const handleCopyImage = async () => {
    if (selectedBatches.length === 0) {
      toast.error('Selecione pelo menos um lote');
      return;
    }
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
        throw new Error('clipboard-unsupported');
      }
      // Padrão compatível com Safari/iOS: passar a Promise do blob preserva o gesto do usuário
      const item = new ClipboardItem({ 'image/png': getImageBlob() });
      await navigator.clipboard.write([item]);
      toast.success('✅ Imagem copiada! Cole no WhatsApp');
    } catch (error) {
      console.error('Erro ao copiar imagem:', error);
      toast.info('Cópia não suportada aqui — abrindo compartilhar...');
      handleShareImage();
    }
  };

  const handleCopyText = async () => {
    if (selectedBatches.length === 0) {
      toast.error('Selecione pelo menos um lote');
      return;
    }
    const msg = generateMessage();
    try {
      await navigator.clipboard.writeText(msg);
      toast.success('✅ Texto copiado! Cole no WhatsApp');
    } catch (error) {
      const ta = document.createElement('textarea');
      ta.value = msg;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        toast.success('✅ Texto copiado! Cole no WhatsApp');
      } catch {
        toast.error('Não foi possível copiar o texto.');
      }
      document.body.removeChild(ta);
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

  const handleSendWhatsApp = async () => {
    if (selectedBatches.length === 0) {
      toast.error('Selecione pelo menos um lote');
      return;
    }

    // No celular: usa o compartilhamento nativo (abre WhatsApp com a imagem)
    try {
      const blob = await getImageBlob();
      const file = new File([blob], `lotes_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Lotes Liberados', text: generateMessage() });
        setDialogOpen(false);
        setPhoneNumber('');
        setSelectedBatches([]);
        return;
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }

    // Desktop / sem share: baixa a imagem e abre o WhatsApp
    handleDownloadImage();
    const target = phoneNumber.trim()
      ? `https://wa.me/${phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(generateMessage())}`
      : 'https://web.whatsapp.com';
    setTimeout(() => {
      window.open(target, '_blank');
      toast.info('Anexe a imagem que foi baixada no WhatsApp.');
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
      
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-white">
        <DialogHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-lg px-6 py-4 -mx-6 -mt-6 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-white rounded-full">
              <img 
                src="https://customer-assets.emergentagent.com/job_prodman-lumix/artifacts/aod9p9yw_images.png" 
                alt="Lumix Logo"
                className="w-8 h-8 object-contain"
              />
            </div>
            <div>
              <DialogTitle className="text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Enviar Múltiplos Lotes via WhatsApp
              </DialogTitle>
              <p className="text-xs text-green-100 mt-1">Lumix - Sistema de Gestão de Produção</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 px-6">
          {/* Número de Telefone */}
          <div className="space-y-2 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
            <Label className="text-green-900 font-semibold flex items-center gap-2">
              <span>📱</span> Número de Telefone
            </Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Ex: 5511999999999"
              className="border-green-300 focus:ring-green-500 focus:border-green-500"
            />
            <p className="text-xs text-green-700 font-medium">
              💡 Código do país + DDD + número (sem espaços)
            </p>
          </div>

          {/* Lotes Selecionados */}
          {selectedBatchesData.length > 0 && (
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg border-2 border-green-300">
              <Label className="mb-3 block font-semibold text-green-900 flex items-center gap-2">
                <span>✅</span> Lotes Selecionados ({selectedBatchesData.length})
              </Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedBatchesData.map(batch => {
                  const product = products.find(p => p.id === batch.product_id);
                  
                  let date;
                  if (batch.date.includes('T')) {
                    date = batch.date.split('T')[0].split('-').reverse().join('/');
                  } else {
                    date = batch.date.split('-').reverse().join('/');
                  }
                  
                  return (
                    <div key={batch.id} className="flex items-center justify-between bg-white p-3 rounded-md border-l-4 border-l-green-600 shadow-sm hover:shadow-md transition-shadow">
                      <span className="flex-1 font-mono text-sm text-gray-700">
                        <span className="text-green-600 font-semibold">{date}</span> • <span className="text-emerald-700 font-semibold">{product?.name}</span> • <span className="text-gray-600">{batch.batch_number}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeBatch(batch.id)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview da Imagem */}
          {selectedBatchesData.length > 0 && (
            <div className="p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border-2 border-gray-200">
              <Label className="mb-3 block font-semibold text-gray-900 flex items-center gap-2">
                <span>🖼️</span> Preview da Imagem
              </Label>
              <div className="bg-white p-4 rounded-lg border-2 border-green-200 shadow-md">
                <img 
                  src={generateTableImage()} 
                  alt="Preview da tabela de lotes"
                  className="w-full rounded shadow-lg"
                />
              </div>
              <p className="text-xs text-gray-600 mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                📸 A data mostrada corresponde à data do lote que você selecionou
              </p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button
                  onClick={handleShareImage}
                  className="col-span-2 bg-green-600 hover:bg-green-700 text-white font-semibold"
                  data-testid="share-image-btn"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartilhar (WhatsApp)
                </Button>
                <Button
                  onClick={handleCopyImage}
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-50 font-semibold"
                  data-testid="copy-image-btn"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar Imagem
                </Button>
                <Button
                  onClick={handleCopyText}
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-50 font-semibold"
                  data-testid="copy-text-btn"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar Texto
                </Button>
                <Button
                  onClick={handleDownloadImage}
                  variant="outline"
                  className="col-span-2 border-green-300 text-green-700 hover:bg-green-50 font-semibold"
                  data-testid="download-image-btn"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PNG
                </Button>
              </div>
            </div>
          )}

          {/* Lista de Lotes Disponíveis */}
          <div className="space-y-2">
            <Label className="font-semibold text-gray-900 flex items-center gap-2">
              <span>📋</span> Selecione os Lotes
            </Label>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                <p className="text-muted-foreground ml-2">Carregando lotes...</p>
              </div>
            ) : (
              <div className="border-2 border-green-200 rounded-lg max-h-64 overflow-y-auto shadow-sm bg-white">
                {batches.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <p className="text-sm">Nenhum lote disponível</p>
                  </div>
                ) : (
                  batches.map(batch => {
                    const product = products.find(p => p.id === batch.product_id);
                    
                    let date;
                    if (batch.date.includes('T')) {
                      date = batch.date.split('T')[0].split('-').reverse().join('/');
                    } else {
                      date = batch.date.split('-').reverse().join('/');
                    }
                    
                    const isSelected = selectedBatches.includes(batch.id);
                    
                    return (
                      <div
                        key={batch.id}
                        className={`flex items-center gap-3 p-4 border-b last:border-b-0 cursor-pointer transition-all duration-150 ${
                          isSelected 
                            ? 'bg-green-50 border-l-4 border-l-green-600' 
                            : 'bg-white hover:bg-green-50'
                        }`}
                        onClick={() => toggleBatch(batch.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="cursor-pointer pointer-events-none"
                        />
                        <div className="flex-1">
                          <p className={`font-semibold text-sm ${isSelected ? 'text-green-900' : 'text-gray-900'}`}>
                            {product?.name || 'Produto desconhecido'}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="inline-block mr-4">🔖 Lote: <span className="font-mono font-semibold">{batch.batch_number}</span></span>
                            <span className="inline-block">📅 {date}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">{batch.planned_liters}L</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-3 pt-4 border-t px-6 pb-4 bg-gradient-to-r from-green-50 to-emerald-50">
          <Button
            onClick={() => {
              setDialogOpen(false);
              setPhoneNumber('');
              setSelectedBatches([]);
            }}
            variant="outline"
            className="flex-1 border-green-300 text-gray-700 hover:bg-gray-100"
          >
            ✕ Cancelar
          </Button>
          <Button
            onClick={handleSendWhatsApp}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg"
            disabled={selectedBatches.length === 0}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Enviar WhatsApp ({selectedBatches.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
