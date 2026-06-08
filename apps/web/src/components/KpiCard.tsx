import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    valueClassName?: string;
}

export default function KpiCard({
    title,
    value,
    icon: Icon,
    valueClassName = "text-slate-900",
}: KpiCardProps) {
    return (
        <div
            className="
        bg-white
        rounded-xl
        border
        border-slate-200
        p-6
        shadow-sm
        hover:shadow-md
        transition-shadow
      "
        >
            <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-slate-500">
                    {title}
                </p>

                <Icon
                    size={20}
                    className="text-slate-400"
                />
            </div>

            <h2
                className={`
                    text-3xl
                    font-bold
                    ${valueClassName}
                `}
            >
                {value}
            </h2>
        </div>
    );
}