import { NavLink } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { MessageSquare, Upload, Database, User, LogOut, Sparkles } from "lucide-react";

export default function Sidebar() {
    const { signOut } = useAuth();
    const { user } = useUser();

    const navItems = [
        { to: "/chat", label: "Ask AI", icon: MessageSquare },
        { to: "/upload", label: "Upload Dataset", icon: Upload },
        { to: "/datasets", label: "Datasets", icon: Database },
        { to: "/profile", label: "Profile", icon: User },
    ];

    return (
        <aside className="w-64 bg-slate-950 text-slate-100 flex flex-col h-full border-r border-slate-800">
            {/* Top Brand Block */}
            <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
                {/* Logo mark using brand colors */}
                <div className="relative p-2 rounded-lg flex-shrink-0">
                    <div className="absolute inset-0 rounded-lg bg-brand-blue" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-brand-orange translate-x-1 translate-y-1" />
                    <Sparkles className="h-5 w-5 relative text-white" />
                </div>
                <div>
                    <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                        TBO Analytics
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">Made for tbo.com</p>
                </div>
            </div>

            {/* Nav Menu */}
            <nav className="flex-1 px-4 py-6 space-y-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    isActive
                                        ? "bg-brand-blue text-white shadow-sm ring-1 ring-brand-blue-light/30"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <Icon className={`h-4 w-4 ${isActive ? "text-brand-orange" : ""}`} />
                                    <span>{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </nav>


            {/* User Session Info & Action */}
            {user && (
                <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                    <div className="flex items-center space-x-3 mb-3">
                        {user.imageUrl ? (
                            <img
                                src={user.imageUrl}
                                alt={user.fullName || "User Avatar"}
                                className="h-9 w-9 rounded-full ring-2 ring-brand-blue"
                            />
                        ) : (
                            <div className="h-9 w-9 rounded-full bg-brand-blue flex items-center justify-center text-white font-bold text-sm">
                                {user.firstName?.charAt(0) || "U"}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate">
                                {user.fullName || "User Account"}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                                {user.primaryEmailAddress?.emailAddress}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => signOut()}
                        className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs font-medium border border-slate-800 transition-colors cursor-pointer"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Sign Out</span>
                    </button>
                </div>
            )}
        </aside>
    );
}
