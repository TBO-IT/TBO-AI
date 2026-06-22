import { NavLink, useLocation } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import {
    MessageSquare,
    Database,
    FileText,
    Search as SearchIcon,
    Settings,
    LogOut,
    Sun,
    Moon,
    Sparkles,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { cn } from "../../lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
    { to: "/copilot", label: "Copilot", icon: MessageSquare, description: "Ask questions" },
    { to: "/datasets", label: "Datasets", icon: Database, description: "Manage data" },
    { to: "/reports", label: "Reports", icon: FileText, description: "Saved reports" },
    { to: "/deep-dives", label: "Deep Dives", icon: SearchIcon, description: "Entity analysis" },
];

export default function Sidebar() {
    const { signOut } = useAuth();
    const { user } = useUser();
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside
            className={cn(
                "flex flex-col h-full border-r transition-all duration-250 ease-out select-none",
                "bg-[#060912] text-slate-300 border-slate-800/60",
                collapsed ? "w-[68px]" : "w-[240px]"
            )}
        >
            {/* ── Brand ── */}
            <div className="flex items-center h-[60px] px-4 border-b border-slate-800/60">
                <div className="relative flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-blue-dark flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-orange border-2 border-[#060912]" />
                </div>
                <AnimatePresence>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            className="ml-3 overflow-hidden whitespace-nowrap"
                        >
                            <h1 className="text-[15px] font-bold tracking-tight text-white">
                                TBO Intelligence
                            </h1>
                            <p className="text-[10px] text-slate-500 font-medium -mt-0.5">
                                Executive Analytics
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Primary Nav ── */}
            <nav className="flex-1 px-2.5 py-4 space-y-0.5">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname.startsWith(item.to);
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={cn(
                                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                                isActive
                                    ? "bg-white/[0.08] text-white"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]",
                                collapsed && "justify-center px-0"
                            )}
                            title={collapsed ? item.label : undefined}
                        >
                            {/* Active indicator bar */}
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-active"
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full"
                                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                />
                            )}
                            <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", isActive && "text-accent")} />
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="truncate"
                                    >
                                        {item.label}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </NavLink>
                    );
                })}
            </nav>

            {/* ── Search / Command ── */}
            <div className="px-3 pb-2 pt-2">
                <button
                    onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                    className={cn(
                        "flex items-center w-full gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-150 cursor-pointer border",
                        "text-slate-400 border-slate-800/60 hover:text-slate-200 hover:bg-white/[0.04]",
                        collapsed && "justify-center px-0 border-transparent"
                    )}
                    title={collapsed ? "Search (⌘K)" : undefined}
                >
                    <SearchIcon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && (
                        <div className="flex items-center justify-between flex-1">
                            <span>Search...</span>
                            <kbd className="hidden sm:inline-flex h-4 items-center gap-0.5 rounded border border-slate-700 bg-slate-800 px-1 font-mono text-[9px] font-medium text-slate-400">
                                <span className="text-[10px]">⌘</span>K
                            </kbd>
                        </div>
                    )}
                </button>
            </div>

            {/* ── Bottom Section ── */}
            <div className="px-2.5 pb-2 space-y-0.5 border-t border-slate-800/60 pt-2">
                {/* Settings Toggle */}
                <NavLink
                    to="/settings"
                    className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                        location.pathname.startsWith("/settings")
                            ? "bg-white/[0.08] text-white"
                            : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]",
                        collapsed && "justify-center px-0"
                    )}
                    title={collapsed ? "Settings" : undefined}
                >
                    <Settings className="h-[18px] w-[18px] flex-shrink-0" />
                    {!collapsed && <span className="truncate">Settings</span>}
                </NavLink>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium w-full",
                        "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-all duration-150 cursor-pointer",
                        collapsed && "justify-center px-0"
                    )}
                    title={collapsed ? (theme === "dark" ? "Light Mode" : "Dark Mode") : undefined}
                >
                    {theme === "dark" ? (
                        <Sun className="h-[18px] w-[18px] flex-shrink-0 text-brand-orange" />
                    ) : (
                        <Moon className="h-[18px] w-[18px] flex-shrink-0 text-brand-blue-light" />
                    )}
                    {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
                </button>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium w-full",
                        "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all duration-150 cursor-pointer",
                        collapsed && "justify-center px-0"
                    )}
                >
                    {collapsed ? (
                        <ChevronRight className="h-[18px] w-[18px] flex-shrink-0" />
                    ) : (
                        <ChevronLeft className="h-[18px] w-[18px] flex-shrink-0" />
                    )}
                    {!collapsed && <span>Collapse</span>}
                </button>
            </div>

            {/* ── User ── */}
            {user && (
                <div className={cn(
                    "border-t border-slate-800/60 p-3",
                    collapsed ? "flex justify-center" : ""
                )}>
                    <div className={cn("flex items-center gap-3", collapsed && "flex-col gap-2")}>
                        {user.imageUrl ? (
                            <img
                                src={user.imageUrl}
                                alt={user.fullName || "User"}
                                className="h-8 w-8 rounded-full ring-1 ring-slate-700 flex-shrink-0"
                            />
                        ) : (
                            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                                {user.firstName?.charAt(0) || "U"}
                            </div>
                        )}
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-slate-200 truncate">
                                    {user.fullName || "User"}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">
                                    {user.primaryEmailAddress?.emailAddress}
                                </p>
                            </div>
                        )}
                        {!collapsed && (
                            <button
                                onClick={() => signOut()}
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                                title="Sign Out"
                            >
                                <LogOut className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </aside>
    );
}
