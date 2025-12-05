import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Plus, FileText, CheckCircle, Clock, Play, Printer,
  Edit, Eye, AlertCircle, Package, Calendar
} from 'lucide-react';

export const IndustrialOPs = () => {
  const [ops, setOps] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOP, setSelectedOP] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  const [formData, setFormData] = useState({
    product_id: '',
    planned_quantity: '',
    unit: 'Litros',
    responsible_name: '',
    observations: '',
    shift: '',
    equipment: '',
    temperature: ''
  });

  useEffect(() => {
    isMountedRef.current = true;
    fetchOPs();
    fetchProducts();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchOPs = async () => {
    try {
      const response = await api.get('/industrial-ops');
      if (isMountedRef.current) {
        setOps(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('Error loading OPs:', error);
        toast.error('Erro ao carregar OPs');
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
      if (isMountedRef.current) {
        setProducts(response.data);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !isMountedRef.current) return;

    setSubmitting(true);
    
    try {
      const response = await api.post('/industrial-ops', {
        ...formData,
        planned_quantity: parseFloat(formData.planned_quantity),
        temperature: formData.temperature ? parseFloat(formData.temperature) : null
      });

      if (!isMountedRef.current) return;
      
      toast.success('OP criada com sucesso!');
      resetForm();
      setDialogOpen(false);
      
      // Fetch OPs after dialog is closed
      setTimeout(() => {
        if (isMountedRef.current) {
          fetchOPs();
        }
      }, 300);
      
    } catch (error) {
      if (!isMountedRef.current) return;
      
      const errorMsg = error.response?.data?.detail || 'Erro ao criar OP';
      toast.error(errorMsg);
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: '',
      planned_quantity: '',
      unit: 'Litros',
      responsible_name: '',
      observations: '',
      shift: '',
      equipment: '',
      temperature: ''
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      aguardando_envase: {
        label: 'Aguardando Envase',
        className: 'bg-yellow-600'
      },
      em_producao: {
        label: 'Em Produção',
        className: 'bg-blue-600'
      },
      finalizada: {
        label: 'Finalizada',
        className: 'bg-green-600'
      }
    };

    const config = statusConfig[status] || statusConfig.aguardando_envase;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const changeStatus = async (opId, newStatus) => {
    try {
      await api.post(`/industrial-ops/${opId}/change-status`, {
        new_status: newStatus
      });
      toast.success('Status atualizado!');
      await fetchOPs();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Erro ao atualizar status';
      toast.error(errorMsg);
    }
  };

  const updateQuantity = async (opId, quantity) => {
    try {
      await api.put(`/industrial-ops/${opId}`, {
        produced_quantity: parseFloat(quantity)
      });
      toast.success('Quantidade atualizada!');
      await fetchOPs();
    } catch (error) {
      toast.error('Erro ao atualizar quantidade');
    }
  };

  const printOP = async (opId) => {
    try {
      const response = await api.post(`/industrial-ops/${opId}/print`);
      toast.success('Documento gerado!');
      // TODO: Abrir PDF gerado
      console.log('PDF data:', response.data);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Erro ao gerar documento';
      toast.error(errorMsg);
    }
  };

  const viewDetails = async (opId) => {
    try {
      const response = await api.get(`/industrial-ops/${opId}`);
      setSelectedOP(response.data);
      setDetailsOpen(true);
    } catch (error) {
      toast.error('Erro ao carregar detalhes');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Ordens de Produção</h1>
          <p className="text-lg text-slate-300">Controle Industrial Completo de OP</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Nova OP
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">Nova Ordem de Produção</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-white">Produto *</Label>
                <Select 
                  value={formData.product_id} 
                  onValueChange={(v) => {
                    const product = products.find(p => p.id === v);
                    setFormData({
                      ...formData, 
                      product_id: v,
                      unit: product?.unit || 'Litros'
                    });
                  }}
                  required
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-white">
                        {p.name} {p.code ? `(${p.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Quantidade Planejada *</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={formData.planned_quantity} 
                    onChange={(e) => setFormData({...formData, planned_quantity: e.target.value})}
                    className="bg-slate-900/50 border-slate-700 text-white"
                    required
                  />
                </div>
                <div>
                  <Label className="text-white">Unidade</Label>
                  <Input 
                    value={formData.unit}
                    disabled
                    className="bg-slate-900/50 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div>
                <Label className="text-white">Responsável *</Label>
                <Input 
                  value={formData.responsible_name} 
                  onChange={(e) => setFormData({...formData, responsible_name: e.target.value})}
                  className="bg-slate-900/50 border-slate-700 text-white"
                  placeholder="Nome do responsável"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Turno</Label>
                  <Select 
                    value={formData.shift} 
                    onValueChange={(v) => setFormData({...formData, shift: v})}
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="Manhã" className="text-white">Manhã</SelectItem>
                      <SelectItem value="Tarde" className="text-white">Tarde</SelectItem>
                      <SelectItem value="Noite" className="text-white">Noite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Equipamento</Label>
                  <Input 
                    value={formData.equipment} 
                    onChange={(e) => setFormData({...formData, equipment: e.target.value})}
                    className="bg-slate-900/50 border-slate-700 text-white"
                    placeholder="Ex: Tanque 01"
                  />
                </div>
              </div>

              <div>
                <Label className="text-white">Observações</Label>
                <Textarea 
                  value={formData.observations} 
                  onChange={(e) => setFormData({...formData, observations: e.target.value})}
                  className="bg-slate-900/50 border-slate-700 text-white"
                  rows={3}
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">
                {submitting ? 'Criando...' : 'Criar OP'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de OPs */}
      {loading ? (
        <div className="text-white text-center py-12">Carregando...</div>
      ) : ops.length === 0 ? (
        <Card className="p-12 glass-effect border-white/5 text-center">
          <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg mb-2">Nenhuma OP cadastrada</p>
          <p className="text-slate-500 text-sm">
            Crie sua primeira Ordem de Produção Industrial
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ops.map(op => (
            <Card key={op.id} className="p-6 glass-effect border-white/5 hover:border-primary/50 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="text-xl font-bold text-white">{op.op_number}</h3>
                  </div>
                  <p className="text-sm text-slate-400">{op.product_name}</p>
                  <p className="text-xs text-slate-500">Lote: {op.batch_number}</p>
                </div>
                {getStatusBadge(op.status)}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Planejado:</span>
                  <span className="text-white font-semibold">{op.planned_quantity} {op.unit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Produzido:</span>
                  <span className="text-emerald-400 font-semibold">{op.produced_quantity} {op.unit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Responsável:</span>
                  <span className="text-white">{op.responsible_name}</span>
                </div>
              </div>

              {/* Atualização de Quantidade */}
              {op.status === 'em_producao' && op.is_editable && (
                <div className="mb-3">
                  <Label className="text-white text-xs">Atualizar Quantidade</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={op.produced_quantity}
                      className="bg-slate-900/50 border-slate-700 text-white text-sm"
                      onBlur={(e) => {
                        if (e.target.value && parseFloat(e.target.value) !== op.produced_quantity) {
                          updateQuantity(op.id, e.target.value);
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-700 text-white hover:bg-slate-800 flex-1"
                  onClick={() => viewDetails(op.id)}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Ver
                </Button>

                {op.status === 'aguardando_envase' && (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 flex-1"
                    onClick={() => changeStatus(op.id, 'em_producao')}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Iniciar
                  </Button>
                )}

                {op.status === 'em_producao' && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 flex-1"
                    onClick={() => changeStatus(op.id, 'finalizada')}
                    disabled={op.produced_quantity <= 0}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Finalizar
                  </Button>
                )}

                {op.status === 'finalizada' && op.is_printable && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 flex-1"
                    onClick={() => printOP(op.id)}
                  >
                    <Printer className="w-3 h-3 mr-1" />
                    Imprimir
                  </Button>
                )}
              </div>

              {!op.is_editable && (
                <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Bloqueada para edição
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="bg-card border-white/10 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Detalhes da OP</DialogTitle>
          </DialogHeader>
          {selectedOP && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-400 text-sm">Número da OP</Label>
                  <p className="text-white font-bold text-lg">{selectedOP.op_number}</p>
                </div>
                <div>
                  <Label className="text-slate-400 text-sm">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedOP.status)}</div>
                </div>
              </div>

              <div>
                <Label className="text-slate-400 text-sm">Produto</Label>
                <p className="text-white">{selectedOP.product_name}</p>
                <p className="text-slate-500 text-sm">Lote: {selectedOP.batch_number}</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-400 text-sm">Planejado</Label>
                  <p className="text-white font-semibold">{selectedOP.planned_quantity} {selectedOP.unit}</p>
                </div>
                <div>
                  <Label className="text-slate-400 text-sm">Produzido</Label>
                  <p className="text-emerald-400 font-semibold">{selectedOP.produced_quantity} {selectedOP.unit}</p>
                </div>
                <div>
                  <Label className="text-slate-400 text-sm">Eficiência</Label>
                  <p className="text-white font-semibold">
                    {((selectedOP.produced_quantity / selectedOP.planned_quantity) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-white mb-2 block">Matérias-Primas Utilizadas</Label>
                <div className="space-y-2">
                  {selectedOP.raw_materials.map((rm, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-medium">{rm.raw_material_name}</p>
                          <p className="text-slate-400 text-sm">Lote: {rm.batch_number}</p>
                        </div>
                        <p className="text-emerald-400 font-semibold">
                          {rm.quantity_used.toFixed(2)} {rm.unit}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOP.observations && (
                <div>
                  <Label className="text-white mb-2 block">Observações</Label>
                  <p className="text-slate-300">{selectedOP.observations}</p>
                </div>
              )}

              {selectedOP.history && selectedOP.history.length > 0 && (
                <div>
                  <Label className="text-white mb-2 block">Histórico</Label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedOP.history.slice().reverse().map((entry, idx) => (
                      <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-slate-400">{entry.action}</span>
                          <span className="text-slate-500 text-xs">
                            {new Date(entry.timestamp).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-white">{entry.user_name}</p>
                        {entry.notes && <p className="text-slate-400 mt-1">{entry.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
