import {
    SignedIn,
    SignedOut,
    SignIn,
    useAuth,
} from "@clerk/clerk-react";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupAuthInterceptor } from "./api/authInterceptor";
import { ThemeProvider } from "./context/ThemeContext";
import AppLayout from "./layouts/AppLayout";

// ── Pages ──
import CopilotPage from "./pages/CopilotPage";
import UploadPage from "./pages/UploadPage";
import DatasetsPage from "./pages/DatasetsPage";
import ReportsPage from "./pages/ReportsPage";
import ReportDetailPage from "./pages/ReportDetailPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";

// ── Query Client ──
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,     // 5 minutes
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
});

function AppContent() {
    const { getToken } = useAuth();

    useEffect(() => {
        setupAuthInterceptor(getToken);
    }, [getToken]);

    return (
        <BrowserRouter>
            <SignedOut>
                <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a]">
                    <SignIn routing="hash" />
                </div>
            </SignedOut>

            <SignedIn>
                <Routes>
                    <Route element={<AppLayout />}>
                        <Route path="/copilot" element={<CopilotPage />} />
                        <Route path="/datasets" element={<DatasetsPage />} />
                        <Route path="/datasets/upload" element={<UploadPage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/reports/:id" element={<ReportDetailPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/profile" element={<ProfilePage />} />

                        {/* Redirects */}
                        <Route path="/" element={<Navigate to="/copilot" replace />} />
                        <Route path="/chat" element={<Navigate to="/copilot" replace />} />
                        <Route path="/upload" element={<Navigate to="/datasets/upload" replace />} />
                        <Route path="*" element={<Navigate to="/copilot" replace />} />
                    </Route>
                </Routes>
            </SignedIn>
        </BrowserRouter>
    );
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <AppContent />
            </ThemeProvider>
        </QueryClientProvider>
    );
}