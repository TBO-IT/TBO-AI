import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
    children: ReactNode;
    fallbackMessage?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-red-50/50 dark:bg-red-950/10 rounded-xl border border-red-200/50 dark:border-red-900/30 m-4">
                    <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full mb-4">
                        <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 text-center max-w-md">
                        {this.props.fallbackMessage || 
                         "We encountered an unexpected error while trying to process or display this dataset. The data might be corrupted or in an unsupported format."}
                    </p>
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Reload Page
                    </button>
                    {this.state.error && (
                        <div className="mt-6 p-4 w-full max-w-xl bg-slate-100 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto">
                            <pre className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {this.state.error.message}
                            </pre>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
