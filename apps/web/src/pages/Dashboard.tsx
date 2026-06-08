import { useAuth } from "@clerk/clerk-react";

export default function Dashboard() {
  const { getToken } = useAuth();

  async function testAuth() {
    const token = await getToken();

    const response = await fetch(
      "http://localhost:3000/api/me",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log(await response.json());
  }

  return (
    <div>
      <h1>Dashboard</h1>

      <button onClick={testAuth}>
        Test Auth
      </button>
    </div>
  );
}