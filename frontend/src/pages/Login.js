import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { Loader2, FlaskConical, Factory } from 'lucide-react';

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [selectedMode, setSelectedMode] = useState(null); // null, 'laboratorio', 'producao'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
  };

  const handleBack = () => {
    setSelectedMode(null);
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    try {
      if (isLogin) {
        const result = await login(email, password, selectedMode);
        
        if (isMountedRef.current) {
          // Verifica se o modo solicitado foi concedido
          if (selectedMode === 'laboratorio' && result.role !== 'laboratorio') {
            toast.error('Acesso ao Laboratório negado. Entrando em modo Produção.');
          } else {
            toast.success('Login realizado com sucesso!');
          }
          
          // Mensagem motivacional para usuários de produção
          if (result.role === 'producao') {
            setTimeout(() => {
              toast(getMensagemMotivacional(result.user?.name), {
                icon: <Star className="h-5 w-5 text-yellow-500" />,
                duration: 5000,
              });
            }, 1500);
          }
          
          setTimeout(() => {
            if (isMountedRef.current) {
              // Redireciona baseado na role
              if (result.role === 'producao') {
                navigate('/counting');
              } else {
                navigate('/dashboard');
              }
            }
          }, 100);
        }
      } else {
        await register(email, password, name);
        if (isMountedRef.current) {
          toast.success('Cadastro realizado com sucesso!');
          
          // Mensagem de boas-vindas para novos usuários
          setTimeout(() => {
            toast(getMensagemMotivacional(name), {
              icon: <Star className="h-5 w-5 text-yellow-500" />,
              duration: 5000,
            });
          }, 1500);
          
          setTimeout(() => {
            if (isMountedRef.current) {
              navigate('/counting');
            }
          }, 100);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(error.response?.data?.detail || 'Erro ao autenticar');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Tela de seleção de modo
  if (selectedMode === null && isLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B1120] via-[#1a2942] to-[#0B1120]" />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

        <Card data-testid="mode-selection-card" className="relative z-10 w-full max-w-md mx-4 p-8 border shadow-lg bg-card">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2">Lumix</h1>
            <p className="text-muted-foreground text-sm">Gestão Inteligente de Produção</p>
          </div>

          <div className="space-y-4">
            <p className="text-center text-foreground font-medium mb-6">Selecione o modo de acesso:</p>
            
            <Button
              onClick={() => handleModeSelect('laboratorio')}
              data-testid="mode-laboratorio-btn"
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center gap-2 border-2 hover:border-primary hover:bg-primary/5 transition-all"
            >
              <FlaskConical className="h-8 w-8 text-primary" />
              <span className="font-semibold text-lg">Laboratório</span>
              <span className="text-xs text-muted-foreground">Acesso completo ao sistema</span>
            </Button>

            <Button
              onClick={() => handleModeSelect('producao')}
              data-testid="mode-producao-btn"
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center gap-2 border-2 hover:border-orange-500 hover:bg-orange-500/5 transition-all"
            >
              <Factory className="h-8 w-8 text-orange-500" />
              <span className="font-semibold text-lg">Produção</span>
              <span className="text-xs text-muted-foreground">Contagem e Amostras</span>
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              data-testid="toggle-auth-mode"
              onClick={() => setIsLogin(false)}
              className="text-primary hover:underline text-sm"
            >
              Não tem conta? Cadastre-se
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background with gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0B1120] via-[#1a2942] to-[#0B1120]" />
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Login Card */}
      <Card data-testid="login-card" className="relative z-10 w-full max-w-md mx-4 p-8 border shadow-lg bg-card">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Lumix</h1>
          <p className="text-muted-foreground text-sm">Gestão Inteligente de Produção</p>
          {selectedMode && isLogin && (
            <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              selectedMode === 'laboratorio' 
                ? 'bg-primary/10 text-primary' 
                : 'bg-orange-500/10 text-orange-600'
            }`}>
              {selectedMode === 'laboratorio' ? <FlaskConical className="h-4 w-4" /> : <Factory className="h-4 w-4" />}
              Modo {selectedMode === 'laboratorio' ? 'Laboratório' : 'Produção'}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">Nome</Label>
              <Input
                id="name"
                data-testid="name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
                placeholder="Seu nome"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              data-testid="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">Senha</Label>
            <Input
              id="password"
              data-testid="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
              placeholder="••••••••"
            />
          </div>

          <Button
            type="submit"
            data-testid="submit-button"
            disabled={loading}
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 glow-primary font-medium text-lg"
          >
            {loading ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processando...</>
            ) : (
              isLogin ? 'Entrar' : 'Cadastrar'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {isLogin && selectedMode && (
            <button
              type="button"
              data-testid="back-to-mode-selection"
              onClick={handleBack}
              className="text-muted-foreground hover:text-foreground text-sm block w-full"
            >
              ← Voltar para seleção de modo
            </button>
          )}
          <button
            type="button"
            data-testid="toggle-auth-mode"
            onClick={() => {
              setIsLogin(!isLogin);
              if (!isLogin) setSelectedMode(null);
            }}
            className="text-primary hover:underline text-sm"
          >
            {isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça login'}
          </button>
        </div>
      </Card>
    </div>
  );
};
