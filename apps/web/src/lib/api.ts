import axios, { AxiosError } from "axios";

export const api = axios.create({ baseURL: "/api/v1" });

/**
 * Downloads an auth-protected file via axios (Bearer token attached),
 * then triggers a browser download via a temporary blob anchor.
 * Direct href navigation cannot attach the Authorization header, so
 * protected endpoints must be downloaded this way.
 */
export async function downloadAuthenticatedFile(url: string, filename: string): Promise<void> {
  const res = await api.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(res.data);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function viewAuthenticatedFile(url: string): Promise<void> {
  const res = await api.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(res.data);
  const newWindow = window.open(objectUrl, "_blank");
  if (newWindow) {
    // Revoke object URL after giving the browser time to open it
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  }
}

api.interceptors.request.use(config => {
  const token = localStorage.getItem("metrascan.token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("metrascan.token");
      localStorage.removeItem("metrascan.user");
      window.location.href = "/login";
    }
    throw err;
  }
);

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as any;
    if (data?.error?.details && typeof data.error.details === "object") {
      const detailsStr = Object.entries(data.error.details)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("; ");
      return `${data?.error?.message || "Validation failed"}: ${detailsStr}`;
    }
    return data?.error?.message ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}
