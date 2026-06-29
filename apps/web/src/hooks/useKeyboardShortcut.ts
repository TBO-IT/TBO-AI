import { useEffect } from "react";

export function useKeyboardShortcut(
    key: string,
    callback: () => void,
    options: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}
) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const matchKey = e.key.toLowerCase() === key.toLowerCase();
            const matchShift = options.shift ? e.shiftKey : !e.shiftKey;
            const matchAlt = options.alt ? e.altKey : !e.altKey;

            // Many users treat Ctrl and Meta interchangeably for shortcuts depending on OS
            const matchModifier = 
                (options.ctrl || options.meta) 
                ? (e.ctrlKey || e.metaKey) 
                : (!e.ctrlKey && !e.metaKey);

            if (matchKey && matchModifier && matchShift && matchAlt) {
                e.preventDefault();
                callback();
            }
        };

        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [key, callback, options]);
}
