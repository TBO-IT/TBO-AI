import { cn } from "../../lib/utils";

interface PageShellProps {
    children: React.ReactNode;
    /** Max-width variant */
    variant?: "narrow" | "default" | "wide" | "full";
    /** Additional class names */
    className?: string;
}

const MAX_WIDTHS = {
    narrow: "max-w-3xl",    // 768px — copilot chat
    default: "max-w-5xl",   // 1024px — general content
    wide: "max-w-7xl",      // 1280px — datasets, reports
    full: "max-w-full",     // full width
};

/**
 * PageShell — Wraps every page with consistent padding and max-width.
 */
export default function PageShell({ children, variant = "default", className }: PageShellProps) {
    return (
        <div className={cn("flex-1 overflow-y-auto", className)}>
            <div className={cn("mx-auto px-6 py-8 lg:px-10", MAX_WIDTHS[variant])}>
                {children}
            </div>
        </div>
    );
}
