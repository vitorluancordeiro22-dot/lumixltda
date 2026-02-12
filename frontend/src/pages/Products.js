import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Combobox } from '../components/ui/combobox';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Package, MessageCircle, Copy, Search, AlertTriangle } from 'lucide-react';
import { ProductFileManager } from '../components/ProductFileManager';
import { WhatsAppSender } from '../components/WhatsAppSender';
import { WhatsAppMultiBatch } from '../components/WhatsAppMultiBatch';
import { ProductPrintButton } from '../components/ProductPrintButton';

export const Products = () => {
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [confirmBatchDialogOpen, setConfirmBatchDialogOpen] = useState(false);
  const [existingBatchInfo, setExistingBatchInfo] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(true);
  
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
    planned_liters: '',
    custom_batch_number: ''
  });
  const [nextBatchNumber, setNextBatchNumber] = useState('');
  const [editingBatchNumber, setEditingBatchNumber] = useState(false);
  const [createdBatch, setCreatedBatch] = useState(null);
  const [batchProduct, setBatchProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    isMountedRef.current = true;
    fetchProducts();
    fetchRawMaterials();
    fetchBatches();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      if (isMountedRef.current) {
        setProducts(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar produtos');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchBatches = async () => {
    try {
      const response = await api.get('/product-batches');
      if (isMountedRef.current) {
        setBatches(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar lotes:', error);
    }
  };

  const fetchRawMaterials = async () => {
    try {
      const response = await api.get('/raw-materials');
      if (isMountedRef.current) {
        setRawMaterials(response.data);
      }
    } catch (error) {
      console.error('Error loading raw materials:', error);
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
      fetchBatches(); // Atualizar lista de lotes ao abrir dialog
    }
  }, [batchDialogOpen, batchFormData.date]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    try {
      if (selectedProduct) {
        await api.put(`/products/${selectedProduct.id}`, {
          ...formData,
          expected_liters: parseFloat(formData.expected_liters)
        });
      } else {
        await api.post('/products', {
          ...formData,
          expected_liters: parseFloat(formData.expected_liters)
        });
      }
      
      if (isMountedRef.current) {
        const successMessage = selectedProduct ? 'Produto atualizado!' : 'Produto criado!';
        setDialogOpen(false);
        resetForm();
        await fetchProducts();
        toast.success(successMessage);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao salvar produto');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  // Verificar se existe lote em aberto do mesmo produto - USANDO BACKEND
  const checkExistingBatch = async (productId) => {
    if (!productId) return null;
    
    try {
      const response = await api.get(`/product-batches/check-open/${productId}`);
      if (response.data.has_open_batch) {
        return response.data.batch;
      }
      return null;
    } catch (error) {
      console.error('Erro ao verificar lote existente:', error);
      return null;
    }
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    if (!batchFormData.product_id) {
      toast.error('Selecione um produto');
      return;
    }
    
    setSubmitting(true);
    
    // Verificar se já existe lote em aberto - USANDO BACKEND
    const existingBatch = await checkExistingBatch(batchFormData.product_id);
    
    if (existingBatch) {
      const product = products.find(p => p.id === batchFormData.product_id);
      setExistingBatchInfo({
        batch: existingBatch,
        productName: product?.name || 'Produto'
      });
      setSubmitting(false);
      // Fechar o Dialog de Soltar Lote ANTES de abrir o AlertDialog
      setBatchDialogOpen(false);
      // Usar timeout para garantir que o Dialog fechou antes de abrir o AlertDialog
      setTimeout(() => {
        setConfirmBatchDialogOpen(true);
      }, 200);
      return;
    }
    
    // Se não existe, criar direto
    await createBatchInternal();
  };

  const createBatchInternal = async () => {
    try {
      const payload = {
        ...batchFormData,
        planned_liters: parseFloat(batchFormData.planned_liters)
      };
      
      // Se tem número customizado, enviar
      if (batchFormData.custom_batch_number) {
        payload.custom_batch_number = batchFormData.custom_batch_number;
      }
      
      const response = await api.post('/product-batches', payload);
      
      if (isMountedRef.current) {
        // Salvar lote e produto para WhatsApp
        const product = products.find(p => p.id === batchFormData.product_id);
        setCreatedBatch(response.data);
        setBatchProduct(product);
        
        setBatchDialogOpen(false);
        setConfirmBatchDialogOpen(false);
        setBatchFormData({
          product_id: '',
          date: new Date().toISOString().split('T')[0],
          unit: 'Litros',
          planned_liters: '',
          custom_batch_number: ''
        });
        setEditingBatchNumber(false);
        setExistingBatchInfo(null);
        fetchBatches(); // Atualizar lista de lotes
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

  const createBatch = async () => {
    if (submitting) return;
    setSubmitting(true);
    await createBatchInternal();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja mover este produto para a lixeira?')) return;
    try {
      await api.delete(`/products/${id}`);
      if (isMountedRef.current) {
        await fetchProducts();
        toast.success('Produto movido para lixeira');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao excluir produto');
      }
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

  const handleDuplicate = (product) => {
    setSelectedProduct(null); // Null para criar novo, não editar
    setFormData({
      name: `${product.name} (Cópia)`,
      unit: product.unit,
      expected_liters: product.expected_liters.toString(),
      recipes: product.recipes ? [...product.recipes] : []
    });
    setDialogOpen(true);
    toast.info('Produto duplicado! Edite o nome e salve.');
  };

  // Filtrar produtos pela pesquisa
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      recipes: [...formData.recipes, { raw_material_id: '', quantity_per_liter: 0, unit: 'L' }]
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Produtos</h1>
          <p className="text-lg text-muted-foreground">Gerencie seus produtos e receitas</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <WhatsAppMultiBatch />
          
          {createdBatch && batchProduct && (
            <WhatsAppSender
              batch={createdBatch}
              product={batchProduct}
              trigger={
                <Button className="bg-green-600 hover:bg-green-700">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Enviar Último Lote
                </Button>
              }
            />
          )}

          <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="release-batch-button" className="bg-amber-600 hover:bg-amber-700">
                <Package className="w-4 h-4 mr-2" />
                Soltar Lote
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Soltar Lote de Produto</DialogTitle>
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
                  <Label className="text-foreground">Produto</Label>
                  <Combobox
                    options={products.map(p => ({ value: p.id, label: p.name }))}
                    value={batchFormData.product_id}
                    onChange={(v) => setBatchFormData({...batchFormData, product_id: v})}
                    placeholder="Selecione o produto"
                    searchPlaceholder="Digite para pesquisar..."
                    emptyText="Nenhum produto encontrado"
                  />
                </div>
                <div>
                  <Label className="text-foreground">Data</Label>
                  <Input type="date" value={batchFormData.date} onChange={(e) => setBatchFormData({...batchFormData, date: e.target.value})} className="bg-input border-border text-foreground" />
                </div>
                <div>
                  <Label className="text-foreground">Unidade</Label>
                  <Combobox
                    options={[
                      { value: 'Litros', label: 'Litros' },
                      { value: 'Kg', label: 'Kg' }
                    ]}
                    value={batchFormData.unit}
                    onChange={(v) => setBatchFormData({...batchFormData, unit: v})}
                    placeholder="Selecione unidade"
                    searchPlaceholder="Pesquisar..."
                  />
                </div>
                <div>
                  <Label className="text-foreground">Litragem Planejada</Label>
                  <Input type="number" step="0.01" value={batchFormData.planned_liters} onChange={(e) => setBatchFormData({...batchFormData, planned_liters: e.target.value})} className="bg-input border-border text-foreground" required />
                </div>
                <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">Criar Lote</Button>
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
            <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-foreground">{selectedProduct ? 'Editar' : 'Novo'} Produto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-foreground">Nome</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-input border-border text-foreground" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-foreground">Unidade</Label>
                    <Combobox
                      options={[
                        { value: 'Litros', label: 'Litros' },
                        { value: 'Kg', label: 'Kg' }
                      ]}
                      value={formData.unit}
                      onChange={(v) => setFormData({...formData, unit: v})}
                      placeholder="Selecione unidade"
                      searchPlaceholder="Pesquisar..."
                    />
                  </div>
                  <div>
                    <Label className="text-foreground">Litros Esperados</Label>
                    <Input type="number" step="0.01" value={formData.expected_liters} onChange={(e) => setFormData({...formData, expected_liters: e.target.value})} className="bg-input border-border text-foreground" required />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground">Receita (Matérias-Primas)</Label>
                    <Button type="button" onClick={addRecipe} size="sm" variant="outline" className="border-border text-foreground">
                      <Plus className="w-4 h-4 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {formData.recipes.map((recipe, index) => (
                    <div key={`recipe-${index}-${recipe.raw_material_id}`} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-foreground text-xs">Matéria-Prima</Label>
                        <Combobox
                          options={rawMaterials.map(rm => ({ value: rm.id, label: rm.name }))}
                          value={recipe.raw_material_id}
                          onChange={(v) => updateRecipe(index, 'raw_material_id', v)}
                          placeholder="Selecione matéria-prima"
                          searchPlaceholder="Digite para pesquisar..."
                          emptyText="Nenhuma matéria-prima encontrada"
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-foreground text-xs">Unidade</Label>
                        <Combobox
                          options={[
                            { value: 'L', label: 'L' },
                            { value: 'Kg', label: 'Kg' }
                          ]}
                          value={recipe.unit || 'L'}
                          onChange={(v) => updateRecipe(index, 'unit', v)}
                          placeholder="Un"
                          searchPlaceholder="Pesquisar..."
                        />
                      </div>
                      <div className="w-32">
                        <Label className="text-foreground text-xs">Qtd. Total</Label>
                        <Input type="number" step="0.001" value={recipe.quantity_per_liter} onChange={(e) => updateRecipe(index, 'quantity_per_liter', e.target.value)} className="bg-input border-border text-foreground" placeholder="Ex: 0.100" />
                      </div>
                      <Button type="button" onClick={() => removeRecipe(index)} size="icon" variant="destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
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
          placeholder="Pesquisar produtos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-12 bg-input border-border text-foreground"
        />
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(product => (
            <Card key={product.id} data-testid={`product-card-${product.id}`} className="p-6 border shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-1">{product.name}</h3>
                  <p className="text-sm text-muted-foreground">{product.unit} • {product.expected_liters}L esperados</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleDuplicate(product)} className="text-muted-foreground hover:text-primary" title="Duplicar">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(product)} className="text-muted-foreground hover:text-foreground" title="Editar">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(product.id)} className="text-red-600 hover:text-red-500 hover:bg-red-50" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {product.recipes && product.recipes.length > 0 && (
                <div className="text-sm text-muted-foreground mb-3">
                  <p className="mb-1">Receita: {product.recipes.length} matéria(s)-prima(s)</p>
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <div className="flex gap-2">
                  <ProductFileManager 
                    product={product} 
                    onUpdate={fetchProducts}
                  />
                  <ProductPrintButton product={product} />
                </div>
              </div>
            </Card>
          ))}
          {filteredProducts.length === 0 && searchTerm && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              Nenhum produto encontrado para &ldquo;{searchTerm}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Dialog de confirmação para lote duplicado */}
      <AlertDialog open={confirmBatchDialogOpen} onOpenChange={setConfirmBatchDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Lote em Aberto Existente
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left">
                {existingBatchInfo && (
                  <>
                    <span className="block mb-3">
                      Já existe um lote em aberto para o produto <strong>{existingBatchInfo.productName}</strong>:
                    </span>
                    <div className="bg-muted p-3 rounded-lg mb-3">
                      <span className="block"><strong>Lote:</strong> {existingBatchInfo.batch.batch_number}</span>
                      <span className="block"><strong>Status:</strong> {existingBatchInfo.batch.status}</span>
                      <span className="block"><strong>Planejado:</strong> {existingBatchInfo.batch.planned_liters}L</span>
                    </div>
                    <span className="block">Deseja criar um novo lote mesmo assim?</span>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setConfirmBatchDialogOpen(false);
              setExistingBatchInfo(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={createBatch} className="bg-primary">
              Sim, Criar Novo Lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
