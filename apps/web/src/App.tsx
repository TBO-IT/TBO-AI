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
import { ChatHistoryProvider } from "./context/ChatHistoryContext";
import AppLayout from "./layouts/AppLayout";

// ── Pages ──
import CopilotPage from "./pages/CopilotPage";
import UploadPage from "./pages/UploadPage";
import DatasetsPage from "./pages/DatasetsPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import HotelDeepDivePage from "./pages/HotelDeepDivePage";
import SupplierDeepDivePage from "./pages/SupplierDeepDivePage";
import ChainDeepDivePage from "./pages/ChainDeepDivePage";
import DeepDivesIndexPage from "./pages/DeepDivesIndexPage";
import DestinationDeepDivePage from "./pages/DestinationDeepDivePage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import UsageDashboard from "./pages/UsageDashboard";
import AdminRoute from "./components/auth/AdminRoute";

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
                        <Route path="/deep-dives" element={<DeepDivesIndexPage />} />
                        <Route path="/deep-dives/hotel/:id" element={<HotelDeepDivePage />} />
                        <Route path="/deep-dives/supplier/:id" element={<SupplierDeepDivePage />} />
                        <Route path="/deep-dives/chain/:id" element={<ChainDeepDivePage />} />
                        <Route path="/deep-dives/destination/:id" element={<DestinationDeepDivePage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/usage" element={<UsageDashboard />} />
                        <Route path="/profile" element={<ProfilePage />} />

                        <Route element={<AdminRoute />}>
                            <Route path="/admin" element={<AdminDashboardPage />} />
                        </Route>

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
                <ChatHistoryProvider>
                    <AppContent />
                </ChatHistoryProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}