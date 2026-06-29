
import PageShell from "../components/layout/PageShell";
import PageHeader from "../components/layout/PageHeader";

export default function SettingsPage() {
    return (
        <PageShell variant="default">
            <PageHeader
                title="Settings"
                description="Account preferences and platform configuration."
            />
            <div className="grid gap-6">
                {/* Appearance */}
                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Appearance</h3>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
                        Toggle dark mode using the sidebar theme button.
                    </p>
                </div>

                {/* Model */}
                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">AI Model</h3>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        The platform uses Claude for executive intelligence generation. Model selection is handled server-side.
                    </p>
                </div>

                {/* About */}
                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">About</h3>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        TBO Executive Intelligence Platform — v3.0
                    </p>
                </div>
            </div>
        </PageShell>
    );
}
