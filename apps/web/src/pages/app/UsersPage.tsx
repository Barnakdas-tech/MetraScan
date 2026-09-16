import { useEffect, useState } from "react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import { useAuth } from "../../auth/AuthContext";
import {
  listUsers,
  createUser,
  updateUserRole,
  updateUserStatus,
  type UserListItem,
} from "../../lib/userApi";
import { getErrorMessage } from "../../lib/api";

const ROLE_OPTIONS = [
  { value: "INSPECTOR", label: "Inspector" },
  { value: "REVIEWER", label: "Reviewer" },
  { value: "ADMIN", label: "Administrator" },
  { value: "VIEWER", label: "Viewer (Read-only)" },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create User Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER">("INSPECTOR");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Updating state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createUser({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      setModalOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("INSPECTOR");
      await loadUsers();
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleChangeRole = async (targetUserId: string, role: "ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER") => {
    setActionLoading(`role-${targetUserId}`);
    try {
      await updateUserRole(targetUserId, role);
      await loadUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (targetUserId: string, currentStatus: boolean) => {
    setActionLoading(`status-${targetUserId}`);
    try {
      await updateUserStatus(targetUserId, !currentStatus);
      await loadUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && users.length === 0) {
    return <LoadingState label="Loading users..." />;
  }

  if (error && users.length === 0) {
    return <ErrorState message={error} retry={loadUsers} />;
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Provision, activate, and assign roles for Legal Metrology officers and administrators."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            + Create New User
          </Button>
        }
      />

      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <Card title="System Users">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {users.map(u => {
                  const isSelf = currentUser?.id === u.id;
                  const isBusy = actionLoading === `role-${u.id}` || actionLoading === `status-${u.id}`;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{u.name}</span>
                          {isSelf && (
                            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{u.email}</td>
                      <td className="px-3 py-3">
                        {isSelf ? (
                          <Badge tone="info">{u.role}</Badge>
                        ) : (
                          <select
                            value={u.role}
                            onChange={e => handleChangeRole(u.id, e.target.value as any)}
                            disabled={isBusy}
                            className="rounded border border-surface-border bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-brand focus:ring-1 focus:ring-brand"
                          >
                            {ROLE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={u.isActive ? "success" : "danger"}>
                          {u.isActive ? "ACTIVE" : "DEACTIVATED"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {isSelf ? (
                          <span className="text-xs text-slate-400 italic">Self (Locked)</span>
                        ) : (
                          <Button
                            variant={u.isActive ? "danger" : "secondary"}
                            size="sm"
                            onClick={() => handleToggleStatus(u.id, u.isActive)}
                            isLoading={actionLoading === `status-${u.id}`}
                          >
                            {u.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Create User Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Provision New User"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Full Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Inspector Sharma"
            required
          />
          <Input
            label="Email Address"
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="officer@legalmetrology.gov.in"
            required
          />
          <Input
            label="Initial Password"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Min 10 characters (uppercase, lowercase, number)"
            required
            minLength={10}
          />
          <Select
            label="System Role"
            value={newRole}
            onChange={e => setNewRole(e.target.value as any)}
            options={ROLE_OPTIONS}
          />

          {createError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{createError}</div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={creating}>
              Create Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
