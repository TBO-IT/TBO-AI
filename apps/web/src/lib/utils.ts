import { type ClassValue, clsx } from "clsx";

/**
 * Utility for conditionally joining Tailwind classes.
 * Usage: cn("base-class", condition && "conditional-class")
 */
export function cn(...inputs: ClassValue[]): string {
    return clsx(inputs);
}

/**
 * Format a number with compact notation for large values.
 */
export function formatCompact(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
        return (value / 1_000_000).toFixed(1) + "M";
    }
    if (Math.abs(value) >= 1_000) {
        return (value / 1_000).toFixed(1) + "K";
    }
    return value.toFixed(1);
}

/**
 * Format a delta value with sign prefix.
 */
export function formatDelta(value: number): string {
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${value.toFixed(2)}`;
}

/**
 * Truncate text to a max length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "…";
}
