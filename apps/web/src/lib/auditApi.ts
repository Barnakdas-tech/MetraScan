import { api } from "./api";

export interface AuditLogItem {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

export interface AuditLogsResponse {
  items: AuditLogItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export async function listAuditLogs(params?: {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
}): Promise<AuditLogsResponse> {
  const res = await api.get<{ data: AuditLogsResponse }>("/audit", { params });
  return res.data.data;
}
