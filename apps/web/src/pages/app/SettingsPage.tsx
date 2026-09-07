import { useState } from "react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { useAuth } from "../../auth/AuthContext";
import { updateProfile, updatePassword } from "../../lib/userApi";
import { getErrorMessage } from "../../lib/api";

export default function SettingsPage() {
  const { user } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSavingProfile(true);
    setProfileError("");
    setProfileSuccess(false);
    try {
      const updated = await updateProfile({ name, email });
      const stored = localStorage.getItem("metrascan.user");
      if (stored) {
        localStorage.setItem("metrascan.user", JSON.stringify({ ...JSON.parse(stored), name: updated.name, email: updated.email }));
      }
      setProfileSuccess(true);
      setTimeout(() => {
        setProfileSuccess(false);
        window.location.reload();
      }, 1000);
    } catch (err) {
      setProfileError(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || newPassword.length < 8) return;
    setSavingPassword(true);
    setPasswordError("");
    setPasswordSuccess(false);
    try {
      await updatePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account profile, preferences, and system security." />
      <div className="mx-auto mt-6 max-w-4xl px-4 pb-12 sm:px-6 lg:px-8 space-y-6">
        
        <Card title="Profile Information">
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="flex items-center gap-3 py-2 text-sm">
              <span className="font-medium text-slate-700">Role:</span>
              <Badge tone="info">{user?.role}</Badge>
              <span className="text-slate-500 text-xs ml-2">Contact your administrator to change your system role.</span>
            </div>

            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            
            <div className="flex items-center gap-4 pt-2">
              <Button type="submit" isLoading={savingProfile}>Save Profile</Button>
              {profileSuccess && <span className="text-sm font-medium text-emerald-600">Profile saved successfully!</span>}
            </div>
          </form>
        </Card>

        <Card title="Security & Password">
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
            />
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <p className="text-xs text-slate-500">Must be at least 8 characters long.</p>

            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}

            <div className="flex items-center gap-4 pt-2">
              <Button type="submit" variant="secondary" isLoading={savingPassword}>Update Password</Button>
              {passwordSuccess && <span className="text-sm font-medium text-emerald-600">Password updated successfully!</span>}
            </div>
          </form>
        </Card>

        <Card title="System Information">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-surface-border pb-2">
              <span className="font-medium text-slate-700">Application</span>
              <span className="text-slate-600">MetraScan Legal Metrology Platform</span>
            </div>
            <div className="flex justify-between border-b border-surface-border pb-2">
              <span className="font-medium text-slate-700">Environment</span>
              <span className="text-slate-600">Production</span>
            </div>
            <div className="flex justify-between pb-2">
              <span className="font-medium text-slate-700">System Time</span>
              <span className="text-slate-600">{new Date().toLocaleString()}</span>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
