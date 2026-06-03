import {
  SignedIn,
  SignedOut,
  SignIn,
} from "@clerk/clerk-react";

import Dashboard from "./Dashboard";

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="auth-container">
          <SignIn />
        </div>
      </SignedOut>

      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}
