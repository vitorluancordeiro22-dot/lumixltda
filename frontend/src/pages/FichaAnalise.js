import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  FolderPlus, Folder, Plus, ArrowLeft, FlaskConical, Pencil, Trash2,
  Save, X, ClipboardCopy, Package, Boxes, FileText, ChevronRight
} from 'lucide-react';

const DEFAULT_FIELDS = [
  { name: 'Aspecto', order: 0 },
  { name: 'Cor', order: 1 },
  { name: 'Odor', order: 2 },
  { name: 'pH', order: 3 },
  { name: 'Viscosidade', order: 4 },
  { name: 'Massa Específica', order: 5 },
];

export default function FichaAnalise() {
  const [activeTab, setActiveTab] = useState('produto');
  const [view, setView] = useState('categories'); // categories | items | analises | new_analise | edit_fields
  const [categories, setCategories] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [analises, setAnalises] = useState([]);
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [editingFields, setEditingFields] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [results, setResults] = useState({});
  const [specs, setSpecs] = useState({});
  const [newCatName, setNewCatName] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [loading, setLoading] = useState(false);

  const itemType = activeTab === 'produto' ? 'produto' : 'materia_prima';

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get(`/analise-categories?type=${itemType}`);
      setCategories(res.data);
    } catch { toast.error('Erro ao carregar categorias'); }
  }, [itemType]);

  const fetchAllItems = useCallback(async () => {
    try {
      if (itemType === 'produto') {
        const res = await api.get('/products');
        setAllItems(res.data);
      } else {
        const res = await api.get('/raw-materials');
        setAllItems(res.data);
      }
    } catch { toast.error('Erro ao carregar itens'); }
  }, [itemType]);

  useEffect(() => {
    setView('categories');
    setSelectedCategory(null);
    setSelectedItem(null);
    fetchCategories();
    fetchAllItems();
  }, [activeTab, fetchCategories, fetchAllItems]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await api.post('/analise-categories', { name: newCatName.trim(), type: itemType });
      setNewCatName('');
      setShowNewCat(false);
      fetchCategories();
      toast.success('Categoria criada');
    } catch { toast.error('Erro ao criar categoria'); }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('Remover esta categoria?')) return;
    try {
      await api.delete(`/analise-categories/${catId}`);
      fetchCategories();
      toast.success('Categoria removida');
    } catch { toast.error('Erro'); }
  };

  const handleAddItem = async (itemId) => {
    try {
      await api.post(`/analise-categories/${selectedCategory.id}/add-item`, { item_id: itemId });
      fetchCategories();
      setShowAddItem(false);
      toast.success('Item adicionado');
    } catch { toast.error('Erro'); }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      await api.post(`/analise-categories/${selectedCategory.id}/remove-item`, { item_id: itemId });
      const updated = { ...selectedCategory, items: selectedCategory.items.filter(i => i !== itemId) };
      setSelectedCategory(updated);
      fetchCategories();
    } catch { toast.error('Erro'); }
  };

  const openItem = async (item) => {
    setSelectedItem(item);
    setView('analises');
    setLoading(true);
    try {
      const [analiseRes, fieldsRes, batchRes] = await Promise.all([
        api.get(`/analises?item_id=${item.id}&item_type=${itemType}`),
        api.get(`/analise-fields/${item.id}`),
        api.get(`/analise-batches/${itemType}/${item.id}`)
      ]);
      setAnalises(analiseRes.data);
      setFields(fieldsRes.data.fields || DEFAULT_FIELDS);
      setBatches(batchRes.data);
    } catch { toast.error('Erro ao carregar dados'); }
    setLoading(false);
  };

  const startNewAnalise = () => {
    setSelectedBatch(null);
    setResults({});
    setSpecs({});
    fields.forEach(f => {
      setResults(prev => ({ ...prev, [f.name]: '' }));
      setSpecs(prev => ({ ...prev, [f.name]: '' }));
    });
    setView('new_analise');
  };

  const handleSaveAnalise = async () => {
    if (!selectedBatch) { toast.error('Selecione um lote'); return; }
    try {
      const payload = {
        item_id: selectedItem.id,
        item_type: itemType,
        item_name: selectedItem.name,
        batch_id: selectedBatch.id,
        batch_number: selectedBatch.batch_number,
        results,
        specifications: specs,
        raw_materials_used: selectedBatch.raw_materials_used || []
      };
      await api.post('/analises', payload);
      toast.success('Análise registrada');
      openItem(selectedItem);
    } catch { toast.error('Erro ao salvar'); }
  };

  const handleSaveFields = async () => {
    try {
      await api.put(`/analise-fields/${selectedItem.id}`, { fields: editingFields });
      setFields(editingFields);
      setView('analises');
      toast.success('Campos salvos');
    } catch { toast.error('Erro ao salvar campos'); }
  };

  const getItemName = (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    return item ? item.name : itemId;
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const getCategoryItems = (cat) => {
    return (cat.items || []).map(itemId => allItems.find(i => i.id === itemId)).filter(Boolean);
  };

  const availableItemsForCategory = () => {
    const usedIds = selectedCategory?.items || [];
    return allItems.filter(i => !usedIds.includes(i.id));
  };

  // ====== RENDER ======

  // Categories View
  const renderCategories = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" className="border-border" onClick={() => setShowNewCat(true)} data-testid="new-category-btn">
          <FolderPlus className="w-4 h-4 mr-2" /> Nova Categoria
        </Button>
      </div>

      {showNewCat && (
        <Card className="p-4 bg-card border-border flex gap-3 items-end">
          <div className="flex-1">
            <Label className="text-foreground text-sm">Nome da Categoria</Label>
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Ex: Desinfetantes" className="bg-input border-border text-foreground mt-1" autoFocus />
          </div>
          <Button onClick={handleCreateCategory} data-testid="save-category-btn"><Save className="w-4 h-4 mr-1" /> Salvar</Button>
          <Button variant="ghost" onClick={() => { setShowNewCat(false); setNewCatName(''); }}><X className="w-4 h-4" /></Button>
        </Card>
      )}

      {categories.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhuma categoria criada. Crie uma para organizar seus {activeTab === 'produto' ? 'produtos' : 'matérias-primas'}.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => {
            const items = getCategoryItems(cat);
            return (
              <Card key={cat.id} className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => { setSelectedCategory(cat); setView('items'); }} data-testid={`category-${cat.id}`}>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Folder className="w-5 h-5 text-primary" />
                      <h3 className="font-bold text-foreground">{cat.name}</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? 'item' : 'itens'}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {items.slice(0, 4).map(item => (
                      <span key={item.id} className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{item.name}</span>
                    ))}
                    {items.length > 4 && <span className="text-xs text-muted-foreground">+{items.length - 4}</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  // Items View (inside a category)
  const renderItems = () => {
    const items = getCategoryItems(selectedCategory);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => { setView('categories'); setSelectedCategory(null); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <Folder className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">{selectedCategory.name}</h2>
          <Button variant="outline" size="sm" className="border-border ml-auto" onClick={() => setShowAddItem(true)} data-testid="add-item-btn">
            <Plus className="w-4 h-4 mr-1" /> Adicionar {activeTab === 'produto' ? 'Produto' : 'Matéria-Prima'}
          </Button>
        </div>

        {items.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border">
            <p className="text-muted-foreground">Nenhum item nesta categoria. Adicione {activeTab === 'produto' ? 'produtos' : 'matérias-primas'}.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(item => (
              <Card key={item.id} className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => openItem(item)} data-testid={`item-${item.id}`}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {activeTab === 'produto' ? <Package className="w-5 h-5 text-primary" /> : <Boxes className="w-5 h-5 text-primary" />}
                    <span className="font-semibold text-foreground">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); handleRemoveItem(item.id); }}>
                      <X className="w-3 h-3" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Dialog para adicionar item */}
        <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
          <DialogContent className="bg-card border-border max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Adicionar {activeTab === 'produto' ? 'Produto' : 'Matéria-Prima'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              {availableItemsForCategory().length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Todos os itens já foram adicionados.</p>
              ) : (
                availableItemsForCategory().map(item => (
                  <Button key={item.id} variant="outline" className="w-full justify-start border-border text-foreground" onClick={() => handleAddItem(item.id)}>
                    {activeTab === 'produto' ? <Package className="w-4 h-4 mr-2" /> : <Boxes className="w-4 h-4 mr-2" />}
                    {item.name}
                  </Button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // Analises History View
  const renderAnalises = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => setView('items')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          {activeTab === 'produto' ? <Package className="w-5 h-5 text-primary" /> : <Boxes className="w-5 h-5 text-primary" />}
          <h2 className="text-xl font-bold text-foreground">{selectedItem?.name}</h2>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="border-border" onClick={() => { setEditingFields([...fields]); setView('edit_fields'); }} data-testid="edit-fields-btn">
            <Pencil className="w-4 h-4 mr-1" /> Editar Campos
          </Button>
          <Button size="sm" onClick={startNewAnalise} data-testid="new-analise-btn">
            <Plus className="w-4 h-4 mr-1" /> Nova Análise
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
      ) : analises.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhuma análise registrada para este {activeTab === 'produto' ? 'produto' : 'matéria-prima'}.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {analises.map(a => (
            <Card key={a.id} className="bg-card border-border" data-testid={`analise-${a.id}`}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-bold text-foreground">Lote: {a.batch_number}</span>
                    <span className="text-sm text-muted-foreground">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">por {a.created_by}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(a.results || {}).map(([key, val]) => (
                    <div key={key} className="bg-muted/30 rounded px-3 py-2">
                      <span className="text-xs text-muted-foreground block">{key}</span>
                      <span className="text-sm font-semibold text-foreground">{val || '-'}</span>
                      {a.specifications?.[key] && (
                        <span className="text-xs text-muted-foreground block">Espec: {a.specifications[key]}</span>
                      )}
                    </div>
                  ))}
                </div>
                {a.raw_materials_used && a.raw_materials_used.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <span className="text-xs font-semibold text-muted-foreground">Matérias-Primas:</span>
                    <div className="mt-1 space-y-1">
                      {a.raw_materials_used.map((rm, i) => (
                        <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="text-foreground font-medium">{rm.raw_material_name}</span>
                          {rm.batches_consumed?.map((b, j) => (
                            <span key={j} className="bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                              Lote: {b.batch_number}
                              <button onClick={() => copyText(b.batch_number)} className="hover:text-primary"><ClipboardCopy className="w-3 h-3" /></button>
                              {b.expiry_date && (
                                <>
                                  | Val: {new Date(b.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  <button onClick={() => copyText(new Date(b.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR'))} className="hover:text-primary"><ClipboardCopy className="w-3 h-3" /></button>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // New Analise Form
  const renderNewAnalise = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => setView('analises')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <h2 className="text-xl font-bold text-foreground">Nova Análise — {selectedItem?.name}</h2>
      </div>

      {/* Seletor de Lote */}
      <Card className="p-4 bg-card border-border">
        <Label className="text-foreground font-semibold text-sm">Selecione o Lote</Label>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-full">Nenhum lote encontrado para este item.</p>
          ) : (
            batches.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBatch(b)}
                className={`text-left p-3 rounded-lg border transition-all text-sm ${
                  selectedBatch?.id === b.id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/50'
                }`}
                data-testid={`batch-option-${b.id}`}
              >
                <span className="font-mono font-bold block">{b.batch_number}</span>
                <span className="text-xs">{b.status} — {b.date ? new Date(b.date + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</span>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* MP do lote selecionado (se produto) */}
      {selectedBatch?.raw_materials_used && selectedBatch.raw_materials_used.length > 0 && (
        <Card className="p-4 bg-card border-border">
          <Label className="text-foreground font-semibold text-sm">Matérias-Primas do Lote</Label>
          <div className="mt-2 space-y-2">
            {selectedBatch.raw_materials_used.map((rm, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-muted/30 rounded px-3 py-2">
                <span className="font-medium text-foreground">{rm.raw_material_name}</span>
                <span className="text-muted-foreground">({rm.quantity_needed} {rm.unit})</span>
                {rm.batches_consumed?.map((b, j) => (
                  <span key={j} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                    Lote: {b.batch_number}
                    <button onClick={() => copyText(b.batch_number)} className="hover:text-primary"><ClipboardCopy className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Campos de Análise */}
      <Card className="p-4 bg-card border-border">
        <Label className="text-foreground font-semibold text-sm">Campos de Análise</Label>
        <div className="mt-3 space-y-3">
          {fields.map((field, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-3 items-center">
              <Label className="text-sm text-foreground font-medium">{field.name}</Label>
              <div>
                <Input
                  placeholder="Especificação"
                  value={specs[field.name] || ''}
                  onChange={e => setSpecs(prev => ({ ...prev, [field.name]: e.target.value }))}
                  className="bg-input border-border text-foreground text-sm"
                />
              </div>
              <div>
                <Input
                  placeholder="Resultado"
                  value={results[field.name] || ''}
                  onChange={e => setResults(prev => ({ ...prev, [field.name]: e.target.value }))}
                  className="bg-input border-border text-foreground text-sm"
                />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
            <span></span>
            <span className="text-center">Especificação</span>
            <span className="text-center">Resultado</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" className="border-border" onClick={() => setView('analises')}>Cancelar</Button>
        <Button onClick={handleSaveAnalise} data-testid="save-analise-btn">
          <Save className="w-4 h-4 mr-1" /> Registrar Análise
        </Button>
      </div>
    </div>
  );

  // Edit Fields View
  const renderEditFields = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => setView('analises')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Cancelar
        </Button>
        <h2 className="text-xl font-bold text-foreground">Editar Campos — {selectedItem?.name}</h2>
      </div>

      <Card className="p-4 bg-card border-border space-y-3">
        <p className="text-sm text-muted-foreground">Adicione, remova ou renomeie os campos de análise para este item.</p>
        {editingFields.map((field, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-8">{idx + 1}.</span>
            <Input
              value={field.name}
              onChange={e => {
                const updated = [...editingFields];
                updated[idx].name = e.target.value;
                setEditingFields(updated);
              }}
              className="bg-input border-border text-foreground flex-1"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingFields(editingFields.filter((_, i) => i !== idx))}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="border-border" onClick={() => setEditingFields([...editingFields, { name: '', order: editingFields.length }])}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar Campo
        </Button>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" className="border-border" onClick={() => setView('analises')}>Cancelar</Button>
        <Button onClick={handleSaveFields} data-testid="save-fields-btn">
          <Save className="w-4 h-4 mr-1" /> Salvar Campos
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="ficha-analise-page">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Ficha de Análise</h1>
        <p className="text-lg text-muted-foreground">Registre e consulte análises de produtos e matérias-primas</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 bg-muted/40 p-1 rounded-lg w-fit" data-testid="analise-tab-switcher">
        <button
          onClick={() => setActiveTab('produto')}
          className={`flex items-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === 'produto' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package className="w-4 h-4" /> Produtos
        </button>
        <button
          onClick={() => setActiveTab('materia_prima')}
          className={`flex items-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === 'materia_prima' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Boxes className="w-4 h-4" /> Matérias-Primas
        </button>
      </div>

      {/* Content */}
      {view === 'categories' && renderCategories()}
      {view === 'items' && renderItems()}
      {view === 'analises' && renderAnalises()}
      {view === 'new_analise' && renderNewAnalise()}
      {view === 'edit_fields' && renderEditFields()}
    </div>
  );
}
