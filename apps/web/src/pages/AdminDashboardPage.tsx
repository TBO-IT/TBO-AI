import React, { useState, useEffect } from "react";
import PageShell from "../components/layout/PageShell";
import { Users, Shield, ShieldAlert, Check, Loader2 } from "lucide-react";
import { api } from "../api/client";

interface AdminUser {
    id: string;
    fullName: string;
    email: string;
    role: "viewer" | "analyst" | "admin";
    isActive: boolean;
    joinedDate: string;
}

export default function AdminDashboardPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await api.get("/admin/users");
            setUsers(res.data);
        } catch (err) {
            console.error(err);
            setError("Failed to load users. You might not have permission.");
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        setUpdating(userId);
        try {
            const res = await api.post(`/admin/users/${userId}/role`, { role: newRole });
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
        } catch (err: any) {
            alert(err.response?.data?.error || err.message || "Failed to update role");
        } finally {
            setUpdating(null);
        }
    };

    if (loading) {
        return (
            <PageShell variant="default">
                <div className="flex items-center justify-center py-20 text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Loading users...</span>
                </div>
            </PageShell>
        );
    }

    if (error) {
        return (
            <PageShell variant="default">
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg flex items-center gap-3">
                    <ShieldAlert className="h-5 w-5" />
                    <span>{error}</span>
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell variant="default">
            <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                    <h1 className="text-3xl font-light text-slate-900 dark:text-white flex items-center gap-3">
                        <Shield className="h-8 w-8 text-blue-500" />
                        Admin Dashboard
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        Manage users, roles, and access permissions across the system.
                    </p>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-6 py-4 font-medium">User</th>
                                    <th className="px-6 py-4 font-medium">Joined Date</th>
                                    <th className="px-6 py-4 font-medium">Role</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {users.map(user => (
                                    <tr key={user.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                                                    {user.fullName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-900 dark:text-white">
                                                        {user.fullName}
                                                    </div>
                                                    <div className="text-slate-500 dark:text-slate-400 text-xs">
                                                        {user.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                            {new Date(user.joinedDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                                user.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                                user.role === 'analyst' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                {updating === user.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                                ) : (
                                                    <select
                                                        value={user.role}
                                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                        disabled={user.role === 'admin'}
                                                        className="text-sm bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        <option value="viewer">Viewer</option>
                                                        <option value="analyst">Analyst</option>
                                                        {user.role === 'admin' && <option value="admin">Admin</option>}
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}
