import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Users } from 'lucide-react';

export const Team = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = React.useRef(true);
  const [formData, setFormData] = useState({ name: '', role: '' });

  useEffect(() => {
    isMountedRef.current = true;
    fetchMembers();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await api.get('/team');
      if (isMountedRef.current) {
        setMembers(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar equipe');
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
      if (selectedMember) {
        await api.put(`/team/${selectedMember.id}`, formData);
      } else {
        await api.post('/team', formData);
      }
      
      if (isMountedRef.current) {
        const successMessage = selectedMember ? 'Membro atualizado!' : 'Membro adicionado!';
        setDialogOpen(false);
        resetForm();
        await fetchMembers();
        toast.success(successMessage);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao salvar');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja mover este membro para a lixeira?')) return;
    try {
      await api.delete(`/team/${id}`);
      if (isMountedRef.current) {
        await fetchMembers();
        toast.success('Membro movido para lixeira');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao excluir');
      }
    }
  };

  const handleEdit = (member) => {
    setSelectedMember(member);
    setFormData({ name: member.name, role: member.role });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedMember(null);
    setFormData({ name: '', role: '' });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Equipe</h1>
          <p className="text-lg text-slate-300">Gerencie os membros da equipe</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="create-member-button" className="bg-primary hover:bg-primary/90 glow-primary">
              <Plus className="w-4 h-4 mr-2" />
              Novo Membro
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">{selectedMember ? 'Editar' : 'Novo'} Membro</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-white">Nome</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" required />
              </div>
              <div>
                <Label className="text-white">Cargo/Função</Label>
                <Input value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="bg-slate-900/50 border-slate-700 text-white" required placeholder="Ex: Operador, Pesador, Envasador" />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {members.map(member => (
            <Card key={member.id} data-testid={`member-card-${member.id}`} className="p-6 glass-effect border-white/5 hover:border-primary/50 transition-smooth">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{member.name}</h3>
                    <p className="text-sm text-slate-400">{member.role}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(member)} className="text-slate-300 hover:text-white">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(member.id)} className="text-red-400 hover:text-red-300">
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
