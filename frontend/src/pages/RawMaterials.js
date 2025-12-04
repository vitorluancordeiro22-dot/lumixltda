import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Boxes, Package } from 'lucide-react';

export const RawMaterials = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = React.useRef(true);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'Litros',
    total_stock: '0'
  });
  const [batchFormData, setBatchFormData] = useState({
    raw_material_id: '',
    date: new Date().toISOString().split('T')[0],
    quantity: ''
  });
  const [nextBatchNumber, setNextBatchNumber] = useState('');

  useEffect(() => {
    isMountedRef.current = true;
    fetchMaterials();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      await api.post('/raw-material-batches', {
        ...batchFormData,
        quantity: parseFloat(batchFormData.quantity)
      });
      
      if (isMountedRef.current) {
        setBatchDialogOpen(false);
        setBatchFormData({
          raw_material_id: '',
          date: new Date().toISOString().split('T')[0],
          quantity: ''
        });
        await fetchMaterials();
        toast.success('Lote criado e estoque atualizado!');
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
      total_stock: material.total_stock.toString()
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedMaterial(null);
    setFormData({ name: '', type: 'Litros', total_stock: '0' });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Matérias-Primas</h1>
          <p className="text-lg text-slate-300">Gerencie o estoque de matérias-primas</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="release-material-batch-button" className="bg-amber-600 hover:bg-amber-700">
                <Package className="w-4 h-4 mr-2" />
                Soltar Lote
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader>
                <DialogTitle className="text-white">Soltar Lote de Matéria-Prima</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleBatchSubmit} className="space-y-4">
                <div>
                  <Label className="text-white">Matéria-Prima</Label>
                  <Select value={batchFormData.raw_material_id} onValueChange={(v) => setBatchFormData({...batchFormData, raw_material_id: v})}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {materials.map(m => (
                        <SelectItem key={m.id} value={m.id} className="text-white">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Data</Label>
                  <Input type="date" value={batchFormData.date} onChange={(e) => setBatchFormData({...batchFormData, date: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" />
                </div>
                <div>
                  <Label className="text-white">Quantidade Recebida</Label>
                  <Input type="number" step="0.01" value={batchFormData.quantity} onChange={(e) => setBatchFormData({...batchFormData, quantity: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" required />
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
            <DialogContent className="bg-card border-white/10">
              <DialogHeader>
                <DialogTitle className="text-white">{selectedMaterial ? 'Editar' : 'Nova'} Matéria-Prima</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-white">Nome</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Tipo</Label>
                    <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="Litros" className="text-white">Litros</SelectItem>
                        <SelectItem value="Kg" className="text-white">Kg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white">Estoque Total</Label>
                    <Input type="number" step="0.01" value={formData.total_stock} onChange={(e) => setFormData({...formData, total_stock: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" />
                  </div>
                </div>
                <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {materials.map(material => (
            <Card key={material.id} data-testid={`material-card-${material.id}`} className="p-6 glass-effect border-white/5 hover:border-primary/50 transition-smooth">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{material.name}</h3>
                  <p className="text-sm text-slate-400">{material.type}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(material)} className="text-slate-300 hover:text-white">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(material.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Estoque Atual</p>
                <p className="text-2xl font-bold text-white">{material.total_stock.toFixed(2)} {material.type}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
