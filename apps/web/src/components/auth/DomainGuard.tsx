import { useUser, useClerk } from "@clerk/clerk-react";
import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function DomainGuard({ children }: { children: React.ReactNode }) {
    const { user, isLoaded } = useUser();
    const { signOut } = useClerk();

    useEffect(() => {
        if (isLoaded && user) {
            const email = user.primaryEmailAddress?.emailAddress || "";
            const allowedDomainsEnv = import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "tbo.com";
            const allowedDomains = allowedDomainsEnv.split(",").map((d: string) => d.trim().toLowerCase()).filter(Boolean);
            const domain = email.split("@")[1]?.toLowerCase() || "";

            if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
                // Sign out immediately if not allowed
                signOut();
            }
        }
    }, [isLoaded, user, signOut]);

    if (!isLoaded) return null;

    if (user) {
        const email = user.primaryEmailAddress?.emailAddress || "";
        const allowedDomainsEnv = import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "tbo.com";
        const allowedDomains = allowedDomainsEnv.split(",").map((d: string) => d.trim().toLowerCase()).filter(Boolean);
        const domain = email.split("@")[1]?.toLowerCase() || "";

        if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-center p-6">
                    <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-2xl flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                            <AlertCircle className="h-8 w-8 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                        <p className="text-slate-400 mb-8">
                            This application is restricted to authorized <b>@tbo.com</b> employees. Your account ({email}) does not have access.
                        </p>
                        <a 
                            href="/"
                            className="w-full py-2.5 bg-brand-blue text-white rounded-xl font-medium hover:bg-brand-blue/90 transition-colors"
                        >
                            Return to Login
                        </a>
                    </div>
                </div>
            );
        }
    }

    return <>{children}</>;
}
