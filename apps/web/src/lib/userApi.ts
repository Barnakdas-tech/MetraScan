import { api } from "./api";
import type { AuthUser } from "../auth/AuthContext";

export async function updateProfile(data: { name?: string; email?: string }): Promise<AuthUser> {
  const res = await api.patch<{ data: AuthUser }>("/users/me", data);
  return res.data.data;
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post("/users/me/password", { currentPassword, newPassword });
}

export interface UserListItem extends AuthUser {
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export async function listUsers(): Promise<UserListItem[]> {
  const res = await api.get<{ data: UserListItem[] }>("/users");
  return res.data.data;
}

export async function createUser(payload: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER";
}): Promise<UserListItem> {
  const res = await api.post<{ data: UserListItem }>("/users", payload);
  return res.data.data;
}

export async function updateUserRole(
  userId: string,
  role: "ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER"
): Promise<UserListItem> {
  const res = await api.patch<{ data: UserListItem }>(`/users/${userId}/role`, { role });
  return res.data.data;
}

export async function updateUserStatus(userId: string, isActive: boolean): Promise<UserListItem> {
  const res = await api.patch<{ data: UserListItem }>(`/users/${userId}/status`, { isActive });
  return res.data.data;
}

