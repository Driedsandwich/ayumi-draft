import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "AI_PROVIDER",
    "AI_API_KEY",
    "AI_MODEL",
    "AI_BASE_URL",
    "RATE_LIMIT_SECRET",
    "RATE_LIMIT_MAX",
    "IP_RATE_MAX",
  ])
    if (env[key] !== undefined) process.env[key] = env[key];
  return {
    plugins: [
      react(),
      {
        name: "local-api",
        configureServer(server) {
          server.middlewares.use("/api/analyze", async (req, res) => {
            try {
              const { handler } = await server.ssrLoadModule("/server/http.ts");
              await handler(req, res);
            } catch {
              res.statusCode = 500;
              res.end('{"error":"接続を確認してください。"}');
            }
          });
        },
      },
    ],
  };
});
