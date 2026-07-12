import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const staticRoot = process.env.STATIC_ROOT ?? join(__dirname, "public");
const listenHost = process.env.HOST?.trim() || "0.0.0.0";

const rawPort = process.env.PORT?.trim();
let listenPort = rawPort ? Number(rawPort) : 8080;
if (!Number.isFinite(listenPort) || listenPort <= 0) {
  console.warn(`Invalid PORT (${process.env.PORT ?? "unset"}), defaulting to 8080`);
  listenPort = 8080;
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function shopifyFrameAncestors(req) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const shop = (url.searchParams.get("shop") ?? "").trim().toLowerCase();
  const ancestors = [
    "https://admin.shopify.com",
    "https://shopify.com",
    "https://*.myshopify.com",
  ];
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    ancestors.push(`https://${shop}`);
  }
  return `frame-ancestors ${ancestors.join(" ")}`;
}

function htmlHeaders(req) {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": shopifyFrameAncestors(req),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
}

async function serveStatic(pathname, req, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(staticRoot, safePath);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      const data = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const headers =
        ext === ".html"
          ? htmlHeaders(req)
          : { "content-type": MIME_TYPES[ext] ?? "application/octet-stream" };
      res.writeHead(200, headers);
      res.end(data);
      return;
    }
  } catch {
    if (extname(pathname) && extname(pathname) !== ".html") {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
  }

  try {
    const index = await readFile(join(staticRoot, "index.html"));
    res.writeHead(200, htmlHeaders(req));
    res.end(index);
  } catch (err) {
    console.error("Failed to serve index.html:", err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Static bundle missing index.html");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health" || url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  void serveStatic(url.pathname, req, res);
});

server.on("error", (err) => {
  console.error(`Failed to bind ${listenHost}:${listenPort}:`, err);
  process.exit(1);
});

try {
  await stat(join(staticRoot, "index.html"));
} catch (err) {
  console.error(`Missing ${join(staticRoot, "index.html")}:`, err);
  process.exit(1);
}

server.listen(listenPort, listenHost, () => {
  console.log(`retain-admin listening on http://${listenHost}:${listenPort}`);
  console.log(`Static root: ${staticRoot}`);
});
