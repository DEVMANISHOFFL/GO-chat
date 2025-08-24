'use client';
import React, { useEffect, useState } from 'react';
import { Search, Users, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';


function ThemeToggle() {
    const [isDark, setIsDark] = useState<boolean>(true);
    useEffect(() => {
        const root = document.documentElement;
        setIsDark(root.classList.contains('dark'));
    }, []);
    useEffect(() => {
        const root = document.documentElement;
        if (isDark) root.classList.add('dark');
        else root.classList.remove('dark');
    }, [isDark]);
    return (
        <Button variant="ghost" size="icon" onClick={() => setIsDark((v) => !v)} aria-label="Toggle theme">
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
    );
}

export default function HeaderBar({ title, subtitle, onSearch, onOpenRightPanel }: { title: string; subtitle?: string; onSearch: () => void; onOpenRightPanel: () => void }) {
    return (
        <div className="flex h-14 w-full items-center gap-2">
            <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{title}</div>
                {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
            </div>
            <Button variant="ghost" size="icon" onClick={onSearch} aria-label="Search">
                <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onOpenRightPanel} aria-label="Open panel">
                <Users className="h-5 w-5" />
            </Button>
            <ThemeToggle />
        </div>
    );
}