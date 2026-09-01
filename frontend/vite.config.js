import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; "),
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

// Vite's development-only React Refresh bootstrap is an inline module. Keep
// the dev server loopback-only and apply CSP to the production preview instead.
const developmentSecurityHeaders = Object.fromEntries(
  Object.entries(securityHeaders).filter(([name]) => name !== "Content-Security-Policy"),
);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      headers: developmentSecurityHeaders,
      proxy: {
        "/api": env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000",
      },
    },
    preview: {
      headers: securityHeaders,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/setupTests.js",
      globals: true,
    },
  };
});
