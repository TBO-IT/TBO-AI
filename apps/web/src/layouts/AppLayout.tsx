import { Outlet } from "react-router-dom";
import Sidebar from "../components/layout/Sidebar";

export default function AppLayout() {
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#f8f9fb] dark:bg-[#0a0e1a] text-slate-900 dark:text-slate-100 transition-colors">
            {/* Navigation Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <Outlet />
            </main>
        </div>
    );
}
