import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Combobox } from '../components/ui/combobox';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Boxes, Package, Search, Printer, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const RawMaterials = () => {
  const [materials, setMaterials] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = React.useRef(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatchesForPrint, setSelectedBatchesForPrint] = useState([]);
  const [batchQuantities, setBatchQuantities] = useState({}); // Armazenar quantidade de etiquetas por lote
  
  // Estados para filtro de datas
  const [dateFilter, setDateFilter] = useState({
    startDate: '',
    endDate: new Date().toISOString().split('T')[0]
  });

  const [filteredBatchesByDate, setFilteredBatchesByDate] = useState([]);
  
  const [suppliers, setSuppliers] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Kg',
    total_stock: '0',
    supplier_id: '',
    received_date: new Date().toISOString().split('T')[0]
  });
  const [batchFormData, setBatchFormData] = useState({
    raw_material_id: '',
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    supplier_batch_number: '',
    expiry_date: '',
    custom_batch_number: ''
  });
  const [nextBatchNumber, setNextBatchNumber] = useState('');
  const [editingBatchNumber, setEditingBatchNumber] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    fetchMaterials();
    fetchSuppliers();
    fetchBatches();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Efeito para filtrar lotes por data
  useEffect(() => {
    filterBatchesByDate();
  }, [batches, dateFilter]);

  const filterBatchesByDate = () => {
    const filtered = batches.filter(batch => {
      const batchDate = new Date(batch.date);
      const start = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
      const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;

      if (start && batchDate < start) return false;
      if (end && batchDate > end) return false;
      
      return true;
    });

    setFilteredBatchesByDate(filtered);
  };

  const fetchBatches = async () => {
    try {
      const response = await api.get('/raw-material-batches');
      if (isMountedRef.current) {
        setBatches(response.data);
      }
    } catch (error) {
      console.error('Error loading batches:', error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/suppliers');
      if (isMountedRef.current) {
        setSuppliers(response.data);
      }
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  };

  const fetchNextBatchNumber = async (date) => {
    try {
      const response = await api.get('/batches/next-number', { params: { date } });
      if (isMountedRef.current) {
        setNextBatchNumber(response.data.batch_number);
      }
    } catch (error) {
      console.error('Error fetching next batch number:', error);
    }
  };

  React.useEffect(() => {
    if (batchDialogOpen && batchFormData.date) {
      fetchNextBatchNumber(batchFormData.date);
    }
  }, [batchDialogOpen, batchFormData.date]);

  const fetchMaterials = async () => {
    try {
      const response = await api.get('/raw-materials');
      if (isMountedRef.current) {
        setMaterials(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar matérias-primas');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    try {
      if (selectedMaterial) {
        await api.put(`/raw-materials/${selectedMaterial.id}`, {
          ...formData,
          total_stock: parseFloat(formData.total_stock)
        });
      } else {
        await api.post('/raw-materials', {
          ...formData,
          total_stock: parseFloat(formData.total_stock)
        });
      }
      
      if (isMountedRef.current) {
        const successMessage = selectedMaterial ? 'Matéria-prima atualizada!' : 'Matéria-prima criada!';
        setDialogOpen(false);
        resetForm();
        await fetchMaterials();
        toast.success(successMessage);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(error.response?.data?.detail || 'Erro ao salvar matéria-prima');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    try {
      const payload = {
        ...batchFormData,
        quantity: parseFloat(batchFormData.quantity)
      };
      
      if (batchFormData.custom_batch_number) {
        payload.custom_batch_number = batchFormData.custom_batch_number;
      }
      
      await api.post('/raw-material-batches', payload);
      
      if (isMountedRef.current) {
        setBatchDialogOpen(false);
        setBatchFormData({
          raw_material_id: '',
          date: new Date().toISOString().split('T')[0],
          quantity: '',
          supplier_batch_number: '',
          expiry_date: '',
          custom_batch_number: ''
        });
        setEditingBatchNumber(false);
        await fetchMaterials();
        toast.success('Lote criado! Próximos lotes seguirão essa sequência.');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(error.response?.data?.detail || 'Erro ao criar lote');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja mover esta matéria-prima para a lixeira?')) return;
    try {
      await api.delete(`/raw-materials/${id}`);
      if (isMountedRef.current) {
        await fetchMaterials();
        toast.success('Matéria-prima movida para lixeira');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao excluir');
      }
    }
  };

  const handleEdit = (material) => {
    setSelectedMaterial(material);
    setFormData({
      name: material.name,
      type: material.type,
      total_stock: material.total_stock.toString(),
      supplier_id: material.supplier_id || '',
      received_date: material.received_date || new Date().toISOString().split('T')[0]
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedMaterial(null);
    setFormData({ 
      name: '', 
      type: 'Kg',
      total_stock: '0',
      supplier_id: '',
      received_date: new Date().toISOString().split('T')[0]
    });
  };

  const getSupplierName = (id) => suppliers.find(s => s.id === id)?.name || 'Sem fornecedor';

  const filteredMaterials = materials.filter(material => 
    material.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleBatchForPrint = (batchId) => {
    setSelectedBatchesForPrint(prev => 
      prev.includes(batchId) 
        ? prev.filter(id => id !== batchId)
        : [...prev, batchId]
    );
    // Inicializar quantidade padrão como 1 se não existir
    if (!batchQuantities[batchId]) {
      setBatchQuantities(prev => ({
        ...prev,
        [batchId]: 1
      }));
    }
  };

  const selectAllBatches = () => {
    if (selectedBatchesForPrint.length === filteredBatchesByDate.length) {
      setSelectedBatchesForPrint([]);
      setBatchQuantities({});
    } else {
      const allIds = filteredBatchesByDate.map(b => b.id);
      setSelectedBatchesForPrint(allIds);
      
      const newQuantities = {};
      allIds.forEach(id => {
        newQuantities[id] = 1;
      });
      setBatchQuantities(newQuantities);
    }
  };

  const updateBatchQuantity = (batchId, quantity) => {
    const qty = Math.max(1, parseInt(quantity) || 1);
    setBatchQuantities(prev => ({
      ...prev,
      [batchId]: qty
    }));
  };

  const handlePrintLabels = () => {
    const selectedBatchData = filteredBatchesByDate.filter(b => selectedBatchesForPrint.includes(b.id));
    
    if (selectedBatchData.length === 0) {
      toast.error('Selecione pelo menos um lote para imprimir');
      return;
    }

    // Criar janela de impressão
    const printWindow = window.open('', '_blank');
    
    // Gerar HTML das etiquetas com repetição baseada na quantidade
    const labelsHtml = selectedBatchData.map(batch => {
      const material = materials.find(m => m.id === batch.raw_material_id);
      const supplier = suppliers.find(s => s.id === material?.supplier_id);
      const quantity = batchQuantities[batch.id] || 1;
      
      const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('pt-BR');
      };

      // Repetir a etiqueta conforme a quantidade selecionada
      let labelHtml = '';
      for (let i = 0; i < quantity; i++) {
        labelHtml += `
          <div class="label">
            <div class="label-name">${material?.name || 'N/A'}</div>
            <div class="label-row"><span class="label-field">DATA:</span> ${formatDate(batch.date)}</div>
            <div class="label-row"><span class="label-field">LOTE:</span> ${batch.batch_number}</div>
            <div class="label-row"><span class="label-field">FORN.:</span> ${supplier?.name || 'N/A'} (${batch.supplier_batch_number || '-'})</div>
            <div class="label-row"><span class="label-field">VALIDADE:</span> ${formatDate(batch.expiry_date)}</div>
          </div>
        `;
      }
      return labelHtml;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiquetas de Matérias-Primas - Lumix</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 10mm; }
          .labels-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 5mm;
          }
          .label {
            border: 1px solid #000;
            padding: 3mm;
            page-break-inside: avoid;
            height: 35mm;
            width: 60mm;
          }
          .label-name {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            margin-bottom: 2mm;
            border-bottom: 1px solid #000;
            padding-bottom: 1mm;
          }
          .label-row {
            font-size: 9pt;
            margin: 1mm 0;
          }
          .label-field {
            font-weight: bold;
          }
          @media print {
            body { padding: 5mm; }
            .label { 
              border: 1px solid #000 !important; 
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="labels-container">
          ${labelsHtml}
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    setPrintDialogOpen(false);
    setSelectedBatchesForPrint([]);
    setBatchQuantities({});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Matérias-Primas</h1>
          <p className="text-lg text-muted-foreground">Gerencie o estoque de matérias-primas</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Botão Imprimir Etiquetas */}
          <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Etiquetas
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  Imprimir Etiquetas de Matérias-Primas
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Filtro por Datas - ALTERADO PARA DEIXAR CLARO QUE É DATA DO LOTE */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <p className="text-sm font-semibold text-foreground mb-3">🗓️ Filtrar Lotes por Data de Registro</p>
                  <p className="text-xs text-muted-foreground mb-3">Selecione o período para filtrar os lotes por data de entrada/criação</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-foreground text-sm font-medium">Data Inicial do Lote</Label>
                      <Input 
                        type="date" 
                        value={dateFilter.startDate}
                        onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})}
                        className="bg-input border-border text-foreground mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Desde quando</p>
                    </div>
                    <div>
                      <Label className="text-foreground text-sm font-medium">Data Final do Lote</Label>
                      <Input 
                        type="date" 
                        value={dateFilter.endDate}
                        onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})}
                        className="bg-input border-border text-foreground mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Até quando</p>
                    </div>
                  </div>
                </div>

                {/* Seleção de Lotes */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Lotes disponíveis: {filteredBatchesByDate.length} ({selectedBatchesForPrint.length} selecionados)
                  </p>
                  <Button variant="outline" size="sm" onClick={selectAllBatches}>
                    {selectedBatchesForPrint.length === filteredBatchesByDate.length && filteredBatchesByDate.length > 0 ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </Button>
                </div>

                <div className="border rounded-lg divide-y max-h-[350px] overflow-y-auto">
                  {filteredBatchesByDate.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum lote encontrado no período selecionado
                    </p>
                  ) : (
                    filteredBatchesByDate.map(batch => {
                      const material = materials.find(m => m.id === batch.raw_material_id);
                      const isSelected = selectedBatchesForPrint.includes(batch.id);
                      const quantity = batchQuantities[batch.id] || 1;
                      
                      return (
                        <div 
                          key={batch.id} 
                          className={`p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                        >
                          <Checkbox 
                            checked={isSelected}
                            onCheckedChange={() => toggleBatchForPrint(batch.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground truncate">{material?.name || 'N/A'}</p>
                            <p className="text-sm text-muted-foreground">
                              Lote: {batch.batch_number} | Data: {new Date(batch.date).toLocaleDateString('pt-BR')}
                              {batch.expiry_date && ` | Val: ${new Date(batch.expiry_date).toLocaleDateString('pt-BR')}`}
                            </p>
                          </div>
                          
                          {/* Seletor de Quantidade */}
                          {isSelected && (
                            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                              <Label className="text-xs text-muted-foreground">Qtd:</Label>
                              <Input
                                type="number"
                                min="1"
                                max="99"
                                value={quantity}
                                onChange={(e) => updateBatchQuantity(batch.id, e.target.value)}
                                className="bg-input border-border text-foreground w-16 h-8 text-center text-sm"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Resumo de Impressão */}
                {selectedBatchesForPrint.length > 0 && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-sm text-blue-900">
                      <span className="font-semibold">Total de etiquetas:</span> {' '}
                      {selectedBatchesForPrint.reduce((total, batchId) => total + (batchQuantities[batchId] || 1), 0)}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setPrintDialogOpen(false);
                      setSelectedBatchesForPrint([]);
                      setBatchQuantities({});
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={handlePrintLabels}
                    disabled={selectedBatchesForPrint.length === 0}
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir ({selectedBatchesForPrint.length} lote{selectedBatchesForPrint.length !== 1 ? 's' : ''})
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="release-material-batch-button" className="bg-amber-600 hover:bg-amber-700">
                <Package className="w-4 h-4 mr-2" />
                Soltar Lote
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Soltar Lote de Matéria-Prima</DialogTitle>
              </DialogHeader>
              {nextBatchNumber && (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">Número do Lote:</p>
                    <Button 
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingBatchNumber(!editingBatchNumber)}
                      className="h-6 text-xs"
                    >
                      {editingBatchNumber ? 'Usar Automático' : 'Editar Sequência'}
                    </Button>
                  </div>
                  
                  {editingBatchNumber ? (
                    <div>
                      <Input
                        value={batchFormData.custom_batch_number || nextBatchNumber}
                        onChange={(e) => setBatchFormData({...batchFormData, custom_batch_number: e.target.value})}
                        placeholder="Ex: 2512015"
                        className="text-lg font-bold"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Digite o número do lote desejado. Os próximos seguirão a partir dele.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-2xl font-bold text-primary">{nextBatchNumber}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {nextBatchNumber.substring(0, 2)}/{nextBatchNumber.substring(2, 4)}/20{nextBatchNumber.substring(0, 2)} - Lote #{nextBatchNumber.substring(4, 7)}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <form onSubmit={handleBatchSubmit} className="space-y-4">
                <div>
                  <Label className="text-foreground">Matéria-Prima</Label>
                  <Combobox
                    options={materials.map(m => ({ value: m.id, label: m.name }))}
                    value={batchFormData.raw_material_id}
                    onChange={(v) => setBatchFormData({...batchFormData, raw_material_id: v})}
                    placeholder="Selecione a matéria-prima"
                    searchPlaceholder="Digite para pesquisar..."
                    emptyText="Nenhuma matéria-prima encontrada"
                  />
                </div>
                <div>
                  <Label className="text-foreground">Data</Label>
                  <Input type="date" value={batchFormData.date} onChange={(e) => setBatchFormData({...batchFormData, date: e.target.value})} className="bg-input border-border text-foreground" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-foreground">Lote do Fornecedor</Label>
                    <Input 
                      value={batchFormData.supplier_batch_number} 
                      onChange={(e) => setBatchFormData({...batchFormData, supplier_batch_number: e.target.value})} 
                      className="bg-input border-border text-foreground"
                      placeholder="Ex: F20241205"
                    />
                  </div>
                  <div>
                    <Label className="text-foreground">Validade</Label>
                    <Input 
                      type="date" 
                      value={batchFormData.expiry_date} 
                      onChange={(e) => setBatchFormData({...batchFormData, expiry_date: e.target.value})} 
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-foreground">Quantidade Recebida</Label>
                  <Input type="number" step="0.01" value={batchFormData.quantity} onChange={(e) => setBatchFormData({...batchFormData, quantity: e.target.value})} className="bg-input border-border text-foreground" required />
                </div>
                <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">Criar Lote</Button>
              </form>
            </DialogContent>
          </Dialog>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="create-material-button" className="bg-primary hover:bg-primary/90 glow-primary">
                <Plus className="w-4 h-4 mr-2" />
                Nova Matéria-Prima
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">{selectedMaterial ? 'Editar' : 'Nova'} Matéria-Prima</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-foreground">Nome</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-input border-border text-foreground" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-foreground">Tipo</Label>
                    <Combobox
                      options={[
                        { value: 'Litros', label: 'Litros' },
                        { value: 'Kg', label: 'Kg' }
                      ]}
                      value={formData.type}
                      onChange={(v) => setFormData({...formData, type: v})}
                      placeholder="Selecione tipo"
                      searchPlaceholder="Pesquisar..."
                    />
                  </div>
                  <div>
                    <Label className="text-foreground">
                      {selectedMaterial ? 'Contagem física atual' : 'Estoque inicial'}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={formData.total_stock}
                      onChange={(e) => setFormData({...formData, total_stock: e.target.value})}
                      disabled={!selectedMaterial}
                      className="bg-input border-border text-foreground"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedMaterial
                        ? 'Digite aqui o saldo que você contou fisicamente. O sistema corrigirá os lotes e registrará o ajuste.'
                        : 'Começa zerado. Registre cada entrada em “Novo Lote de MP”.'}
                    </p>
                  </div>
                </div>
                <div>
                  <Label className="text-foreground">Fornecedor</Label>
                  <Combobox
                    options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                    value={formData.supplier_id}
                    onChange={(v) => setFormData({...formData, supplier_id: v})}
                    placeholder="Selecione o fornecedor"
                    searchPlaceholder="Digite para pesquisar..."
                    emptyText="Nenhum fornecedor encontrado"
                  />
                </div>
                <div>
                  <Label className="text-foreground">Data de Recebimento</Label>
                  <Input type="date" value={formData.received_date} onChange={(e) => setFormData({...formData, received_date: e.target.value})} className="bg-input border-border text-foreground" />
                </div>
                <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {materials.some(material => !material.stock_reconciled_at) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Contagem física necessária</p>
            <p className="text-sm text-muted-foreground">
              Os saldos antigos vieram de cálculos diferentes. Clique no lápis de cada item marcado,
              informe o saldo que existe fisicamente e salve. Depois disso, as entradas e baixas ficam automáticas.
            </p>
          </div>
        </div>
      )}

      {/* Campo de Pesquisa */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          type="text"
          placeholder="Pesquisar matérias-primas..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-12 bg-input border-border text-foreground"
        />
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMaterials.map(material => (
            <Card key={material.id} data-testid={`material-card-${material.id}`} className="p-6 border shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-1">{material.name}</h3>
                  <p className="text-sm text-muted-foreground">{material.type}</p>
                  {material.stock_reconciled_at ? (
                    <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saldo conferido
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Conferir saldo
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(material)} className="text-muted-foreground hover:text-foreground">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(material.id)} className="text-red-600 hover:text-red-500 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {material.supplier_id && (
                  <p className="text-sm text-muted-foreground">
                    <span className="text-muted-foreground/70">Fornecedor:</span> {getSupplierName(material.supplier_id)}
                  </p>
                )}
                {material.received_date && (
                  <p className="text-sm text-muted-foreground">
                    <span className="text-muted-foreground/70">Recebido em:</span> {new Date(material.received_date).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-muted border border-border mt-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Estoque Atual</p>
                <p className="text-2xl font-bold text-foreground">{material.total_stock.toFixed(2)} {material.type}</p>
              </div>
            </Card>
          ))}
          {filteredMaterials.length === 0 && searchTerm && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              Nenhuma matéria-prima encontrada para &ldquo;{searchTerm}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
};
