import { Outlet } from "react-router-dom";
import { useState } from "react";
import Sidebar from "../components/layout/Sidebar";
import CommandPalette from "../components/shared/CommandPalette";
import { ErrorBoundary } from "../components/shared/ErrorBoundary";

export default function AppLayout() {
    const [commandOpen, setCommandOpen] = useState(false);

    return (
        <div className="flex h-screen w-screen overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
            {/* Navigation Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <ErrorBoundary fallbackMessage="We encountered an unexpected rendering error. Please try navigating away and back, or reloading the page.">
                    <Outlet />
                </ErrorBoundary>
            </main>
            
            <CommandPalette open={commandOpen} setOpen={setCommandOpen} />
        </div>
    );
}
