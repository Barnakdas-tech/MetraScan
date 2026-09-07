import axios from "axios";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("metrascan.token");
  return token ? { Authorization: "Bearer " + token } : {};
}

/**
 * Loads an auth-protected image through the API client (Bearer token
 * attached) and returns a blob object URL. Caller must revoke the URL
 * when done.
 */
export async function loadAuthenticatedImage(url: string): Promise<string> {
  // `url` is an absolute app path (/api/v1/storage/...) — no axios baseURL.
  const res = await axios.get<Blob>(url, { responseType: "blob", headers: authHeaders() });
  return URL.createObjectURL(res.data);
}
