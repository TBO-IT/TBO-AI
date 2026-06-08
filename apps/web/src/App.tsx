import {
  SignedIn,
  SignedOut,
  SignIn,
} from "@clerk/clerk-react";

import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center">
          <SignIn />
        </div>
      </SignedOut>

      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}

export default App;