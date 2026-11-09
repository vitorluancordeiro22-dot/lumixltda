import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { User, Moon, Sun, Zap, MonitorSmartphone, Check } from 'lucide-react';
import { BarcodeRegistry } from '../components/BarcodeRegistry';


const THEME_OPTIONS = [
    { value: 'light', label: 'Claro', hint: 'Fundo claro, ideal de dia', icon: Sun },
    { value: 'dark', label: 'Escuro', hint: 'Descansa a vista, economiza bateria', icon: Moon },
    { value: 'system', label: 'Automático', hint: 'Segue o tema do celular/computador', icon: MonitorSmartphone },
];

// Miniatura da tela em cada tema
const Mini = ({ dark }) => (
    <div className={`flex h-full w-full ${dark ? 'bg-[#0A0F14]' : 'bg-[#F8FAFC]'}`}>
        <div className={`w-1/4 h-full p-1.5 space-y-1 ${dark ? 'bg-[#11181F]' : 'bg-[#FFFFFF]'}`}>
            <div className={`h-1.5 rounded ${dark ? 'bg-[#22C587]' : 'bg-[#0B8F5A]'}`}/>
            <div className={`h-1.5 rounded ${dark ? 'bg-[#283440]' : 'bg-[#E2E8F0]'}`}/>
            <div className={`h-1.5 rounded ${dark ? 'bg-[#283440]' : 'bg-[#E2E8F0]'}`}/>
        </div>
        <div className="flex-1 p-2 space-y-1.5">
            <div className={`h-2 w-1/2 rounded ${dark ? 'bg-[#E5ECF1]' : 'bg-[#0F2E3A]'}`}/>
            <div className="grid grid-cols-2 gap-1.5">
                <div className={`h-6 rounded ${dark ? 'bg-[#11181F]' : 'bg-[#FFFFFF] border border-[#E2E8F0]'}`}/>
                <div className={`h-6 rounded ${dark ? 'bg-[#11181F]' : 'bg-[#FFFFFF] border border-[#E2E8F0]'}`}/>
            </div>
            <div className={`h-2 w-1/3 rounded ${dark ? 'bg-[#22C587]' : 'bg-[#0B8F5A]'}`}/>
        </div>
    </div>
);

const ThemePreview = ({ mode }) => (
    <div className="h-20 w-full overflow-hidden rounded-xl border border-border flex">
        {mode === 'system'
            ? (<><div className="w-1/2 overflow-hidden"><div className="w-[200%] h-full"><Mini dark={false}/></div></div>
                 <div className="w-1/2 overflow-hidden"><div className="w-[200%] h-full -translate-x-1/2"><Mini dark/></div></div></>)
            : <Mini dark={mode === 'dark'}/>}
    </div>
);

export const Settings = () => {

    const { user } = useAuth();
    const { theme, preference, setPreference } = useTheme();

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

            <Card className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon className="w-6 h-6"/> : <Sun className="w-6 h-6"/>}
                    <div>
                        <h3 className="font-bold">Tema</h3>
                        <p className="text-sm text-muted-foreground">Escolha a aparência do Lumix neste aparelho</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {THEME_OPTIONS.map((opt) => {
                        const active = preference === opt.value;
                        const Icon = opt.icon;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                data-testid={`theme-${opt.value}`}
                                onClick={() => setPreference(opt.value)}
                                className={`text-left rounded-2xl border-2 p-3 transition ${active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}`}
                            >
                                <ThemePreview mode={opt.value} />
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="flex items-center gap-2 font-semibold">
                                        <Icon className="w-4 h-4"/> {opt.label}
                                    </span>
                                    {active && <Check className="w-4 h-4 text-primary"/>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
                            </button>
                        );
                    })}
                </div>
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
