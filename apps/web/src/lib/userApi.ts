import { api } from "./api";
import type { AuthUser } from "../auth/AuthContext";

export async function updateProfile(data: { name?: string; email?: string }): Promise<AuthUser> {
  const res = await api.patch<{ data: AuthUser }>("/users/me", data);
  return res.data.data;
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post("/users/me/password", { currentPassword, newPassword });
}
