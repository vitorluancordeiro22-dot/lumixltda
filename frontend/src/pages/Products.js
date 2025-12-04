import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Package } from 'lucide-react';

export const Products = () => {
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    unit: 'Litros',
    expected_liters: '',
    recipes: []
  });
  const [batchFormData, setBatchFormData] = useState({
    product_id: '',
    date: new Date().toISOString().split('T')[0],
    unit: 'Litros',
    planned_liters: ''
  });

  useEffect(() => {
    fetchProducts();
    fetchRawMaterials();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data);
    } catch (error) {
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const fetchRawMaterials = async () => {
    try {
      const response = await api.get('/raw-materials');
      setRawMaterials(response.data);
    } catch (error) {
      console.error('Error loading raw materials:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedProduct) {
        await api.put(`/products/${selectedProduct.id}`, {
          ...formData,
          expected_liters: parseFloat(formData.expected_liters)
        });
        toast.success('Produto atualizado!');
      } else {
        await api.post('/products', {
          ...formData,
          expected_liters: parseFloat(formData.expected_liters)
        });
        toast.success('Produto criado!');
      }
      setDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error) {
      toast.error('Erro ao salvar produto');
    }
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/product-batches', {
        ...batchFormData,
        planned_liters: parseFloat(batchFormData.planned_liters)
      });
      toast.success('Lote criado!');
      setBatchDialogOpen(false);
      setBatchFormData({
        product_id: '',
        date: new Date().toISOString().split('T')[0],
        unit: 'Litros',
        planned_liters: ''
      });
    } catch (error) {
      toast.error('Erro ao criar lote');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja mover este produto para a lixeira?')) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Produto movido para lixeira');
      fetchProducts();
    } catch (error) {
      toast.error('Erro ao excluir produto');
    }
  };

  const handleEdit = (product) => {
    setSelectedProduct(product);
    setFormData({
      name: product.name,
      unit: product.unit,
      expected_liters: product.expected_liters.toString(),
      recipes: product.recipes
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedProduct(null);
    setFormData({
      name: '',
      unit: 'Litros',
      expected_liters: '',
      recipes: []
    });
  };

  const addRecipe = () => {
    setFormData({
      ...formData,
      recipes: [...formData.recipes, { raw_material_id: '', quantity_per_liter: 0 }]
    });
  };

  const updateRecipe = (index, field, value) => {
    const newRecipes = [...formData.recipes];
    newRecipes[index][field] = field === 'quantity_per_liter' ? parseFloat(value) : value;
    setFormData({ ...formData, recipes: newRecipes });
  };

  const removeRecipe = (index) => {
    setFormData({
      ...formData,
      recipes: formData.recipes.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Produtos</h1>
          <p className="text-lg text-slate-300">Gerencie seus produtos e receitas</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="release-batch-button" className="bg-amber-600 hover:bg-amber-700">
                <Package className="w-4 h-4 mr-2" />
                Soltar Lote
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader>
                <DialogTitle className="text-white">Soltar Lote de Produto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleBatchSubmit} className="space-y-4">
                <div>
                  <Label className="text-white">Produto</Label>
                  <Select value={batchFormData.product_id} onValueChange={(v) => setBatchFormData({...batchFormData, product_id: v})}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-white">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Data</Label>
                  <Input type="date" value={batchFormData.date} onChange={(e) => setBatchFormData({...batchFormData, date: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" />
                </div>
                <div>
                  <Label className="text-white">Unidade</Label>
                  <Select value={batchFormData.unit} onValueChange={(v) => setBatchFormData({...batchFormData, unit: v})}>
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
                  <Label className="text-white">Litragem Planejada</Label>
                  <Input type="number" step="0.01" value={batchFormData.planned_liters} onChange={(e) => setBatchFormData({...batchFormData, planned_liters: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" required />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Criar Lote</Button>
              </form>
            </DialogContent>
          </Dialog>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="create-product-button" className="bg-primary hover:bg-primary/90 glow-primary">
                <Plus className="w-4 h-4 mr-2" />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-white">{selectedProduct ? 'Editar' : 'Novo'} Produto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-white">Nome</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Unidade</Label>
                    <Select value={formData.unit} onValueChange={(v) => setFormData({...formData, unit: v})}>
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
                    <Label className="text-white">Litros Esperados</Label>
                    <Input type="number" step="0.01" value={formData.expected_liters} onChange={(e) => setFormData({...formData, expected_liters: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" required />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Receita (Matérias-Primas)</Label>
                    <Button type="button" onClick={addRecipe} size="sm" variant="outline" className="border-slate-700 text-white">
                      <Plus className="w-4 h-4 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {formData.recipes.map((recipe, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-white text-xs">Matéria-Prima</Label>
                        <Select value={recipe.raw_material_id} onValueChange={(v) => updateRecipe(index, 'raw_material_id', v)}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700">
                            {rawMaterials.map(rm => (
                              <SelectItem key={rm.id} value={rm.id} className="text-white">{rm.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32">
                        <Label className="text-white text-xs">Qtd/Litro</Label>
                        <Input type="number" step="0.001" value={recipe.quantity_per_liter} onChange={(e) => updateRecipe(index, 'quantity_per_liter', e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
                      </div>
                      <Button type="button" onClick={() => removeRecipe(index)} size="icon" variant="destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(product => (
            <Card key={product.id} data-testid={`product-card-${product.id}`} className="p-6 glass-effect border-white/5 hover:border-primary/50 transition-smooth">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{product.name}</h3>
                  <p className="text-sm text-slate-400">{product.unit} • {product.expected_liters}L esperados</p>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(product)} className="text-slate-300 hover:text-white">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(product.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {product.recipes && product.recipes.length > 0 && (
                <div className="text-sm text-slate-400">
                  <p className="mb-1">Receita: {product.recipes.length} matéria(s)-prima(s)</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
