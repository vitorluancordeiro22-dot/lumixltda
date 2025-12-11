import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { RotateCcw, Trash2 } from 'lucide-react';

export const Trash = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    try {
      const response = await api.get('/trash');
      setItems(response.data);
    } catch (error) {
      toast.error('Erro ao carregar lixeira');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id) => {
    try {
      await api.post(`/trash/restore/${id}`);
      toast.success('Item restaurado!');
      fetchTrash();
    } catch (error) {
      toast.error('Erro ao restaurar');
    }
  };

  const handleDeletePermanently = async (id) => {
    if (!window.confirm('Deseja apagar permanentemente este item? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/trash/${id}`);
      toast.success('Item apagado permanentemente');
      fetchTrash();
    } catch (error) {
      toast.error('Erro ao apagar');
    }
  };

  const getItemLabel = (itemType) => {
    const labels = {
      product: 'Produto',
      product_batch: 'Lote de Produto',
      raw_material: 'Matéria-Prima',
      raw_material_batch: 'Lote de MP',
      production_order: 'Ordem de Produção',
      team_member: 'Membro da Equipe'
    };
    return labels[itemType] || itemType;
  };

  const getItemName = (item) => {
    const data = item.item_data;
    return data.name || data.batch_number || data.id;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Lixeira</h1>
        <p className="text-lg text-muted-foreground">Restaure ou apague itens permanentemente</p>
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : items.length === 0 ? (
        <Card className="p-12  border text-center">
          <div className="flex flex-col items-center justify-center">
            <Trash2 className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">A lixeira está vazia</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <Card key={item.id} data-testid={`trash-item-${item.id}`} className="p-6  border">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      {getItemLabel(item.item_type)}
                    </Badge>
                    <h3 className="text-xl font-bold text-foreground">{getItemName(item)}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Excluído em: {new Date(item.deleted_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleRestore(item.id)}
                    data-testid={`restore-${item.id}`}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restaurar
                  </Button>
                  <Button
                    onClick={() => handleDeletePermanently(item.id)}
                    variant="destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Apagar
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
