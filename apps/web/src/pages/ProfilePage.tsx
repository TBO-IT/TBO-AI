import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { User, Mail, Shield, Database, MessageSquare, Award, Clock, Loader2, AlertCircle } from "lucide-react";
import { getProfile, type UserProfile } from "../api/profileApi";

export default function ProfilePage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getProfile();
        setProfile(data);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.error || "Failed to load profile data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats = [
    {
      label: "Role",
      value: profile ? profile.role : "—",
      icon: Shield,
      desc: "Organization access level",
    },
    {
      label: "Datasets Uploaded",
      value: profile ? profile.datasetsUploaded.toString() : "—",
      icon: Database,
      desc: "Total CSV datasets processed",
    },
    {
      label: "Queries Run",
      value: profile ? profile.queriesRun.toString() : "—",
      icon: MessageSquare,
      desc: "Natural language questions asked",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 md:p-10 transition-colors">
      <div className="max-w-4xl mx-auto">
        {/* Profile Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            User Profile
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage your credentials, organization permissions, and account statistics.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start space-x-3 mb-6">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-800 dark:text-red-400">Could not load profile</h4>
              <p className="text-xs text-red-700 dark:text-red-500 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Profile Info Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-8 transition-colors">
          {/* Cover Header */}
          <div className="h-32 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 relative" />

          <div className="p-8 relative pt-0">
            <div className="flex flex-col sm:flex-row sm:items-end sm:space-x-6 -mt-12 mb-6">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={user.fullName || "User profile picture"}
                  className="h-24 w-24 rounded-2xl ring-4 ring-white dark:ring-slate-900 shadow-md bg-white dark:bg-slate-900 flex-shrink-0"
                />
              ) : (
                <div className="h-24 w-24 rounded-2xl ring-4 ring-white dark:ring-slate-900 shadow-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-300 font-bold text-3xl flex-shrink-0">
                  {user?.firstName?.charAt(0) || "U"}
                </div>
              )}

              <div className="mt-4 sm:mt-0 flex-1">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {user?.fullName || "User Account"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  {user?.primaryEmailAddress?.emailAddress || "No email associated"}
                </p>
              </div>

              <div className="mt-4 sm:mt-0 flex items-center space-x-2">
                {loading ? (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-bold">
                    <Loader2 className="h-3 w-3 animate-spin text-brand-blue" />
                    <span>Loading...</span>
                  </span>
                ) : profile ? (
                  <span className="inline-flex items-center space-x-1 px-3 py-1 bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-blue-light border border-brand-blue/20 dark:border-brand-blue/30 rounded-full text-xs font-bold capitalize">
                    <Award className="h-3.5 w-3.5 mr-0.5" />
                    <span>{profile.role}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-3 py-1 bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-blue-light border border-brand-blue/20 dark:border-brand-blue/30 rounded-full text-xs font-bold">
                    <Award className="h-3.5 w-3.5 mr-0.5" />
                    <span>Enterprise Tier</span>
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Account Credentials</h3>

                <div className="flex items-center space-x-3 text-sm">
                  <User className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span className="text-slate-500 dark:text-slate-400 w-24">Full Name:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">{user?.fullName || "Not Configured"}</span>
                </div>

                <div className="flex items-center space-x-3 text-sm">
                  <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span className="text-slate-500 dark:text-slate-400 w-24">Email Address:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium break-all">{user?.primaryEmailAddress?.emailAddress || "Not Configured"}</span>
                </div>

                <div className="flex items-center space-x-3 text-sm">
                  <Shield className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span className="text-slate-500 dark:text-slate-400 w-24">Role:</span>
                  {loading ? (
                    <span className="text-slate-400 dark:text-slate-500 font-medium text-xs flex items-center space-x-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Loading...</span>
                    </span>
                  ) : (
                    <span className="text-slate-800 dark:text-slate-200 font-medium capitalize">
                      {profile?.role || "Unknown"}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3 text-sm">
                  <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span className="text-slate-500 dark:text-slate-400 w-24">Member Since:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Recently"}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Authentication Details</h3>
                <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 leading-relaxed space-y-2">
                  <p>Authenticated securely via <strong className="text-slate-700 dark:text-slate-300">Clerk Identity Provider</strong>.</p>
                  <p>To modify your password, upload a custom avatar, or configure Multi-Factor Authentication (MFA), please visit your organization portal.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards Grid */}
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Platform Stats</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col justify-between transition-colors"
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                </div>
                <div>
                  {loading ? (
                    <div className="flex items-center space-x-2 mt-1">
                      <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />
                      <span className="text-xs text-slate-400 dark:text-slate-500">Loading...</span>
                    </div>
                  ) : (
                    <h4 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight capitalize">
                      {stat.value}
                    </h4>
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">{stat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
