import {
  SignedIn,
  SignedOut,
  SignIn,
  useAuth,
} from "@clerk/clerk-react";

import { useEffect } from "react";

import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/uploadPage.tsx";

import { setupAuthInterceptor }
  from "./api/authInterceptor";

function AppContent() {

  const { getToken } = useAuth();

  useEffect(() => {
    setupAuthInterceptor(getToken);
  }, [getToken]);

  return (
    <>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center">
          <SignIn />
        </div>
      </SignedOut>

      <SignedIn>
        <UploadPage />
      </SignedIn>
    </>
  );
}

export default function App() {
  return <AppContent />;
}