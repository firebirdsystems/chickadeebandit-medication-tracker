import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "src");
const PORT = 3001;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
};

const DEMO_BOOTSTRAP = `
<script>
  window.__CONTEXT_URL = "";
  window.__DB_URL      = "";
  window.__APP_ID      = "medication-tracker-dev";
  window.__CURRENT_MEMBER = { id: "parent-1", name: "Alex", role: "adult" };
</script>
`;

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.join(SRC, urlPath);

  if (!filePath.startsWith(SRC)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let content;
  try {
    content = fs.readFileSync(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not found: ${urlPath}`);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  if (ext === ".html") {
    content = Buffer.from(
      content.toString().replace("</head>", `${DEMO_BOOTSTRAP}</head>`)
    );
  }

  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
});

server.listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}`);
  console.log("Running as adult demo user (Alex). Edit DEMO_BOOTSTRAP to test as a child.");
});
