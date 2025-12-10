import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Package, Beaker, Eye, Calendar, Building2, Clock, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export const BatchManagement = () => {
  const [productBatches, setProductBatches] = useState([]);
  const [rmBatches, setRmBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [batchType, setBatchType] = useState('product'); // 'product' ou 'raw_material'
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [prodBatches, rmBatches, prods, rms] = await Promise.all([
        api.get('/product-batches'),
        api.get('/raw-material-batches'),
        api.get('/products'),
        api.get('/raw-materials')
      ]);
      
      if (isMountedRef.current) {
        setProductBatches(prodBatches.data);
        setRmBatches(rmBatches.data);
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

  const viewProductBatchDetails = async (batch) => {
    setBatchType('product');
    const product = products.find(p => p.id === batch.product_id);
    
    // Buscar informações completas das matérias-primas
    const recipesWithDetails = [];
    if (product && product.recipes) {
      for (const recipe of product.recipes) {
        const rm = rawMaterials.find(r => r.id === recipe.raw_material_id);
        if (rm) {
          // Buscar lotes desta matéria-prima
          const rmBatchesForThis = rmBatches.filter(
            rmb => rmb.raw_material_id === rm.id && rmb.quantity > 0
          ).sort((a, b) => new Date(b.date) - new Date(a.date));

          recipesWithDetails.push({
            ...recipe,
            raw_material: rm,
            quantity_needed: recipe.quantity_per_liter * batch.planned_liters,
            batches: rmBatchesForThis
          });
        }
      }
    }

    setSelectedBatch({
      ...batch,
      product,
      recipes: recipesWithDetails
    });
    setDetailsOpen(true);
  };

  const viewRawMaterialBatchDetails = (batch) => {
    setBatchType('raw_material');
    const rawMaterial = rawMaterials.find(rm => rm.id === batch.raw_material_id);
    
    setSelectedBatch({
      ...batch,
      raw_material: rawMaterial
    });
    setDetailsOpen(true);
  };

  const openEditDialog = (batch, type) => {
    setBatchType(type);
    setEditFormData({
      id: batch.id,
      batch_number: batch.batch_number,
      date: batch.date,
      planned_liters: batch.planned_liters || 0,
      quantity: batch.quantity || 0,
      supplier_batch_number: batch.supplier_batch_number || '',
      expiry_date: batch.expiry_date || ''
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const endpoint = batchType === 'product' 
        ? `/product-batches/${editFormData.id}`
        : `/raw-material-batches/${editFormData.id}`;

      const payload = batchType === 'product'
        ? {
            batch_number: editFormData.batch_number,
            date: editFormData.date,
            planned_liters: parseFloat(editFormData.planned_liters)
          }
        : {
            batch_number: editFormData.batch_number,
            date: editFormData.date,
            quantity: parseFloat(editFormData.quantity),
            supplier_batch_number: editFormData.supplier_batch_number,
            expiry_date: editFormData.expiry_date
          };

      await api.put(endpoint, payload);
      
      if (isMountedRef.current) {
        toast.success('Lote atualizado com sucesso!');
        setEditOpen(false);
        await fetchData();
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

  const handleDelete = async (batch, type) => {
    if (!window.confirm(`Tem certeza que deseja excluir o lote ${batch.batch_number}?`)) {
      return;
    }

    try {
      const endpoint = type === 'product' 
        ? `/product-batches/${batch.id}`
        : `/raw-material-batches/${batch.id}`;

      await api.delete(endpoint);
      
      if (isMountedRef.current) {
        toast.success('Lote excluído com sucesso!');
        await fetchData();
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(error.response?.data?.detail || 'Erro ao excluir lote');
      }
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'em_aberto': { label: 'Em Aberto', className: 'bg-blue-500' },
      'em_producao': { label: 'Em Produção', className: 'bg-yellow-500' },
      'concluido': { label: 'Concluído', className: 'bg-green-500' },
      'cancelado': { label: 'Cancelado', className: 'bg-red-500' }
    };
    const config = statusMap[status] || { label: status, className: 'bg-gray-500' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Gerenciar Lotes</h1>
        <p className="text-lg text-muted-foreground">Visualize detalhes de todos os lotes</p>
      </div>

      {loading ? (
        <div className="text-center py-12">Carregando...</div>
      ) : (
        <div className="space-y-8">
          {/* Lotes de Produtos */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Lotes de Produtos</h2>
              <Badge variant="outline">{productBatches.length}</Badge>
            </div>
            
            {productBatches.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Nenhum lote de produto cadastrado</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {productBatches.map(batch => {
                  const product = products.find(p => p.id === batch.product_id);
                  return (
                    <Card key={batch.id} className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Lote</p>
                          <p className="text-2xl font-bold text-primary">{batch.batch_number}</p>
                        </div>
                        {getStatusBadge(batch.status)}
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <p className="font-semibold text-foreground">{product?.name || 'Produto desconhecido'}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {new Date(batch.date).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Planejado: </span>
                          <span className="font-semibold text-foreground">{batch.planned_liters} {batch.unit}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          onClick={() => viewProductBatchDetails(batch)}
                          className="flex-1"
                          variant="outline"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Ver Detalhes
                        </Button>
                        <Button 
                          onClick={() => openEditDialog(batch, 'product')}
                          size="icon"
                          variant="outline"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lotes de Matérias-Primas */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Beaker className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Lotes de Matérias-Primas</h2>
              <Badge variant="outline">{rmBatches.length}</Badge>
            </div>
            
            {rmBatches.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Nenhum lote de matéria-prima cadastrado</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rmBatches.map(batch => {
                  const rm = rawMaterials.find(r => r.id === batch.raw_material_id);
                  return (
                    <Card key={batch.id} className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Lote</p>
                          <p className="text-2xl font-bold text-primary">{batch.batch_number}</p>
                        </div>
                        {getStatusBadge(batch.status)}
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <p className="font-semibold text-foreground">{rm?.name || 'Matéria-prima desconhecida'}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {new Date(batch.date).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Quantidade: </span>
                          <span className="font-semibold text-foreground">{batch.quantity} {rm?.type}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          onClick={() => viewRawMaterialBatchDetails(batch)}
                          className="flex-1"
                          variant="outline"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Ver Detalhes
                        </Button>
                        <Button 
                          onClick={() => openEditDialog(batch, 'raw_material')}
                          size="icon"
                          variant="outline"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {batchType === 'product' ? 'Detalhes do Lote de Produto' : 'Detalhes do Lote de Matéria-Prima'}
            </DialogTitle>
          </DialogHeader>

          {selectedBatch && batchType === 'product' && (
            <div className="space-y-6">
              {/* Informações Básicas */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Número do Lote</p>
                    <p className="text-2xl font-bold text-primary">{selectedBatch.batch_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div className="mt-1">{getStatusBadge(selectedBatch.status)}</div>
                  </div>
                </div>
              </div>

              {/* Produto */}
              <div>
                <h3 className="font-semibold text-lg mb-2">Produto</h3>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-bold text-foreground text-xl">{selectedBatch.product?.name}</p>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Data de Criação</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <p className="text-foreground">{new Date(selectedBatch.date).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Quantidade Planejada</p>
                      <p className="text-foreground font-semibold">{selectedBatch.planned_liters} {selectedBatch.unit}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Matérias-Primas Usadas */}
              <div>
                <h3 className="font-semibold text-lg mb-2">Matérias-Primas da Receita</h3>
                {selectedBatch.recipes && selectedBatch.recipes.length > 0 ? (
                  <div className="space-y-3">
                    {selectedBatch.recipes.map((recipe, idx) => (
                      <div key={idx} className="p-4 bg-muted rounded-lg border border-border">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-semibold text-foreground">{recipe.raw_material?.name}</p>
                          <Badge variant="outline">{recipe.quantity_per_liter} {recipe.unit}/L</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          Quantidade necessária: <span className="font-semibold text-foreground">{recipe.quantity_needed.toFixed(2)} {recipe.unit}</span>
                        </p>
                        
                        {/* Lotes Disponíveis */}
                        {recipe.batches && recipe.batches.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">Lotes disponíveis:</p>
                            <div className="space-y-2">
                              {recipe.batches.slice(0, 3).map((rmBatch, bidx) => (
                                <div key={bidx} className="flex justify-between items-center text-sm bg-background p-2 rounded">
                                  <div>
                                    <span className="font-mono text-primary">{rmBatch.batch_number}</span>
                                    <span className="text-muted-foreground ml-2">
                                      {new Date(rmBatch.date).toLocaleDateString('pt-BR')}
                                    </span>
                                  </div>
                                  <span className="font-semibold text-foreground">{rmBatch.quantity} {recipe.raw_material?.type}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card className="p-4">
                    <p className="text-muted-foreground text-sm">Nenhuma receita cadastrada para este produto</p>
                  </Card>
                )}
              </div>
            </div>
          )}

          {selectedBatch && batchType === 'raw_material' && (
            <div className="space-y-6">
              {/* Informações Básicas */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Número do Lote</p>
                    <p className="text-2xl font-bold text-primary">{selectedBatch.batch_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div className="mt-1">{getStatusBadge(selectedBatch.status)}</div>
                  </div>
                </div>
              </div>

              {/* Matéria-Prima */}
              <div>
                <h3 className="font-semibold text-lg mb-2">Matéria-Prima</h3>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-bold text-foreground text-xl">{selectedBatch.raw_material?.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">Tipo: {selectedBatch.raw_material?.type}</p>
                </div>
              </div>

              {/* Informações do Lote */}
              <div>
                <h3 className="font-semibold text-lg mb-2">Informações do Lote</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      <p className="text-sm text-muted-foreground">Data de Chegada</p>
                    </div>
                    <p className="text-foreground font-semibold text-lg">
                      {new Date(selectedBatch.date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-5 h-5 text-primary" />
                      <p className="text-sm text-muted-foreground">Quantidade</p>
                    </div>
                    <p className="text-foreground font-semibold text-lg">
                      {selectedBatch.quantity} {selectedBatch.raw_material?.type}
                    </p>
                  </div>

                  {selectedBatch.supplier_batch_number && (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-5 h-5 text-primary" />
                        <p className="text-sm text-muted-foreground">Lote do Fornecedor</p>
                      </div>
                      <p className="text-foreground font-semibold text-lg">{selectedBatch.supplier_batch_number}</p>
                    </div>
                  )}

                  {selectedBatch.expiry_date && (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-5 h-5 text-orange-500" />
                        <p className="text-sm text-muted-foreground">Data de Validade</p>
                      </div>
                      <p className="text-foreground font-semibold text-lg">
                        {new Date(selectedBatch.expiry_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Edição */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {batchType === 'product' ? 'Editar Lote de Produto' : 'Editar Lote de Matéria-Prima'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={editFormData.date?.split('T')[0] || ''}
                onChange={(e) => setEditFormData({...editFormData, date: e.target.value})}
                required
              />
            </div>

            {batchType === 'product' ? (
              <div>
                <Label>Quantidade Planejada (Litros)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.planned_liters || ''}
                  onChange={(e) => setEditFormData({...editFormData, planned_liters: e.target.value})}
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editFormData.quantity || ''}
                    onChange={(e) => setEditFormData({...editFormData, quantity: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <Label>Lote do Fornecedor</Label>
                  <Input
                    value={editFormData.supplier_batch_number || ''}
                    onChange={(e) => setEditFormData({...editFormData, supplier_batch_number: e.target.value})}
                    placeholder="Ex: F20241205"
                  />
                </div>

                <div>
                  <Label>Data de Validade</Label>
                  <Input
                    type="date"
                    value={editFormData.expiry_date?.split('T')[0] || ''}
                    onChange={(e) => setEditFormData({...editFormData, expiry_date: e.target.value})}
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
