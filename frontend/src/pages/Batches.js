import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Edit, Package, Boxes, Calendar, Trash2 } from 'lucide-react';

export const Batches = () => {
  const [productBatches, setProductBatches] = useState([]);
  const [rawMaterialBatches, setRawMaterialBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchType, setBatchType] = useState('product');
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  const [formData, setFormData] = useState({
    batch_number: '',
    date: '',
    unit: '',
    planned_liters: '',
    quantity: ''
  });

  useEffect(() => {
    isMountedRef.current = true;
    fetchAllData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchAllData = async () => {
    try {
      const [prodBatches, rmBatches, prods, rms] = await Promise.all([
        api.get('/product-batches'),
        api.get('/raw-material-batches'),
        api.get('/products'),
        api.get('/raw-materials')
      ]);

      if (isMountedRef.current) {
        setProductBatches(prodBatches.data);
        setRawMaterialBatches(rmBatches.data);
        setProducts(prods.data);
        setRawMaterials(rms.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar lotes');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleEdit = (batch, type) => {
    setBatchType(type);
    setSelectedBatch(batch);
    setFormData({
      batch_number: batch.batch_number,
      date: batch.date,
      unit: batch.unit || '',
      planned_liters: batch.planned_liters?.toString() || '',
      quantity: batch.quantity?.toString() || ''
    });
    setDialogOpen(true);
  };

  const handleDelete = async (batch, type) => {
    if (!window.confirm('Deseja mover este lote para a lixeira?')) return;
    
    try {
      if (type === 'product') {
        await api.delete(`/product-batches/${batch.id}`);
      } else {
        await api.delete(`/raw-material-batches/${batch.id}`);
      }
      
      if (isMountedRef.current) {
        await fetchAllData();
        toast.success('Lote movido para lixeira');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao excluir lote');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const updateData = {
        batch_number: formData.batch_number,
        date: formData.date
      };

      if (batchType === 'product') {
        updateData.unit = formData.unit;
        updateData.planned_liters = parseFloat(formData.planned_liters);
        await api.put(`/product-batches/${selectedBatch.id}`, updateData);
      } else {
        updateData.quantity = parseFloat(formData.quantity);
        await api.put(`/raw-material-batches/${selectedBatch.id}`, updateData);
      }

      if (isMountedRef.current) {
        setDialogOpen(false);
        await fetchAllData();
        toast.success('Lote atualizado com sucesso!');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(error.response?.data?.detail || 'Erro ao atualizar lote');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'N/A';
  const getRawMaterialName = (id) => rawMaterials.find(rm => rm.id === id)?.name || 'N/A';

  const formatBatchNumber = (number) => {
    if (!number || number.length < 7) return number;
    const year = number.substring(0, 2);
    const month = number.substring(2, 4);
    const seq = number.substring(4, 7);
    return `${month}/20${year} - #${seq}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Gerenciar Lotes</h1>
        <p className="text-lg text-slate-300">Visualize e edite todos os lotes de produtos e matérias-primas</p>
      </div>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="products" className="data-[state=active]:bg-primary">
            <Package className="w-4 h-4 mr-2" />
            Lotes de Produtos
          </TabsTrigger>
          <TabsTrigger value="materials" className="data-[state=active]:bg-primary">
            <Boxes className="w-4 h-4 mr-2" />
            Lotes de Matérias-Primas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          {loading ? (
            <div className="text-white">Carregando...</div>
          ) : productBatches.length === 0 ? (
            <Card className="p-12 glass-effect border-white/5 text-center">
              <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Nenhum lote de produto encontrado</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {productBatches.map(batch => (
                <Card key={batch.id} data-testid={`product-batch-${batch.id}`} className="p-6 glass-effect border-white/5 hover:border-primary/50 transition-smooth">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={batch.status === 'em_aberto' ? 'bg-amber-600' : 'bg-emerald-600'}>
                          {batch.status === 'em_aberto' ? 'Em Aberto' : 'Finalizado'}
                        </Badge>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-1">{getProductName(batch.product_id)}</h3>
                      <p className="text-sm text-slate-400">Lote: {batch.batch_number}</p>
                      <p className="text-xs text-slate-500">{formatBatchNumber(batch.batch_number)}</p>
                    </div>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => handleEdit(batch, 'product')}
                      className="text-slate-300 hover:text-white"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Calendar className="w-4 h-4" />
                      {new Date(batch.date).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/50">
                      <p className="text-xs text-slate-400">Planejado / Envasado</p>
                      <p className="text-lg font-bold text-white">
                        {batch.planned_liters}L / {batch.total_bottled}L
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          {loading ? (
            <div className="text-white">Carregando...</div>
          ) : rawMaterialBatches.length === 0 ? (
            <Card className="p-12 glass-effect border-white/5 text-center">
              <Boxes className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Nenhum lote de matéria-prima encontrado</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rawMaterialBatches.map(batch => (
                <Card key={batch.id} data-testid={`rm-batch-${batch.id}`} className="p-6 glass-effect border-white/5 hover:border-primary/50 transition-smooth">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={batch.status === 'em_aberto' ? 'bg-amber-600' : 'bg-emerald-600'}>
                          {batch.status === 'em_aberto' ? 'Em Aberto' : 'Finalizado'}
                        </Badge>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-1">{getRawMaterialName(batch.raw_material_id)}</h3>
                      <p className="text-sm text-slate-400">Lote: {batch.batch_number}</p>
                      <p className="text-xs text-slate-500">{formatBatchNumber(batch.batch_number)}</p>
                    </div>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => handleEdit(batch, 'material')}
                      className="text-slate-300 hover:text-white"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Calendar className="w-4 h-4" />
                      {new Date(batch.date).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/50">
                      <p className="text-xs text-slate-400">Quantidade</p>
                      <p className="text-lg font-bold text-white">{batch.quantity}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Lote</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white">Número do Lote</Label>
              <Input
                value={formData.batch_number}
                onChange={(e) => setFormData({...formData, batch_number: e.target.value})}
                className="bg-slate-900/50 border-slate-700 text-white font-mono text-lg"
                placeholder="AAMMCCC"
                maxLength={7}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Formato: AAMMCCC (ex: 2512001 = Dez/2025 #001)
              </p>
            </div>

            <div>
              <Label className="text-white">Data</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                className="bg-slate-900/50 border-slate-700 text-white"
                required
              />
            </div>

            {batchType === 'product' ? (
              <>
                <div>
                  <Label className="text-white">Unidade</Label>
                  <Input
                    value={formData.unit}
                    onChange={(e) => setFormData({...formData, unit: e.target.value})}
                    className="bg-slate-900/50 border-slate-700 text-white"
                    required
                  />
                </div>
                <div>
                  <Label className="text-white">Litros Planejados</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.planned_liters}
                    onChange={(e) => setFormData({...formData, planned_liters: e.target.value})}
                    className="bg-slate-900/50 border-slate-700 text-white"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <Label className="text-white">Quantidade</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  className="bg-slate-900/50 border-slate-700 text-white"
                  required
                />
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">
              Salvar Alterações
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
