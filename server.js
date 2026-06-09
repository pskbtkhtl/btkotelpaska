const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function escapeAttr(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function readSupabaseConfig() {
  const source = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
  const pick = (key) => source.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] || "";
  return {
    url: pick("url").replace(/\/$/, ""),
    anonKey: pick("anonKey"),
    documentId: pick("documentId") || "paska-main",
  };
}

async function readSiteContent() {
  try {
    const config = readSupabaseConfig();
    if (!config.url || !config.anonKey) throw new Error("Supabase config missing");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${config.url}/rest/v1/site_documents?id=eq.${encodeURIComponent(config.documentId)}&select=content`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error("Supabase content unavailable");
    const rows = await response.json();
    if (rows?.[0]?.content) return rows[0].content;
  } catch {
    // Fall back to the bundled JSON so local previews still work offline.
  }

  try {
    return JSON.parse(await fsp.readFile(path.join(ROOT, "data/site-content.json"), "utf8"));
  } catch {
    return {};
  }
}

function absoluteUrl(value, req) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const origin = `http://${req.headers.host || `localhost:${PORT}`}`;
  return new URL(value, `${origin}/`).toString();
}

function upsertMeta(html, selector, tag) {
  const nameMatch = selector.match(/^name="([^"]+)"$/);
  const propertyMatch = selector.match(/^property="([^"]+)"$/);
  const attr = nameMatch ? `name="${nameMatch[1]}"` : `property="${propertyMatch?.[1] || ""}"`;
  const pattern = new RegExp(`<meta\\s+${attr}[^>]*>`, "i");
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

async function sendIndex(req, res, filePath) {
  try {
    const [html, content] = await Promise.all([fsp.readFile(filePath, "utf8"), readSiteContent()]);
    const meta = content.meta || {};
    const title = meta.title || "Paska Otel | Foça'da Sakin ve Özel Bir Kaçış";
    const description = meta.description || "Paska Otel Foça, İzmir'de deniz manzarası, huzur ve sade lüksü buluşturan butik bir konaklama deneyimi.";
    const image = absoluteUrl(meta.ogImage || "assets/images/hero-aegean-escape.webp", req);
    const pageUrl = absoluteUrl("/", req);

    let output = html.replace(/<title>.*?<\/title>/i, `<title>${escapeAttr(title)}</title>`);
    output = upsertMeta(output, 'name="description"', `<meta name="description" content="${escapeAttr(description)}" />`);
    output = upsertMeta(output, 'property="og:title"', `<meta property="og:title" content="${escapeAttr(title)}" />`);
    output = upsertMeta(output, 'property="og:description"', `<meta property="og:description" content="${escapeAttr(description)}" />`);
    output = upsertMeta(output, 'property="og:image"', `<meta property="og:image" content="${escapeAttr(image)}" />`);
    output = upsertMeta(output, 'property="og:url"', `<meta property="og:url" content="${escapeAttr(pageUrl)}" />`);
    output = upsertMeta(output, 'name="twitter:card"', `<meta name="twitter:card" content="summary_large_image" />`);
    output = upsertMeta(output, 'name="twitter:image"', `<meta name="twitter:image" content="${escapeAttr(image)}" />`);
    send(res, 200, output, MIME[".html"]);
  } catch (error) {
    console.error(error);
    send(res, 500, "Server error");
  }
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function api(req, res, url) {
  if (url.pathname !== "/api/local-content") return false;
  if (req.method !== "PUT") {
    send(res, 405, JSON.stringify({ error: "Method not allowed" }), MIME[".json"]);
    return true;
  }
  try {
    const content = JSON.parse(await readBody(req));
    await fsp.mkdir(path.join(ROOT, "data"), { recursive: true });
    await fsp.writeFile(path.join(ROOT, "data/site-content.json"), `${JSON.stringify(content, null, 2)}\n`, "utf8");
    send(res, 200, JSON.stringify({ ok: true }), MIME[".json"]);
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error.message }), MIME[".json"]);
  }
  return true;
}

async function staticFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (await api(req, res, url)) return;
  let requested = decodeURIComponent(url.pathname);
  if (requested === "/") requested = "/index.html";
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden");

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    const ext = path.extname(filePath).toLowerCase();
    if (path.basename(filePath) === "index.html") return sendIndex(req, res, filePath);
    const noCache = [".html", ".css", ".js", ".json"].includes(ext);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": noCache ? "no-store" : "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, "Not found");
  }
}

http.createServer(staticFile).listen(PORT, HOST, () => {
  console.log(`Paska Otel site running at http://localhost:${PORT}/`);
});

process.on("uncaughtException", (error) => console.error(error));
process.on("unhandledRejection", (error) => console.error(error));
