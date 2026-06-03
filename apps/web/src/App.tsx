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
        <SignIn />
      </SignedOut>

      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}
