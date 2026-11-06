import { createServer } from "node:http";
import handler from "../api/analyze.js";
const server = createServer(handler);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const res = await fetch(`http://127.0.0.1:${server.address().port}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "extract",
      text: "2024年から現在まで、受診していない。",
    }),
  });
  const data = await res.json();
  if (!res.ok || data.data?.events?.[0]?.start?.value !== "2024年")
    throw Error("bundled API failed");
  console.log("Bundled API smoke test: PASS");
} finally {
  server.closeAllConnections();
  server.close();
}
