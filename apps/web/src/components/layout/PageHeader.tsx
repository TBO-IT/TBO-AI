import { cn } from "../../lib/utils";

interface PageHeaderProps {
    title: string;
    description?: string;
    /** Right-side action slot */
    action?: React.ReactNode;
    className?: string;
}

/**
 * PageHeader — Consistent page title with optional description and action.
 */
export default function PageHeader({ title, description, action, className }: PageHeaderProps) {
    return (
        <div className={cn("flex items-start justify-between mb-8", className)}>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {description}
                    </p>
                )}
            </div>
            {action && <div className="flex-shrink-0 ml-4">{action}</div>}
        </div>
    );
}
