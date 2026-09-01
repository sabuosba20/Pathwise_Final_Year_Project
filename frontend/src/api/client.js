import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  withCredentials: true,
  xsrfCookieName: "csrf_access_token",
  xsrfHeaderName: "X-CSRF-TOKEN",
});

// These endpoints are reachable while logged in (e.g. switching accounts
// from /login) and a 401 from them means "wrong credentials", not "your
// session died" -- they must not clear an unrelated, still-valid session.
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password"];

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.some((path) => requestUrl.startsWith(path));
    if (error.response?.status === 401 && !isPublicAuthRequest) {
      window.dispatchEvent(new Event("pathwise:unauthorized"));
    }
    return Promise.reject(error);
  },
);

export default client;
