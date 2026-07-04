import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface ProgressiveLoaderProps {
    messages?: string[];
    interval?: number;
    className?: string;
}

const DEFAULT_MESSAGES = [
    "Initializing analysis...",
    "Querying dataset...",
    "Crunching numbers...",
    "Identifying outliers...",
    "Generating insights...",
    "Finalizing report..."
];

export function ProgressiveLoader({
    messages = DEFAULT_MESSAGES,
    interval = 3000,
    className = ""
}: ProgressiveLoaderProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1 < messages.length ? prev + 1 : prev));
        }, interval);

        return () => clearInterval(timer);
    }, [messages.length, interval]);

    return (
        <div className={`flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 space-y-4 ${className}`}>
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="animate-pulse text-lg font-medium">{messages[currentIndex]}</p>
        </div>
    );
}
