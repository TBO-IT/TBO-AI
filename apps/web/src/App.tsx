import {
  SignedIn,
  SignedOut,
  SignIn,
  useAuth,
} from "@clerk/clerk-react";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { setupAuthInterceptor } from "./api/authInterceptor";
import AppLayout from "./layouts/AppLayout";
import ChatPage from "./pages/ChatPage";
import UploadPage from "./pages/UploadPage";
import DatasetsPage from "./pages/DatasetsPage";
import ProfilePage from "./pages/ProfilePage";

function AppContent() {
  const { getToken } = useAuth();

  useEffect(() => {
    setupAuthInterceptor(getToken);
  }, [getToken]);

  return (
    <BrowserRouter>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      <SignedIn>
        <Routes>
          {/* Main Layout containing application routes */}
          <Route element={<AppLayout />}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            
            {/* Redirect root path to chat */}
            <Route path="/" element={<Navigate to="/chat" replace />} />
            
            {/* Catch-all route redirecting back to chat */}
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Route>
        </Routes>
      </SignedIn>
    </BrowserRouter>
  );
}

import { ThemeProvider } from "./context/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}