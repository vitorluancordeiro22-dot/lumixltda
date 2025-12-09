import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

export const ProductionOrders = () => {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = React.useRef(true);
  
  const [formData, setFormData] = useState({
    product_id: '',
    product_batch_id: '',
    date: new Date().toISOString().split('T')[0],
    weigher: '',
    production_size: '',
    materials_used: []
  });

  useEffect(() => {
    isMountedRef.current = true;
    fetchOrders();
    fetchProducts();
    fetchBatches();
    fetchTeamMembers();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await api.get('/production-orders');
      if (isMountedRef.current) {
        setOrders(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar ordens');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const fetchBatches = async () => {
    try {
      const response = await api.get('/product-batches');
      setBatches(response.data);
    } catch (error) {
      console.error('Error loading batches:', error);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await api.get('/team');
      setTeamMembers(response.data);
    } catch (error) {
      console.error('Error loading team:', error);
    }
  };

  const handleProductChange = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setFormData({
        ...formData,
        product_id: productId,
        materials_used: product.recipes.map(r => ({
          raw_material_id: r.raw_material_id,
          quantity: 0
        }))
      });
    }
  };

  const handleProductionSizeChange = (size) => {
    const product = products.find(p => p.id === formData.product_id);
    if (product && size) {
      const materials = product.recipes.map(r => ({
        raw_material_id: r.raw_material_id,
        quantity: parseFloat((r.quantity_per_liter * parseFloat(size)).toFixed(3))
      }));
      setFormData({
        ...formData,
        production_size: size,
        materials_used: materials
      });
    } else {
      setFormData({ ...formData, production_size: size });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    try {
      await api.post('/production-orders', {
        ...formData,
        production_size: parseFloat(formData.production_size)
      });
      
      if (isMountedRef.current) {
        setDialogOpen(false);
        resetForm();
        await fetchOrders();
        toast.success('Ordem criada e estoque descontado!');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao criar ordem');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja mover esta ordem para a lixeira?')) return;
    try {
      await api.delete(`/production-orders/${id}`);
      if (isMountedRef.current) {
        await fetchOrders();
        toast.success('Ordem movida para lixeira');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao excluir');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: '',
      product_batch_id: '',
      date: new Date().toISOString().split('T')[0],
      weigher: '',
      production_size: '',
      materials_used: []
    });
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'N/A';
  const getBatchNumber = (id) => batches.find(b => b.id === id)?.batch_number || 'N/A';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Ordens de Produção</h1>
          <p className="text-lg text-slate-300">Gerencie suas ordens de produção</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="create-order-button" className="bg-primary hover:bg-primary/90 glow-primary">
              <Plus className="w-4 h-4 mr-2" />
              Nova Ordem
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Nova Ordem de Produção</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-foreground">Produto</Label>
                <Select value={formData.product_id} onValueChange={handleProductChange}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-foreground">
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-foreground">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground">Lote do Produto</Label>
                <Select value={formData.product_batch_id} onValueChange={(v) => setFormData({...formData, product_batch_id: v})}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-foreground">
                    <SelectValue placeholder="Selecione o lote" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {batches.filter(b => b.product_id === formData.product_id).map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-foreground">{b.batch_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Data</Label>
                  <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="bg-slate-900/50 border-slate-700 text-foreground" />
                </div>
                <div>
                  <Label className="text-foreground">Tamanho da Produção</Label>
                  <Input type="number" step="0.01" value={formData.production_size} onChange={(e) => handleProductionSizeChange(e.target.value)} className="bg-slate-900/50 border-slate-700 text-foreground" required placeholder="Litros" />
                </div>
              </div>
              <div>
                <Label className="text-foreground">Pesador</Label>
                <Select value={formData.weigher} onValueChange={(v) => setFormData({...formData, weigher: v})}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-foreground">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.name} className="text-foreground">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.materials_used.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-foreground">Matérias-Primas (Cálculo Automático)</Label>
                  <div className="space-y-2 p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                    {formData.materials_used.map((material, idx) => (
                      <div key={idx} className="text-sm text-slate-300">
                        Material {idx + 1}: {material.quantity.toFixed(3)} unidades
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">Criar Ordem</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {orders.map(order => (
            <Card key={order.id} data-testid={`order-card-${order.id}`} className="p-6 glass-effect border-white/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-2">{getProductName(order.product_id)}</h3>
                  <div className="space-y-1 text-sm text-slate-400">
                    <p>Lote: {getBatchNumber(order.product_batch_id)}</p>
                    <p>Data: {new Date(order.date).toLocaleDateString('pt-BR')}</p>
                    <p>Pesador: {order.weigher}</p>
                    <p>Tamanho: {order.production_size} L</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={order.status === 'em_producao' ? 'bg-amber-600' : 'bg-emerald-600'}>
                    {order.status === 'em_producao' ? 'Em Produção' : 'Finalizado'}
                  </Badge>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(order.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
