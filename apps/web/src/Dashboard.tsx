import { useEffect } from "react";

import { useAuth, useUser } from "@clerk/clerk-react";

export default function Dashboard() {
    const { getToken } = useAuth();

    const { user } = useUser();

    useEffect(() => {
        async function syncUser() {
            try {
                const token = await getToken();

                const response = await fetch(
                    "http://localhost:3000/auth/sync-user",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },

                        body: JSON.stringify({
                            email: user?.primaryEmailAddress?.emailAddress,

                            fullName: user?.fullName,
                        }),
                    }
                );

                const data = await response.json();

                console.log("SYNCED USER:", data);
            } catch (error) {
                console.error(error);
            }
        }

        if (user) {
            syncUser();
        }
    }, [user]);

    return (
        <div>
            <h1>Dashboard</h1>
        </div>
    );
}