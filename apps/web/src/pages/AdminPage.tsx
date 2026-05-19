import React from "react";
import { Link } from "react-router-dom";
import { MessageCircleOff, ShieldCheck, UsersRound } from "lucide-react";
import { Button, Panel, PanelBody, PanelHeader, toast } from "@kansha/ui";
import { api, getErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { notifyError } from "../lib/notifications";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  locationCount: number;
  telegramConnected: boolean;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLinkedAt: string | null;
};

export function AdminPage() {
  const { logout } = useAuth();
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);
  const lastErrorToast = React.useRef("");

  const refresh = React.useCallback(async (options: { notifyOnError?: boolean } = {}) => {
    const { notifyOnError = true } = options;
    setError("");
    try {
      const response = await api<{ users: AdminUser[] }>("/admin/users");
      setUsers(response.users);
      lastErrorToast.current = "";
    } catch (err) {
      const message = getErrorMessage(err, "Failed to load users");
      setError(message);
      if (notifyOnError && message !== lastErrorToast.current) {
        notifyError(err, "Failed to load users");
        lastErrorToast.current = message;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function disableTelegram(user: AdminUser) {
    setBusyUserId(user.id);
    try {
      await api(`/admin/users/${user.id}/telegram/disable`, { method: "POST" });
      await refresh({ notifyOnError: true });
      toast.success("Telegram disabled");
    } catch (err) {
      notifyError(err, "Could not disable Telegram");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      toast.success("Signed out");
    } catch (err) {
      notifyError(err, "Could not sign out");
    }
  }

  const connectedTelegram = users.filter((user) => user.telegramConnected).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 md:px-6">
      <div className="mx-auto max-w-[1280px]">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold">User management</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/dashboard">User dashboard</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
              Logout
            </Button>
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <section className="mt-5 grid gap-4 sm:grid-cols-3">
          <AdminMetric icon={<UsersRound className="h-5 w-5" />} label="Total users" value={users.length} />
          <AdminMetric icon={<ShieldCheck className="h-5 w-5" />} label="Admins" value={users.filter((user) => user.role === "admin").length} />
          <AdminMetric icon={<MessageCircleOff className="h-5 w-5" />} label="Telegram connected" value={connectedTelegram} />
        </section>

        <Panel className="mt-5">
          <PanelHeader>
            <h2 className="font-semibold">Users</h2>
            <p className="text-sm text-slate-500">Accounts, monitored location counts, and active Telegram links.</p>
          </PanelHeader>
          <PanelBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Locations</th>
                  <th className="px-4 py-3">Telegram</th>
                  <th className="px-4 py-3">Linked</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                      No users yet.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{user.name}</td>
                      <td className="px-4 py-3 text-slate-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-slate-700">{user.locationCount}</td>
                      <td className="px-4 py-3">
                        {user.telegramConnected ? (
                          <span className="font-medium text-slate-900">
                            {user.telegramUsername ? `@${user.telegramUsername}` : user.telegramFirstName ?? "Connected"}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not connected</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {user.telegramLinkedAt ? new Date(user.telegramLinkedAt).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!user.telegramConnected || busyUserId === user.id}
                          onClick={() => void disableTelegram(user)}
                        >
                          {busyUserId === user.id ? "Disabling" : "Disable Telegram"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}

function AdminMetric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700">{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
