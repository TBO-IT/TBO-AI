import { Outlet } from "react-router-dom";
import { useState } from "react";
import Sidebar from "../components/layout/Sidebar";
import CommandPalette from "../components/shared/CommandPalette";

export default function AppLayout() {
    const [commandOpen, setCommandOpen] = useState(false);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#f8f9fb] dark:bg-[#0a0e1a] text-slate-900 dark:text-slate-100 transition-colors">
            {/* Navigation Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <Outlet />
            </main>
            
            <CommandPalette open={commandOpen} setOpen={setCommandOpen} />
        </div>
    );
}
