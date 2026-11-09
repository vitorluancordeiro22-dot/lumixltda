import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { User, Moon, Sun, Zap } from 'lucide-react';
import { BarcodeRegistry } from '../components/BarcodeRegistry';

export const Settings = () => {

    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [profile, setProfile] = useState({
        name: user?.name || '',
        email: user?.email || ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;

        setProfile({
            ...profile,
            [name]: value
        });
    };

    return (

        <div className="space-y-8">

            <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-2">
                    Configurações
                </h1>

                <p className="text-muted-foreground">
                    Gerencie suas preferências
                </p>
            </div>

            {/* Perfil */}

            <Card className="p-6 space-y-4">

                <div className="flex items-center gap-4">

                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-8 h-8 text-primary"/>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold">{user?.name}</h2>
                        <p className="text-muted-foreground">{user?.email}</p>
                    </div>

                </div>

                <div className="grid gap-3">

                    <input
                        className="border rounded-md p-2"
                        type="text"
                        name="name"
                        value={profile.name}
                        onChange={handleChange}
                        placeholder="Nome"
                    />

                    <input
                        className="border rounded-md p-2"
                        type="email"
                        name="email"
                        value={profile.email}
                        onChange={handleChange}
                        placeholder="Email"
                    />

                </div>

                <Button>
                    Salvar Alterações
                </Button>

            </Card>

            {/* Aparência */}

            <Card className="p-6 flex items-center justify-between">

                <div className="flex items-center gap-3">

                    {theme === 'dark'
                        ? <Moon className="w-6 h-6"/>
                        : <Sun className="w-6 h-6"/>}

                    <div>
                        <h3 className="font-bold">
                            Tema
                        </h3>

                        <p className="text-sm text-muted-foreground">
                            Alterar modo claro ou escuro
                        </p>
                    </div>

                </div>

                <Button onClick={toggleTheme}>
                    {theme === 'light'
                        ? 'Modo Escuro'
                        : 'Modo Claro'}
                </Button>

            </Card>

            {/* Códigos de barras (Estoque) */}

            <BarcodeRegistry />

            {/* Sobre */}

            <Card className="p-6 flex gap-4">

                <Zap className="w-6 h-6 text-primary"/>

                <div>

                    <h3 className="text-xl font-bold mb-2">
                        Sobre o Lumix
                    </h3>

                    <p className="text-muted-foreground">
                        Sistema de Gestão Inteligente de Produção desenvolvido por Vitor.
                    </p>

                    <p className="text-sm text-muted-foreground mt-2">
                        Versão 1.0.0 • 2025
                    </p>

                </div>

            </Card>

        </div>
    );
};
