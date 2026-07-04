import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { getProfile } from "../../api/profileApi";
import { Loader2 } from "lucide-react";

export default function AdminRoute() {
    const { isLoaded, isSignedIn } = useAuth();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            getProfile()
                .then(profile => {
                    setIsAdmin(profile.role === 'admin');
                })
                .catch(() => {
                    setIsAdmin(false);
                });
        }
    }, [isLoaded, isSignedIn]);

    if (!isLoaded || isAdmin === null) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!isSignedIn) {
        return <Navigate to="/sign-in" replace />;
    }

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
