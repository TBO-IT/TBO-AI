import { useState, useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { Database, FileText, Search, Settings, Sun, Moon, Sparkles, Building, Building2 } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { getDatasets } from "../../api/datasetApi";
import type { Dataset } from "../../types/dataset";
import { cn } from "../../lib/utils";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";

export default function CommandPalette({
    open,
    setOpen,
}: {
    open: boolean;
    setOpen: (open: boolean) => void;
}) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [datasets, setDatasets] = useState<Dataset[]>([]);

    useEffect(() => {
        if (open && datasets.length === 0) {
            getDatasets().then(setDatasets).catch(console.error);
        }
    }, [open, datasets.length]);

    useKeyboardShortcut("k", () => setOpen(!open), { meta: true });

    const runCommand = (command: () => void) => {
        setOpen(false);
        command();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60" onClick={() => setOpen(false)} />
            
            <Command
                className={cn(
                    "relative z-50 w-full max-w-xl overflow-hidden rounded-xl border shadow-2xl",
                    "bg-white dark:bg-[#0c1021]",
                    "border-slate-200 dark:border-slate-800/80"
                )}
            >
                <div className="flex items-center border-b border-slate-200 dark:border-slate-800/60 px-4">
                    <Search className="h-5 w-5 text-slate-400 shrink-0" />
                    <Command.Input
                        autoFocus
                        placeholder="Type a command or search..."
                        className={cn(
                            "flex h-14 w-full bg-transparent py-4 text-sm outline-none ml-3",
                            "text-slate-900 dark:text-slate-100",
                            "placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        )}
                    />
                    <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 px-1.5 font-mono text-[10px] font-medium text-slate-500">
                        ESC
                    </kbd>
                </div>

                <Command.List className="max-h-[300px] overflow-y-auto p-2 scroll-smooth">
                    <Command.Empty className="py-6 text-center text-sm text-slate-500">
                        No results found.
                    </Command.Empty>

                    <Command.Group heading="Navigation" className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5">
                        <Command.Item
                            onSelect={() => runCommand(() => navigate("/copilot"))}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800/60 aria-selected:text-slate-900 dark:aria-selected:text-white"
                        >
                            <Sparkles className="h-4 w-4 text-slate-400" />
                            <span>Ask Copilot</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => runCommand(() => navigate("/reports"))}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800/60 aria-selected:text-slate-900 dark:aria-selected:text-white"
                        >
                            <FileText className="h-4 w-4 text-slate-400" />
                            <span>View Reports</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => runCommand(() => navigate("/settings"))}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800/60 aria-selected:text-slate-900 dark:aria-selected:text-white"
                        >
                            <Settings className="h-4 w-4 text-slate-400" />
                            <span>Settings</span>
                        </Command.Item>
                    </Command.Group>

                    <Command.Group heading="Deep Dives" className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5">
                        <Command.Item
                            onSelect={() => runCommand(() => navigate("/deep-dives/hotel/Hilton%20London"))}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800/60 aria-selected:text-slate-900 dark:aria-selected:text-white"
                        >
                            <Building2 className="h-4 w-4 text-indigo-400" />
                            <span>Analyze Hilton London</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => runCommand(() => navigate("/deep-dives/supplier/Expedia"))}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800/60 aria-selected:text-slate-900 dark:aria-selected:text-white"
                        >
                            <Building className="h-4 w-4 text-emerald-400" />
                            <span>Analyze Expedia</span>
                        </Command.Item>
                    </Command.Group>

                    {datasets.length > 0 && (
                        <Command.Group heading="Datasets" className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5">
                            {datasets.map((dataset) => (
                                <Command.Item
                                    key={dataset.id}
                                    onSelect={() => runCommand(() => navigate("/datasets"))}
                                    className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800/60 aria-selected:text-slate-900 dark:aria-selected:text-white"
                                >
                                    <Database className="h-4 w-4 text-slate-400" />
                                    <span>{dataset.filename}</span>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}

                    <Command.Group heading="System" className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5">
                        <Command.Item
                            onSelect={() => runCommand(() => toggleTheme())}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800/60 aria-selected:text-slate-900 dark:aria-selected:text-white"
                        >
                            {theme === "dark" ? (
                                <Sun className="h-4 w-4 text-brand-orange" />
                            ) : (
                                <Moon className="h-4 w-4 text-brand-blue" />
                            )}
                            <span>Toggle Theme</span>
                        </Command.Item>
                    </Command.Group>
                </Command.List>
            </Command>
        </div>
    );
}
