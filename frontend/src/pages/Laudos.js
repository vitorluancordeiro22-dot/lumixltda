import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  FolderPlus, FileText, Upload, Download, Trash2, 
  Folder, FolderOpen, ChevronRight, FileCheck
} from 'lucide-react';

export const Laudos = () => {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchFolders();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      fetchFiles(selectedFolder.id);
    }
  }, [selectedFolder]);

  const fetchFolders = async () => {
    try {
      const response = await api.get('/laudos/folders');
      if (isMountedRef.current) {
        setFolders(response.data);
        if (response.data.length > 0 && !selectedFolder) {
          setSelectedFolder(response.data[0]);
        }
      }
    } catch (error) {
      console.error('Error loading folders:', error);
      if (isMountedRef.current) {
        toast.error('Erro ao carregar pastas');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchFiles = async (folderId) => {
    try {
      const response = await api.get(`/laudos/files/${folderId}`);
      if (isMountedRef.current) {
        setFiles(response.data);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim() || !isMountedRef.current) return;

    try {
      await api.post('/laudos/folders', {
        name: newFolderName,
        parent_id: null
      });

      if (!isMountedRef.current) return;

      toast.success('Pasta criada com sucesso!');
      setNewFolderName('');
      setFolderDialogOpen(false);

      setTimeout(() => {
        if (isMountedRef.current) {
          fetchFolders();
        }
      }, 300);
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao criar pasta');
      }
    }
  };

  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!selectedFile || !selectedFolder || !isMountedRef.current) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('folder_id', selectedFolder.id);
      formData.append('notes', uploadNotes);

      await api.post('/laudos/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        params: {
          folder_id: selectedFolder.id,
          notes: uploadNotes
        }
      });

      if (!isMountedRef.current) return;

      toast.success('Arquivo enviado com sucesso!');
      setSelectedFile(null);
      setUploadNotes('');
      setUploadDialogOpen(false);

      setTimeout(() => {
        if (isMountedRef.current) {
          fetchFiles(selectedFolder.id);
        }
      }, 300);
    } catch (error) {
      if (isMountedRef.current) {
        const errorMsg = error.response?.data?.detail || 'Erro ao enviar arquivo';
        toast.error(errorMsg);
      }
    } finally {
      if (isMountedRef.current) {
        setUploading(false);
      }
    }
  };

  const handleDownloadFile = async (file) => {
    try {
      const response = await api.get(`/laudos/download/${file.id}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Download iniciado!');
    } catch (error) {
      toast.error('Erro ao baixar arquivo');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm('Tem certeza que deseja deletar esta pasta?')) return;

    try {
      await api.delete(`/laudos/folders/${folderId}`);
      toast.success('Pasta deletada!');
      
      setTimeout(() => {
        if (isMountedRef.current) {
          fetchFolders();
          setSelectedFolder(null);
        }
      }, 300);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Erro ao deletar pasta';
      toast.error(errorMsg);
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Tem certeza que deseja deletar este arquivo?')) return;

    try {
      await api.delete(`/laudos/files/${fileId}`);
      toast.success('Arquivo deletado!');
      
      setTimeout(() => {
        if (isMountedRef.current && selectedFolder) {
          fetchFiles(selectedFolder.id);
        }
      }, 300);
    } catch (error) {
      toast.error('Erro ao deletar arquivo');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Laudos</h1>
          <p className="text-lg text-slate-300">Gerenciamento de documentos e laudos</p>
        </div>

        <div className="flex gap-3">
          <Dialog open={folderDialogOpen} onOpenChange={(open) => { setFolderDialogOpen(open); if (!open) setNewFolderName(''); }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-600 hover:bg-amber-700">
                <FolderPlus className="w-4 h-4 mr-2" />
                Nova Pasta
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader>
                <DialogTitle className="text-white">Criar Nova Pasta</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateFolder} className="space-y-4">
                <div>
                  <Label className="text-white">Nome da Pasta</Label>
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="bg-slate-900/50 border-slate-700 text-white"
                    placeholder="Ex: Laudos 2024"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                  Criar Pasta
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {selectedFolder && (
            <Dialog open={uploadDialogOpen} onOpenChange={(open) => { 
              setUploadDialogOpen(open); 
              if (!open) { 
                setSelectedFile(null); 
                setUploadNotes(''); 
              } 
            }}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload PDF
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-white">Upload de Laudo</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUploadFile} className="space-y-4">
                  <div>
                    <Label className="text-white">Pasta Destino</Label>
                    <Input
                      value={selectedFolder.name}
                      disabled
                      className="bg-slate-900/50 border-slate-700 text-white"
                    />
                  </div>

                  <div>
                    <Label className="text-white">Arquivo PDF *</Label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setSelectedFile(e.target.files[0])}
                      className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-white">Observações</Label>
                    <Textarea
                      value={uploadNotes}
                      onChange={(e) => setUploadNotes(e.target.value)}
                      className="bg-slate-900/50 border-slate-700 text-white"
                      placeholder="Notas sobre o arquivo..."
                      rows={3}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={uploading} 
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    {uploading ? 'Enviando...' : 'Enviar Arquivo'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Folders Sidebar */}
        <Card className="md:col-span-1 p-6 glass-effect border-white/5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Folder className="w-5 h-5 text-primary" />
            Pastas
          </h3>

          {loading ? (
            <p className="text-slate-400 text-sm">Carregando...</p>
          ) : folders.length === 0 ? (
            <p className="text-slate-400 text-sm">Nenhuma pasta criada</p>
          ) : (
            <div className="space-y-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                    selectedFolder?.id === folder.id
                      ? 'bg-primary/20 border border-primary/50'
                      : 'bg-slate-800/50 border border-slate-700 hover:border-primary/30'
                  }`}
                  onClick={() => setSelectedFolder(folder)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {selectedFolder?.id === folder.id ? (
                      <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-white text-sm truncate">{folder.name}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:bg-red-600/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Files Content */}
        <Card className="md:col-span-3 p-6 glass-effect border-white/5">
          {!selectedFolder ? (
            <div className="text-center py-12">
              <Folder className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">Selecione uma pasta para ver os arquivos</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6">
                <Folder className="w-5 h-5 text-primary" />
                <ChevronRight className="w-4 h-4 text-slate-500" />
                <h3 className="text-white font-semibold">{selectedFolder.name}</h3>
                <span className="text-slate-500 text-sm">({files.length} arquivo{files.length !== 1 ? 's' : ''})</span>
              </div>

              {files.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Nenhum arquivo nesta pasta</p>
                  <p className="text-slate-500 text-sm mt-2">Use o botão &ldquo;Upload PDF&rdquo; para adicionar arquivos</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {files.map((file) => (
                    <Card key={file.id} className="p-4 bg-slate-800/50 border-slate-700 hover:border-primary/50 transition-all">
                      <div className="flex items-start gap-3 mb-3">
                        <FileCheck className="w-10 h-10 text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate mb-1">{file.filename}</p>
                          <p className="text-slate-400 text-xs">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>

                      {file.notes && (
                        <p className="text-slate-400 text-xs mb-3 line-clamp-2">{file.notes}</p>
                      )}

                      <div className="text-xs text-slate-500 mb-3">
                        <p>Por: {file.uploaded_by_name}</p>
                        <p>{new Date(file.uploaded_at).toLocaleString('pt-BR')}</p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-slate-700 text-white hover:bg-slate-700"
                          onClick={() => handleDownloadFile(file)}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Baixar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-700 text-red-400 hover:bg-red-600/20"
                          onClick={() => handleDeleteFile(file.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};
