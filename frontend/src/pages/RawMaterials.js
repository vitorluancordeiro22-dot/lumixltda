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
import { Plus, Edit, Trash2, Boxes, Package, Search, Printer } from 'lucide-react';

export const RawMaterials = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = React.useRef(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [suppliers, setSuppliers] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Litros',
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
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
        toast.error('Erro ao salvar matéria-prima');
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
      
      // Se tem número customizado, enviar
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
        toast.error('Erro ao criar lote');
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
      type: 'Litros', 
      total_stock: '0',
      supplier_id: '',
      received_date: new Date().toISOString().split('T')[0]
    });
  };

  const getSupplierName = (id) => suppliers.find(s => s.id === id)?.name || 'Sem fornecedor';

  // Filtrar matérias-primas pela pesquisa
  const filteredMaterials = materials.filter(material => 
    material.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Matérias-Primas</h1>
          <p className="text-lg text-muted-foreground">Gerencie o estoque de matérias-primas</p>
        </div>
        <div className="flex flex-wrap gap-3">
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
                    <Label className="text-foreground">Estoque Total</Label>
                    <Input type="number" step="0.01" value={formData.total_stock} onChange={(e) => setFormData({...formData, total_stock: e.target.value})} className="bg-input border-border text-foreground" />
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
