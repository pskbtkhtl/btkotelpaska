const fallbackData = {
  meta: {
    title: "Paska Otel | Foça'da Sakin ve Özel Bir Kaçış",
    description: "Paska Otel Foça, İzmir'de deniz manzarası, huzur ve sade lüksü buluşturan butik bir konaklama deneyimi.",
    ogImage: "assets/images/hero-aegean-escape.webp",
  },
  brand: { name: "Paska", location: "Otel Foça", logo: "", logoSize: 42, nameSize: 16, locationSize: 10, navSize: 12, logoLayout: "stacked", align: "left", offsetX: 0, offsetY: 0 },
  theme: {
    white: "#fffdfa",
    sand: "#eee5d7",
    stone: "#cbbba5",
    ink: "#1e2a2f",
    blue: "#0d3f55",
    blueSoft: "#426878",
    gray: "#7a807d",
    bodyBackground: "#fffdfa",
    buttonStyle: "solid",
    radiusPreset: "square",
    animations: true,
  },
  nav: [
    { id: "story", label: { tr: "Deneyim", en: "Experience" } },
    { id: "rooms", label: { tr: "Odalar", en: "Rooms" } },
    { id: "gallery", label: { tr: "Galeri", en: "Gallery" } },
    { id: "contact", label: { tr: "İletişim", en: "Contact" } },
  ],
  sections: [],
  footer: { left: "Paska Otel", right: "Foça, İzmir" },
};

const state = {
  data: structuredClone(fallbackData),
  activeLang: "tr",
  token: "",
  user: null,
  adminOpen: false,
  adminTab: "dashboard",
  media: [],
  rooms: [],
  removedRoomIds: [],
  expandedRoomKeys: new Set(),
  upload: null,
  mediaPicker: null,
  mediaPickerLimit: 10,
};

const supabaseConfig = window.PASKA_SUPABASE_CONFIG || {};
const supabaseUrl = String(supabaseConfig.url || "").replace(/\/$/, "");
const supabaseAnonKey = supabaseConfig.anonKey || "";
const supabaseDocumentId = supabaseConfig.documentId || "paska-main";
const supabaseMediaBucket = supabaseConfig.mediaBucket || "paska-media";
const adminEmails = (supabaseConfig.adminEmails || []).map((email) => String(email).toLowerCase());

const $ = (selector, root = document) => root.querySelector(selector);
const siteRoot = $("[data-site-root]");
const footerRoot = $("[data-footer]");
const navRoot = $("[data-nav]");
const langToggle = $("[data-lang-toggle]");
const adminShell = $("[data-admin-shell]");
const adminLogin = $("[data-admin-login]");
const adminPanel = $("[data-admin-panel]");
const adminContent = $("[data-admin-content]");
const adminTabs = $("[data-admin-tabs]");
const loginMessage = $("[data-login-message]");
const siteLoader = $("[data-site-loader]");
const loaderMark = $("[data-loader-mark]");
let toastTimer = null;
let loaderTimer = null;
let loaderHidden = false;
const loaderStartedAt = Date.now();
const minLoaderTime = 900;
const maxHeroWait = 5000;
const warmedImageUrls = new Set();
const roomAmenityPresets = [
  { tr: "Havuz", en: "Pool" },
  { tr: "Jakuzi", en: "Jacuzzi" },
  { tr: "Şömine", en: "Fireplace" },
  { tr: "Klima", en: "Air conditioning" },
  { tr: "Wifi", en: "Wifi" },
  { tr: "Televizyon", en: "Television" },
  { tr: "Mülk içinde ücretsiz otopark", en: "Free parking on premises" },
  { tr: "İlk yardım çantası", en: "First aid kit" },
  { tr: "Yangın söndürücü", en: "Fire extinguisher" },
  { tr: "Çamaşır makinesi", en: "Washer" },
  { tr: "Deniz manzarası", en: "Sea view" },
  { tr: "Balkon", en: "Balcony" },
  { tr: "Teras", en: "Terrace" },
  { tr: "Mini bar", en: "Mini bar" },
  { tr: "Özel banyo", en: "Private bathroom" },
];

const adminSections = [
  ["dashboard", "Özet"],
  ["site", "Site Ayarları"],
  ["sections", "Bölümler"],
  ["content", "Ana Sayfa"],
  ["rooms", "Odalar"],
  ["gallery", "Galeri"],
  ["media", "Medya"],
  ["theme", "Tema"],
  ["seo", "Paylaşım / İletişim"],
];

function t(value) {
  if (typeof value === "string") return value;
  return value?.[state.activeLang] || value?.tr || value?.en || "";
}

const windows1252Bytes = new Map([
  [8364, 0x80], [8218, 0x82], [402, 0x83], [8222, 0x84], [8230, 0x85], [8224, 0x86], [8225, 0x87],
  [710, 0x88], [8240, 0x89], [352, 0x8a], [8249, 0x8b], [338, 0x8c], [381, 0x8e], [8216, 0x91],
  [8217, 0x92], [8220, 0x93], [8221, 0x94], [8226, 0x95], [8211, 0x96], [8212, 0x97], [732, 0x98],
  [8482, 0x99], [353, 0x9a], [8250, 0x9b], [339, 0x9c], [382, 0x9e], [376, 0x9f],
]);

function decodeMojibakeOnce(text) {
  if (typeof text !== "string" || !/[ÃÄÅÂ]/.test(text)) return text;
  const bytes = [];
  for (const character of text) {
    const code = character.codePointAt(0);
    const byte = code <= 255 ? code : windows1252Bytes.get(code);
    if (byte === undefined) return text;
    bytes.push(byte);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return text;
  }
}

function repairMojibake(value) {
  if (typeof value === "string") {
    let result = value;
    for (let index = 0; index < 3; index += 1) {
      const repaired = decodeMojibakeOnce(result);
      if (repaired === result) break;
      result = repaired;
    }
    return result;
  }
  if (Array.isArray(value)) return value.map(repairMojibake);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairMojibake(item)]));
  return value;
}

function slugify(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function supabaseHeaders(extra = {}, token = state.token) {
  return {
    apikey: supabaseAnonKey,
    ...(token ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${supabaseAnonKey}` }),
    ...extra,
  };
}

async function supabaseRequest(path, options = {}) {
  if (!hasSupabaseConfig()) throw new Error("Supabase config eksik.");
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(options.headers || {}, options.token ?? state.token),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || "Supabase işlemi başarısız.");
  return data;
}

async function supabaseSignIn(email, password) {
  return supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    token: "",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function supabaseSignOut() {
  if (!state.token) return;
  await supabaseRequest("/auth/v1/logout", { method: "POST" }).catch(() => {});
}

function fallbackRoomsFromContent() {
  const section = (state.data.sections || []).find((item) => item.type === "rooms");
  return (section?.items || []).map((room, index) => {
    const title = room.name || { tr: `Oda ${index + 1}`, en: `Room ${index + 1}` };
    return {
      id: `fallback-${index}`,
      slug: slugify(t(title)) || `oda-${index + 1}`,
      title,
      short_description: room.desc || {},
      description: room.desc || {},
      location_label: { tr: "Foça bölgesinde oda", en: "Room in Foca" },
      details: { guests: 2, beds: "1 çift kişilik yatak", bath: "Özel banyo" },
      amenities: ["Klima", "Özel banyo", "Wi-Fi"],
      cover_image_url: room.image,
      images: [{ image_url: room.image, alt: room.alt || title, is_cover: true, sort_order: 10 }],
      sort_order: index * 10,
      status: "published",
    };
  });
}

function normalizeRoom(row, images = []) {
  const cleanRow = repairMojibake(row);
  const roomImages = repairMojibake(images)
    .filter((image) => image.room_id === cleanRow.id)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((image) => ({ ...image, image_url: image.image_url || cleanRow.cover_image_url }));
  if (!roomImages.length && cleanRow.cover_image_url) {
    roomImages.push({ image_url: cleanRow.cover_image_url, alt: cleanRow.title, is_cover: true, sort_order: 0 });
  }
  return { ...cleanRow, images: roomImages };
}

async function loadRoomsCatalog() {
  try {
    if (!hasSupabaseConfig()) throw new Error("Supabase config unavailable");
    const rooms = await supabaseRequest("/rest/v1/rooms?select=*&status=eq.published&order=sort_order.asc,created_at.asc", {
      method: "GET",
      token: "",
    });
    const roomIds = (rooms || []).map((room) => room.id).filter(Boolean);
    let images = [];
    if (roomIds.length) {
      images = await supabaseRequest(`/rest/v1/room_images?select=*&room_id=in.(${roomIds.join(",")})&order=sort_order.asc,created_at.asc`, {
        method: "GET",
        token: "",
      });
    }
    state.rooms = (rooms || []).map((room) => normalizeRoom(room, images || []));
  } catch {
    state.rooms = fallbackRoomsFromContent();
  }
}

function saveSession(session) {
  state.token = session?.access_token || "";
  state.user = session?.user || null;
  try {
    localStorage.setItem("paskaSupabaseSession", JSON.stringify(session || {}));
  } catch {
    // Embedded browsers can restrict localStorage; in-memory auth still works.
  }
}

function restoreSession() {
  try {
    const session = JSON.parse(localStorage.getItem("paskaSupabaseSession") || "{}");
    if (session?.access_token && (!session.expires_at || session.expires_at * 1000 > Date.now())) {
      saveSession(session);
    }
  } catch {
    state.token = "";
    state.user = null;
  }
}

function clearSession() {
  state.token = "";
  state.user = null;
  try {
    localStorage.removeItem("paskaSupabaseSession");
  } catch {
    // Ignore storage failures.
  }
}

function isAllowedAdmin(email = state.user?.email) {
  return adminEmails.includes(String(email || "").toLowerCase());
}

function storagePublicUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${supabaseUrl}/storage/v1/object/public/${supabaseMediaBucket}/${path}`;
}

function storageThumbnailUrl(path, width = 360, height = 260, quality = 35) {
  if (!path || !supabaseUrl) return path;
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${supabaseMediaBucket}/`;
  if (!String(path).startsWith(publicPrefix)) return path;
  const objectPath = String(path).slice(publicPrefix.length);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    resize: "cover",
    quality: String(quality),
  });
  return `${supabaseUrl}/storage/v1/render/image/public/${supabaseMediaBucket}/${objectPath}?${params}`;
}

function adminImage(src, alt = "", width = 360, height = 260) {
  const full = src || "";
  const thumb = storageThumbnailUrl(full, width, height);
  return `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${escapeHtml(full)}';">`;
}

function safeUploadName(fileName) {
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
  const base = fileName
    .replace(ext, "")
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `uploads/${Date.now()}-${base || "image"}${ext || ".webp"}`;
}

function uploadToStorageWithProgress(file, objectPath, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${supabaseMediaBucket}/${objectPath}`);
    xhr.setRequestHeader("apikey", supabaseAnonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${state.token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let body = {};
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(body);
      } else {
        reject(new Error(body?.message || body?.error || "Görsel yükleme başarısız."));
      }
    };
    xhr.onerror = () => reject(new Error("Görsel yükleme sırasında bağlantı hatası oluştu."));
    xhr.send(file);
  });
}

function formatFileSize(bytes = 0) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? Math.round(value) : value.toFixed(1)} ${units[power]}`;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gorsel optimize edilemedi."))), type, quality);
  });
}

async function decodeUploadImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the image element decoder.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gorsel tarayicida acilamadi."));
    };
    image.src = url;
  });
}

async function optimizeImageForUpload(file) {
  const supported = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  const optimizeThreshold = 4 * 1024 * 1024;
  const safeUploadSize = 9 * 1024 * 1024;
  if (!supported || file.size < optimizeThreshold) return { file, optimized: false };

  const image = await decodeUploadImage(file);
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  const maxDimension = 2560;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: file.type !== "image/jpeg" });
  if (!context) throw new Error("Tarayici gorsel optimizasyonunu desteklemiyor.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  image.close?.();

  const outputType = file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg";
  let quality = 0.84;
  let blob = await canvasBlob(canvas, outputType, quality);
  while (blob.size > safeUploadSize && quality > 0.56) {
    quality -= 0.08;
    blob = await canvasBlob(canvas, outputType, quality);
  }
  if (blob.size > safeUploadSize) throw new Error("Gorsel optimize edildikten sonra da 9 MB sinirinin altina indirilemedi.");
  if (blob.size >= file.size && file.size <= safeUploadSize) return { file, optimized: false };

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const extension = outputType === "image/webp" ? ".webp" : ".jpg";
  const optimizedFile = new File([blob], `${baseName}${extension}`, { type: outputType, lastModified: file.lastModified });
  return { file: optimizedFile, optimized: true, originalSize: file.size };
}

function clearUploadState() {
  const uploads = Array.isArray(state.upload) ? state.upload : [state.upload].filter(Boolean);
  uploads.forEach((item) => {
    if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
  });
  state.upload = null;
}

function sectionClass(section, extra = "") {
  const style = section.style || {};
  const textClass = style.textMode === "light" ? "text-light" : style.textMode === "dark" ? "text-dark" : "";
  return `site-section ${extra} spacing-${style.spacing || "normal"} ${textClass}`.trim();
}

function styleVars(section) {
  const style = section.style || {};
  const vars = [];
  if (style.background) vars.push(`--section-bg:${style.background}`);
  return vars.length ? `style="${vars.join(";")}"` : "";
}

function sortedSections() {
  return [...(state.data.sections || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function renderTheme() {
  const theme = state.data.theme || {};
  const root = document.documentElement;
  const map = {
    white: "--white",
    sand: "--sand",
    stone: "--stone",
    ink: "--ink",
    blue: "--blue",
    blueSoft: "--blue-soft",
    gray: "--gray",
  };
  Object.entries(map).forEach(([key, cssVar]) => {
    if (theme[key]) root.style.setProperty(cssVar, theme[key]);
  });
  root.style.setProperty("--radius", theme.radiusPreset === "soft" ? "8px" : theme.radiusPreset === "rounded" ? "18px" : "0");
  document.body.style.background = theme.bodyBackground || theme.white || "#fffdfa";
  document.body.classList.toggle("no-motion", theme.animations === false);
  document.body.classList.remove("button-style-solid", "button-style-outline", "button-style-soft");
  document.body.classList.add(`button-style-${theme.buttonStyle || "solid"}`);
}

function ensureMeta(selector, attributes) {
  let element = $(selector);
  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.appendChild(element);
  }
  return element;
}

function absoluteAssetUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, window.location.origin).toString();
}

function brandMarkup(brand = state.data.brand || {}) {
  const name = brand.name ?? "Paska";
  const location = brand.location ?? "Otel Foça";
  return `
    ${brand.logo ? `<img class="brand__logo" src="${escapeHtml(brand.logo)}" alt="${escapeHtml(name || "Paska Otel logosu")}" decoding="async">` : ""}
    ${name ? `<span class="brand__text">${escapeHtml(name)}</span>` : ""}
    ${location ? `<small>${escapeHtml(location)}</small>` : ""}
  `;
}

function updateSiteLoaderBrand() {
  if (!loaderMark) return;
  const brand = state.data.brand || {};
  const image = loaderMark.querySelector("img");
  if (image) image.alt = `${brand.name || "Paska"} Otel logosu`;
}

function hideSiteLoader() {
  if (!siteLoader || loaderHidden) return;
  loaderHidden = true;
  window.clearTimeout(loaderTimer);
  const wait = Math.max(0, minLoaderTime - (Date.now() - loaderStartedAt));
  window.setTimeout(() => {
    siteLoader.classList.add("is-hidden");
    window.setTimeout(() => {
      siteLoader.hidden = true;
      warmSiteImages();
    }, 760);
  }, wait);
}

function waitForHeroThenHideLoader() {
  if (!siteLoader || loaderHidden) return;
  const heroImage = $(".hero__image");
  if (!heroImage) {
    hideSiteLoader();
    return;
  }
  const done = () => hideSiteLoader();
  if (heroImage.complete) {
    done();
    return;
  }
  heroImage.addEventListener("load", done, { once: true });
  heroImage.addEventListener("error", done, { once: true });
  window.clearTimeout(loaderTimer);
  loaderTimer = window.setTimeout(done, maxHeroWait);
}

function prepareSiteImages() {
  siteRoot.querySelectorAll(".site-image").forEach((image) => {
    const show = () => image.classList.add("is-loaded");
    if (image.complete) {
      show();
      return;
    }
    image.addEventListener("load", show, { once: true });
    image.addEventListener("error", show, { once: true });
  });
}

function warmSiteImages() {
  const urls = [...siteRoot.querySelectorAll(".site-image")]
    .map((image) => image.currentSrc || image.src)
    .filter(Boolean)
    .filter((url) => !warmedImageUrls.has(url));
  let index = 0;
  const loadNext = () => {
    const url = urls[index];
    index += 1;
    if (!url) return;
    warmedImageUrls.add(url);
    const preload = new Image();
    preload.decoding = "async";
    preload.onload = () => window.setTimeout(loadNext, 140);
    preload.onerror = () => window.setTimeout(loadNext, 140);
    preload.src = url;
  };
  const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 900));
  schedule(loadNext, { timeout: 2000 });
}

function openRoomDetail(slug) {
  const detail = $(`[data-room-detail="${CSS.escape(slug)}"]`);
  if (!detail) return;
  detail.hidden = false;
  document.body.classList.add("room-detail-open");
  prepareSiteImages();
}

function closeRoomDetail() {
  document.querySelectorAll("[data-room-detail]").forEach((detail) => {
    detail.hidden = true;
  });
  document.body.classList.remove("room-detail-open");
}

function moveRoomSlider(slug, direction) {
  const detail = $(`[data-room-detail="${CSS.escape(slug)}"]`);
  const track = detail?.querySelector("[data-room-slider-track]");
  if (!track) return;
  const amount = direction * track.clientWidth;
  track.scrollBy({ left: amount, behavior: "smooth" });
}

function updateMeta() {
  const title = state.data.meta?.title || fallbackData.meta.title;
  const description = state.data.meta?.description || fallbackData.meta.description;
  const image = absoluteAssetUrl(state.data.meta?.ogImage || fallbackData.meta.ogImage);
  document.title = title;
  ensureMeta('meta[name="description"]', { name: "description" }).content = description;
  ensureMeta('meta[property="og:title"]', { property: "og:title" }).content = title;
  ensureMeta('meta[property="og:description"]', { property: "og:description" }).content = description;
  ensureMeta('meta[property="og:image"]', { property: "og:image" }).content = image;
  ensureMeta('meta[property="og:url"]', { property: "og:url" }).content = window.location.href;
  ensureMeta('meta[name="twitter:card"]', { name: "twitter:card" }).content = "summary_large_image";
  ensureMeta('meta[name="twitter:image"]', { name: "twitter:image" }).content = image;
}

function renderNav() {
  const brand = state.data.brand || {};
  const brandLink = $(".brand");
  brandLink.className = `brand brand--${brand.logoLayout || "stacked"} brand--${brand.align || "left"}`;
  brandLink.style.setProperty("--brand-logo-size", `${Number(brand.logoSize || 42)}px`);
  brandLink.style.setProperty("--brand-name-size", `${Number(brand.nameSize || 16)}px`);
  brandLink.style.setProperty("--brand-location-size", `${Number(brand.locationSize || 10)}px`);
  brandLink.style.setProperty("--brand-offset-x", `${Number(brand.offsetX || 0)}px`);
  brandLink.style.setProperty("--brand-offset-y", `${Number(brand.offsetY || 0)}px`);
  brandLink.innerHTML = brandMarkup(brand);
  navRoot.style.setProperty("--nav-font-size", `${Number(brand.navSize || 12)}px`);
  const enabledIds = new Set(sortedSections().filter((section) => section.enabled).map((section) => section.id));
  navRoot.innerHTML = (state.data.nav || [])
    .filter((item) => enabledIds.has(item.id))
    .map((item) => `<a href="${item.id === "rooms" ? "/odalar/" : `#${item.id}`}">${escapeHtml(t(item.label))}</a>`)
    .join("");
  langToggle.textContent = state.activeLang === "tr" ? "EN" : "TR";
}

function heading(section) {
  const content = section.content || {};
  return `
    <div class="section-heading reveal">
      <p class="eyebrow">${escapeHtml(t(content.eyebrow))}</p>
      <h2>${escapeHtml(t(content.title))}</h2>
    </div>
  `;
}

function roomCover(room) {
  return room.cover_image_url || room.images?.find((image) => image.is_cover)?.image_url || room.images?.[0]?.image_url || "";
}

function roomDetailsText(room) {
  const details = room.details || {};
  return [
    details.guests ? `${details.guests} ${state.activeLang === "tr" ? "misafir" : "guests"}` : "",
    details.beds || "",
    details.bath || "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function roomCard(room) {
  const image = roomCover(room);
  return `
    <article class="room-card reveal">
      <button class="room-card__button" type="button" data-open-room="${escapeHtml(room.slug)}" aria-label="${escapeHtml(t(room.title))}">
        <div class="room-card__image"><img class="site-image" src="${escapeHtml(image)}" alt="${escapeHtml(t(room.title))}" loading="lazy" decoding="async"></div>
        <div class="room-card__copy">
          <h3>${escapeHtml(t(room.title))}</h3>
          <p>${escapeHtml(t(room.location_label) || (state.activeLang === "tr" ? "Foça bölgesinde oda" : "Room in Foca"))}</p>
          <small>${escapeHtml(t(room.short_description))}</small>
        </div>
      </button>
    </article>
  `;
}

function roomDetail(room) {
  const images = room.images?.length ? room.images : [{ image_url: roomCover(room), alt: room.title }];
  const amenities = Array.isArray(room.amenities) ? room.amenities : [];
  const contact = (state.data.sections || []).find((section) => section.type === "contact")?.content || {};
  return `
    <div class="room-detail" data-room-detail="${escapeHtml(room.slug)}" hidden>
      <div class="room-detail__backdrop" data-close-room></div>
      <article class="room-detail__panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(t(room.title))}">
        <button class="room-detail__close" type="button" data-close-room aria-label="${state.activeLang === "tr" ? "Oda detayını kapat" : "Close room detail"}">×</button>
        <div class="room-detail__slider">
          <button class="room-detail__arrow room-detail__arrow--prev" type="button" data-room-slide="${escapeHtml(room.slug)}" data-dir="-1" aria-label="${state.activeLang === "tr" ? "Önceki görsel" : "Previous image"}">‹</button>
          <div class="room-detail__track" data-room-slider-track>
          ${images
            .map(
              (image, index) => `
                <figure class="room-detail__slide">
                  <img class="site-image" src="${escapeHtml(image.image_url)}" alt="${escapeHtml(t(image.alt) || t(room.title))}" loading="lazy" decoding="async">
                  <figcaption>${index + 1} / ${images.length}</figcaption>
                </figure>
              `
            )
            .join("")}
          </div>
          <button class="room-detail__arrow room-detail__arrow--next" type="button" data-room-slide="${escapeHtml(room.slug)}" data-dir="1" aria-label="${state.activeLang === "tr" ? "Sonraki görsel" : "Next image"}">›</button>
        </div>
        <div class="room-detail__content">
          <div>
            <p class="eyebrow">${escapeHtml(t(room.location_label) || "Paska Otel Foça")}</p>
            <h2>${escapeHtml(t(room.title))}</h2>
            <p class="room-detail__summary">${escapeHtml(t(room.description) || t(room.short_description))}</p>
          </div>
          <div class="room-detail__facts">
            ${roomDetailsText(room) ? `<span>${escapeHtml(roomDetailsText(room))}</span>` : ""}
          </div>
          ${
            amenities.length
              ? `<div class="room-detail__amenities">${amenities.map((item) => `<span>${escapeHtml(t(item) || item)}</span>`).join("")}</div>`
              : ""
          }
          <div class="room-detail__actions">
            <a class="button button--dark" href="${escapeHtml(contact.whatsapp || "#contact")}" target="_blank" rel="noreferrer">WhatsApp</a>
            <a class="button button--muted" href="#contact" data-close-room>${state.activeLang === "tr" ? "İletişim" : "Contact"}</a>
          </div>
        </div>
      </article>
    </div>
  `;
}

function renderHero(section) {
  const content = section.content || {};
  return `
    <section class="hero" id="hero" aria-label="Paska Otel">
      <img class="hero__image site-image" src="${escapeHtml(content.image)}" alt="${escapeHtml(t(content.alt))}" />
      <div class="hero__shade"></div>
      <div class="hero__content reveal">
        <p class="eyebrow">${escapeHtml(t(content.eyebrow))}</p>
        <h1>${escapeHtml(t(content.title))}</h1>
        <p>${escapeHtml(t(content.subtitle))}</p>
        <div class="hero__actions">
          <a class="button button--light" href="/odalar/">${escapeHtml(t(content.primaryButton))}</a>
          <a class="button button--ghost" href="#contact">${escapeHtml(t(content.secondaryButton))}</a>
        </div>
      </div>
    </section>
  `;
}

function renderIntro(section) {
  return `
    <section class="${sectionClass(section, "intro")}" id="intro" ${styleVars(section)} aria-label="Otel özeti">
      <p class="reveal">${escapeHtml(t(section.content?.text))}</p>
    </section>
  `;
}

function renderStory(section) {
  const baseLayout = section.style?.layout || "default";
  return `
    <section class="${sectionClass(section, "visual-story")}" id="story" ${styleVars(section)} aria-label="Paska Otel deneyimi">
      ${(section.items || [])
        .map((item) => {
          const layout = item.layout || baseLayout;
          const layoutClass = layout === "image-right" ? "image-right" : layout === "centered" ? "centered" : "";
          const imageStyle = [
            `--story-image-height:${Number(item.imageHeight || 620)}px`,
            `--story-image-fit:${item.imageFit || "cover"}`,
            `--story-image-position:${item.imagePosition || "center center"}`,
            item.imageRatio ? `--story-image-ratio:${item.imageRatio}` : "",
          ]
            .filter(Boolean)
            .join(";");
          return `
            <article class="story-block ${layoutClass} reveal">
              <div class="story-block__image" style="${escapeHtml(imageStyle)}">
                <img class="site-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(t(item.alt))}" loading="lazy" decoding="async">
              </div>
              <div class="story-block__copy">
                <p class="eyebrow">${escapeHtml(t(item.eyebrow))}</p>
                <h2>${escapeHtml(t(item.title))}</h2>
                <p>${escapeHtml(t(item.text))}</p>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderRooms(section) {
  const layout = section.style?.layout === "centered" ? "centered" : "";
  const rooms = state.rooms.length ? state.rooms : fallbackRoomsFromContent();
  return `
    <section class="${sectionClass(section, "rooms")}" id="rooms" ${styleVars(section)}>
      ${heading(section)}
      <div class="room-grid ${layout}">
        ${rooms.map(roomCard).join("")}
      </div>
      ${rooms.map(roomDetail).join("")}
    </section>
  `;
}

function renderGallery(section) {
  return `
    <section class="${sectionClass(section, "gallery")}" id="gallery" ${styleVars(section)}>
      ${heading(section)}
      <div class="masonry">
        ${(section.items || [])
          .map(
            (item) => `
              <figure class="masonry__item reveal" style="--ratio: ${escapeHtml(item.ratio || "4 / 5")}">
                <img class="site-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(t(item.label))}" loading="lazy" decoding="async">
                <span>${escapeHtml(t(item.label))}</span>
              </figure>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFoca(section) {
  const layout = section.style?.layout === "image-right" ? "image-right" : section.style?.layout === "centered" ? "centered" : "";
  const content = section.content || {};
  return `
    <section class="${sectionClass(section, `foca ${layout}`)}" id="foca" ${styleVars(section)}>
      <div class="foca__image reveal"><img class="site-image" src="${escapeHtml(content.image)}" alt="${escapeHtml(t(content.alt))}" loading="lazy" decoding="async" /></div>
      <div class="foca__copy reveal">
        <p class="eyebrow">${escapeHtml(t(content.eyebrow))}</p>
        <h2>${escapeHtml(t(content.title))}</h2>
        <p>${escapeHtml(t(content.text))}</p>
      </div>
    </section>
  `;
}

function renderContact(section) {
  const content = section.content || {};
  const layout = section.style?.layout === "centered" ? "centered" : "";
  return `
    <section class="${sectionClass(section, "contact")}" id="contact" ${styleVars(section)}>
      ${heading(section)}
      <div class="contact__layout ${layout}">
        <div class="contact__details reveal">
          <a class="contact-link contact-link--primary" href="${escapeHtml(content.whatsapp)}" target="_blank" rel="noreferrer">WhatsApp</a>
          <a class="contact-link" href="${escapeHtml(content.instagram)}" target="_blank" rel="noreferrer">Instagram</a>
          <a class="contact-link" href="${escapeHtml(content.phoneHref)}">${escapeHtml(content.phone)}</a>
          <p>${escapeHtml(t(content.address))}</p>
          <iframe class="map" title="Paska Otel Foça harita" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(content.map)}"></iframe>
        </div>
        <form class="contact-form reveal" action="#" method="post">
          <label><span>${state.activeLang === "tr" ? "Adınız" : "Name"}</span><input name="name" type="text" autocomplete="name" required /></label>
          <label><span>${state.activeLang === "tr" ? "E-posta" : "Email"}</span><input name="email" type="email" autocomplete="email" required /></label>
          <label><span>${state.activeLang === "tr" ? "Mesajınız" : "Message"}</span><textarea name="message" rows="5" required></textarea></label>
          <button class="button button--dark" type="submit">${state.activeLang === "tr" ? "Gönder" : "Send"}</button>
        </form>
      </div>
    </section>
  `;
}

function renderSection(section) {
  if (!section.enabled) return "";
  const renderers = { hero: renderHero, intro: renderIntro, story: renderStory, rooms: renderRooms, gallery: renderGallery, foca: renderFoca, contact: renderContact };
  return renderers[section.type]?.(section) || "";
}

function revealOnScroll() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );
  document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));
}

function renderSite() {
  renderTheme();
  updateMeta();
  renderNav();
  updateSiteLoaderBrand();
  siteRoot.innerHTML = sortedSections().map(renderSection).join("");
  footerRoot.innerHTML = `<p>${escapeHtml(state.data.footer?.left || "")}</p><p>${escapeHtml(state.data.footer?.right || "")}</p>`;
  prepareSiteImages();
  revealOnScroll();
}

async function loadSiteContent() {
  try {
    if (!hasSupabaseConfig()) throw new Error("Supabase config unavailable");
    const rows = await supabaseRequest(`/rest/v1/site_documents?id=eq.${encodeURIComponent(supabaseDocumentId)}&select=content`, {
      method: "GET",
      token: "",
    });
    if (!rows?.[0]?.content || Object.keys(rows[0].content).length === 0) throw new Error("Supabase content not seeded");
    state.data = rows[0].content;
  } catch {
    const response = await fetch("data/site-content.json", { cache: "no-store" });
    state.data = response.ok ? await response.json() : structuredClone(fallbackData);
  }
  await loadRoomsCatalog();
  renderSite();
  waitForHeroThenHideLoader();
}

function showAdminMessage(message, type = "success") {
  if (!message) return;
  let toast = $("[data-admin-toast]");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "admin-toast";
    toast.setAttribute("data-admin-toast", "");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.className = `admin-toast is-visible is-${type}`;
  toast.innerHTML = `
    <div>
      <strong>${type === "error" ? "İşlem tamamlanamadı" : "İşlem tamamlandı"}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
    <button type="button" data-close-toast aria-label="Bildirimi kapat">×</button>
  `;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 5000);
}

function openAdmin() {
  adminShell.hidden = false;
  adminShell.style.display = "";
  state.adminOpen = true;
  const emailInput = $("[data-login-form] input[name='email']");
  if (emailInput && adminEmails[0]) emailInput.value = adminEmails[0];
  if (state.token) {
    adminLogin.hidden = true;
    adminLogin.style.display = "none";
    adminPanel.hidden = false;
    adminPanel.style.display = "grid";
    renderAdmin();
    loadMedia();
  } else {
    adminLogin.hidden = false;
    adminLogin.style.display = "";
    adminPanel.hidden = true;
    adminPanel.style.display = "none";
  }
}

function closeAdmin() {
  adminShell.hidden = true;
  adminShell.style.display = "none";
  state.adminOpen = false;
}

function setValue(path, value, options = {}) {
  const keys = path.split(".");
  let cursor = state.data;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] ??= {};
    cursor = cursor[key];
  });
  cursor[keys.at(-1)] = value;
  if (options.render) renderSite();
}

function getValue(path) {
  return path.split(".").reduce((cursor, key) => cursor?.[key], state.data);
}

function getRoomValue(path) {
  return path?.split(".").reduce((cursor, key) => cursor?.[key], state.rooms);
}

function setRoomValue(path, value) {
  if (path.endsWith(".amenitiesText")) {
    const roomIndex = Number(path.split(".")[0]);
    if (state.rooms[roomIndex]) {
      state.rooms[roomIndex].amenities = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return;
  }
  const keys = path.split(".");
  let cursor = state.rooms;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] ??= Number.isInteger(Number(keys[keys.indexOf(key) + 1])) ? [] : {};
    cursor = cursor[key];
  });
  cursor[keys.at(-1)] = value;
  if (path.endsWith(".cover_image_url")) {
    const roomIndex = Number(path.split(".")[0]);
    const room = state.rooms[roomIndex];
    if (room && value && !room.images?.some((image) => image.image_url === value)) {
      room.images ??= [];
      room.images.unshift({ image_url: value, alt: room.title || { tr: "Oda", en: "Room" }, sort_order: 10, is_cover: true });
      room.images.forEach((image, index) => {
        image.sort_order = (index + 1) * 10;
        image.is_cover = index === 0;
      });
    }
  }
}

function roomInput(label, path, value, type = "text") {
  return `<label><span>${label}</span><input type="${type}" data-room-path="${path}" value="${escapeHtml(value ?? "")}"></label>`;
}

function roomTextarea(label, path, value) {
  return `<label><span>${label}</span><textarea rows="3" data-room-path="${path}">${escapeHtml(value ?? "")}</textarea></label>`;
}

function roomLocalizedInputs(label, basePath, value = {}, area = false) {
  const field = area ? roomTextarea : roomInput;
  return `
    ${field(`${label} TR`, `${basePath}.tr`, value.tr)}
    ${field(`${label} EN`, `${basePath}.en`, value.en)}
  `;
}

function roomMediaSelect(label, path, value, help = "") {
  const image = value || "";
  return `
    <div class="admin-media-field">
      <div class="media-choice">
        <span class="admin-field-label">${escapeHtml(label)}</span>
        <button class="media-choice__button" type="button" data-open-media-picker data-room-media-path="${escapeHtml(path)}">
          ${image ? adminImage(image, "", 280, 210) : `<span class="media-choice__empty">GÃ¶rsel seÃ§ilmedi</span>`}
          <span class="media-choice__cta">GÃ¶rsel seÃ§</span>
        </button>
        ${help ? `<small>${escapeHtml(help)}</small>` : ""}
        ${image ? `<code>${escapeHtml(image)}</code>` : ""}
      </div>
    </div>
  `;
}

function amenityKey(item) {
  return typeof item === "string" ? item : item?.tr || item?.en || "";
}

function amenityText(item) {
  return t(item) || amenityKey(item);
}

function roomAmenitiesEditor(room, index) {
  const amenities = Array.isArray(room.amenities) ? room.amenities : [];
  const selected = new Set(amenities.map(amenityKey));
  return `
    <div class="room-admin-block room-admin-block--wide">
      <div class="room-admin-block__title">
        <div>
          <h4>Olanaklar</h4>
          <p>Odaya ait özellikleri hazır seçeneklerden ekleyebilir veya özel bir olanak yazabilirsin.</p>
        </div>
      </div>
      <div class="amenity-preset-grid">
        ${roomAmenityPresets
          .map((amenity) => {
            const key = amenityKey(amenity);
            const active = selected.has(key);
            return `<button class="amenity-chip ${active ? "is-active" : ""}" type="button" data-toggle-room-amenity="${index}" data-amenity-tr="${escapeHtml(amenity.tr)}" data-amenity-en="${escapeHtml(amenity.en)}">${escapeHtml(t(amenity))}</button>`;
          })
          .join("")}
      </div>
      <div class="room-admin-custom-amenity">
        <input type="text" data-room-custom-amenity="${index}" placeholder="Örn. Şömineli oda, jakuzili oda">
        <button class="button button--muted" type="button" data-add-custom-amenity="${index}">Özellik ekle</button>
      </div>
      <div class="room-admin-selected">
        ${
          amenities.length
            ? amenities.map((amenity, amenityIndex) => `<span>${escapeHtml(amenityText(amenity))}<button type="button" data-remove-room-amenity="${index}" data-amenity-index="${amenityIndex}" aria-label="Özelliği kaldır">×</button></span>`).join("")
            : `<small>Henüz özellik eklenmedi.</small>`
        }
      </div>
    </div>
  `;
}

function roomGalleryEditor(room, index) {
  const images = room.images?.length ? room.images : [];
  return `
    <div class="room-admin-block room-admin-block--wide">
      <div class="room-admin-block__title">
        <div>
          <h4>Oda galerisi</h4>
          <p>Müşteri oda detayına bastığında bu görseller galeri olarak görünür.</p>
        </div>
        <button class="button button--dark" type="button" data-add-room-image="${index}">Galeri görseli ekle</button>
      </div>
      <div class="room-gallery-admin">
        ${
          images.length
            ? images
                .map(
                  (image, imageIndex) => `
                    <div class="room-gallery-admin__item">
                      <button class="room-gallery-admin__pick" type="button" data-open-media-picker data-room-media-path="${index}.images.${imageIndex}.image_url">
                        ${image.image_url ? adminImage(image.image_url, "", 360, 260) : `<span class="media-choice__empty">Görsel seç</span>`}
                      </button>
                      <div class="room-gallery-admin__meta">
                        <span>${imageIndex + 1}. görsel</span>
                        ${room.cover_image_url === image.image_url ? `<strong>Kapak</strong>` : `<button type="button" data-set-room-cover="${index}" data-image-index="${imageIndex}">Kapak yap</button>`}
                      </div>
                      <div class="room-gallery-admin__actions">
                        <button type="button" data-move-room-image="${index}" data-image-index="${imageIndex}" data-dir="-1">Yukarı</button>
                        <button type="button" data-move-room-image="${index}" data-image-index="${imageIndex}" data-dir="1">Aşağı</button>
                        <button type="button" data-remove-room-image="${index}" data-image-index="${imageIndex}">Sil</button>
                      </div>
                    </div>
                  `
                )
                .join("")
            : `<div class="room-gallery-admin__empty">Henüz galeri görseli eklenmedi.</div>`
        }
      </div>
    </div>
  `;
}

function input(label, path, value, type = "text") {
  return `<label><span>${label}</span><input type="${type}" data-path="${path}" value="${escapeHtml(value ?? "")}"></label>`;
}

function textarea(label, path, value) {
  return `<label><span>${label}</span><textarea rows="3" data-path="${path}">${escapeHtml(value ?? "")}</textarea></label>`;
}

function select(label, path, value, options) {
  return `
    <label><span>${label}</span>
      <select data-path="${path}">
        ${options.map((item) => `<option value="${item}" ${item === value ? "selected" : ""}>${item}</option>`).join("")}
      </select>
    </label>
  `;
}

function color(label, path, value) {
  const current = value || "#ffffff";
  const presets = ["#fffdfa", "#f7f3ed", "#eee5d7", "#cbbba5", "#0d3f55", "#1e2a2f", "#426878"];
  return `
    <div class="admin-color-field">
      <label>
        <span>${label}</span>
        <span class="admin-color-input">
          <span class="admin-color-swatch" style="background:${escapeHtml(current)}"></span>
          <input type="text" data-path="${path}" value="${escapeHtml(current)}" inputmode="text" placeholder="#ffffff">
        </span>
      </label>
      <div class="admin-color-presets">
        ${presets.map((preset) => `<button type="button" data-color-preset="${preset}" data-path="${path}" style="background:${preset}" aria-label="${preset}"></button>`).join("")}
      </div>
    </div>
  `;
}

function mediaSelect(label, path, value, help = "") {
  const image = value || "";
  return `
    <div class="admin-media-field">
      <div class="media-choice">
        <span class="admin-field-label">${escapeHtml(label)}</span>
        <button class="media-choice__button" type="button" data-open-media-picker data-path="${escapeHtml(path)}">
          ${image ? adminImage(image, "", 280, 210) : `<span class="media-choice__empty">Görsel seçilmedi</span>`}
          <span class="media-choice__cta">Görsel seç</span>
        </button>
        ${help ? `<small>${escapeHtml(help)}</small>` : ""}
        ${image ? `<code>${escapeHtml(image)}</code>` : ""}
      </div>
    </div>
  `;
}

function rangeInput(label, path, value, min, max, step = 1, suffix = "px") {
  const current = Number(value ?? 0);
  return `
    <label class="admin-range">
      <span>${escapeHtml(label)}</span>
      <input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${current}">
      <output>${current}${suffix}</output>
    </label>
  `;
}

function brandPreview() {
  const brand = state.data.brand || {};
  const style = [
    `--brand-logo-size:${Number(brand.logoSize || 42)}px`,
    `--brand-name-size:${Number(brand.nameSize || 16)}px`,
    `--brand-location-size:${Number(brand.locationSize || 10)}px`,
    `--brand-offset-x:${Number(brand.offsetX || 0)}px`,
    `--brand-offset-y:${Number(brand.offsetY || 0)}px`,
  ].join(";");
  const navStyle = `--nav-font-size:${Number(brand.navSize || 12)}px`;
  return `
    <div class="brand-preview">
      <div class="brand-preview__bar" style="${navStyle}">
        <div class="brand brand--${escapeHtml(brand.logoLayout || "stacked")} brand--${escapeHtml(brand.align || "left")} brand-preview__mark" style="${style}" data-brand-drag>
          ${brandMarkup(brand)}
        </div>
        <nav class="brand-preview__nav">
          ${(state.data.nav || []).map((item) => `<span>${escapeHtml(t(item.label))}</span>`).join("")}
        </nav>
        <span class="brand-preview__lang">EN</span>
      </div>
      <p>Önizleme içindeki marka alanını sürükleyebilir veya aşağıdaki konum ayarlarını kullanabilirsin.</p>
    </div>
  `;
}

function renderMediaPicker() {
  if (!state.mediaPicker) return "";
  const current = state.mediaPicker.roomPath ? getRoomValue(state.mediaPicker.roomPath) : getValue(state.mediaPicker.path);
  const limit = state.mediaPickerLimit || 10;
  const visibleMedia = state.media.slice(0, limit);
  const selectedMedia = current && !visibleMedia.some((file) => file.path === current) ? state.media.find((file) => file.path === current) : null;
  const mediaToRender = selectedMedia ? [selectedMedia, ...visibleMedia] : visibleMedia;
  const hasMore = limit < state.media.length;
  return `
    <div class="media-picker" role="dialog" aria-modal="true" aria-label="Görsel seçimi">
      <div class="media-picker__panel">
        <div class="media-picker__header">
          <div>
            <p class="eyebrow">Medya Kütüphanesi</p>
            <h3>${escapeHtml(state.mediaPicker.label || "Görsel seç")}</h3>
            <p>Yüklediğin Supabase görsellerinden birini seç veya buradan yeni görsel yükle. Seçim yaptığında otomatik kaydedilir.</p>
          </div>
          <div class="media-picker__actions">
            <label class="button button--dark file-button">
              Görsel yükle
              <input type="file" accept="image/*" data-upload-media multiple>
            </label>
            <button class="admin-close" type="button" data-close-media-picker aria-label="Görsel seçimini kapat">×</button>
          </div>
        </div>
        ${renderUploadPanel()}
        <div class="media-picker__grid">
          ${
            state.media.length
              ? mediaToRender
                  .map((file) => mediaPickerItem(file, current))
                  .join("")
              : `<div class="media-picker__empty">Henüz seçilebilir görsel yok. Önce Medya sekmesinden görsel yükle.</div>`
          }
        </div>
        ${hasMore ? `<div class="media-picker__more" data-media-load-more>Kaydırdıkça daha fazla görsel yüklenecek · ${mediaToRender.length}/${state.media.length}</div>` : ""}
      </div>
    </div>
  `;
}

function mediaPickerItem(file, current) {
  return `
    <button class="media-picker__item ${file.path === current ? "is-selected" : ""}" type="button" data-pick-media="${state.media.indexOf(file)}">
      ${adminImage(file.path, file.name, 320, 240)}
      <span>${escapeHtml(file.name)}</span>
    </button>
  `;
}

function seoPreview() {
  const meta = state.data.meta || {};
  const image = absoluteAssetUrl(meta.ogImage || fallbackData.meta.ogImage);
  return `
    <div class="seo-preview">
      ${adminImage(image, "", 220, 115)}
      <div>
        <span>Paylaşım önizlemesi</span>
        <strong>${escapeHtml(meta.title || fallbackData.meta.title)}</strong>
        <p>${escapeHtml(meta.description || fallbackData.meta.description)}</p>
      </div>
    </div>
  `;
}

function sectionByType(type) {
  const section = state.data.sections.find((item) => item.type === type);
  return { section, index: state.data.sections.indexOf(section) };
}

function localizedInputs(label, basePath, value = {}, area = false) {
  const field = area ? textarea : input;
  return `
    ${field(`${label} TR`, `${basePath}.tr`, value.tr)}
    ${field(`${label} EN`, `${basePath}.en`, value.en)}
  `;
}

function sectionStyleControls(section, path) {
  return `
    <div class="admin-grid three">
      ${color("Arka plan", `${path}.style.background`, section.style?.background)}
      ${select("Yazı modu", `${path}.style.textMode`, section.style?.textMode || "dark", ["auto", "dark", "light"])}
      ${select("Boşluk", `${path}.style.spacing`, section.style?.spacing || "normal", ["compact", "normal", "spacious"])}
      ${select("Layout", `${path}.style.layout`, section.style?.layout || "default", ["default", "image-left", "image-right", "centered"])}
      ${input("Sıra", `${path}.order`, section.order || 0, "number")}
      <label><span>Durum</span><select data-path="${path}.enabled"><option value="true" ${section.enabled ? "selected" : ""}>Açık</option><option value="false" ${!section.enabled ? "selected" : ""}>Kapalı</option></select></label>
    </div>
  `;
}

function renderAdminTabs() {
  adminTabs.innerHTML = adminSections.map(([id, label]) => `<button class="admin-tab ${id === state.adminTab ? "is-active" : ""}" type="button" data-tab="${id}">${label}</button>`).join("");
  $("[data-admin-section-label]").textContent = adminSections.find(([id]) => id === state.adminTab)?.[1] || "Panel";
}

function renderDashboard() {
  const enabled = sortedSections().filter((section) => section.enabled).length;
  const configured = hasSupabaseConfig();
  const admin = isAllowedAdmin() ? "Yetkili admin" : state.user?.email ? "Yetkisiz kullanıcı" : "Giriş bekliyor";
  return `
    <div class="admin-hero-card">
      <div>
        <p class="eyebrow">Supabase CMS</p>
        <h3>Paska Otel içerik merkezi</h3>
        <p>Metinleri, fotoğrafları, bölüm sıralarını, renkleri ve iletişim bilgilerini buradan yönetebilirsin.</p>
      </div>
      <div class="admin-status-pill">${escapeHtml(admin)}</div>
    </div>
    <div class="admin-grid three">
      <div class="admin-stat"><strong>${enabled}</strong><span>Açık bölüm</span></div>
      <div class="admin-stat"><strong>${state.data.sections.length}</strong><span>Toplam bölüm</span></div>
      <div class="admin-stat"><strong>${configured ? "Bağlı" : "Eksik"}</strong><span>Supabase</span></div>
    </div>
    <div class="admin-card">
      <h3>Yayın durumu</h3>
      <div class="admin-grid">
        <p><strong>Doküman:</strong><br>${escapeHtml(supabaseDocumentId)}</p>
        <p><strong>Bucket:</strong><br>${escapeHtml(supabaseMediaBucket)}</p>
        <p><strong>Son kayıt:</strong><br>${state.data.updatedAt ? new Date(state.data.updatedAt).toLocaleString("tr-TR") : "Henüz yok"}</p>
        <p><strong>Admin:</strong><br>${escapeHtml(state.user?.email || "Oturum yok")}</p>
      </div>
      <form class="admin-grid" data-password-form>
        <label><span>Yeni şifre</span><input name="newPassword" type="password" minlength="8" required></label>
        <p>Şifre Supabase Auth üzerinde güncellenir.</p>
        <button class="button button--dark" type="submit">Şifreyi değiştir</button>
      </form>
    </div>
  `;
}

function renderSiteAdmin() {
  return `
    <div class="admin-card">
      <h3>Marka ve SEO</h3>
      <div class="admin-grid">
        ${input("Marka adı", "brand.name", state.data.brand?.name)}
        ${input("Konum etiketi", "brand.location", state.data.brand?.location)}
        ${mediaSelect("Otel logosu", "brand.logo", state.data.brand?.logo, "Navbar sol üstte marka adı alanında görünür. Şeffaf PNG veya yatay logo daha iyi durur.")}
        ${rangeInput("Logo boyutu", "brand.logoSize", state.data.brand?.logoSize ?? 42, 18, 120)}
        ${rangeInput("Marka adı yazı boyutu", "brand.nameSize", state.data.brand?.nameSize ?? 16, 0, 34)}
        ${rangeInput("Konum etiketi yazı boyutu", "brand.locationSize", state.data.brand?.locationSize ?? 10, 0, 24)}
        ${rangeInput("Menü yazı boyutu", "brand.navSize", state.data.brand?.navSize ?? 12, 8, 22)}
        ${select("Logo / yazı düzeni", "brand.logoLayout", state.data.brand?.logoLayout || "stacked", ["stacked", "horizontal", "logo-only"])}
        ${select("Hizalama", "brand.align", state.data.brand?.align || "left", ["left", "center"])}
        ${rangeInput("Yatay konum", "brand.offsetX", state.data.brand?.offsetX ?? 0, -80, 180)}
        ${rangeInput("Dikey konum", "brand.offsetY", state.data.brand?.offsetY ?? 0, -40, 80)}
        ${brandPreview()}
        ${input("Sayfa title", "meta.title", state.data.meta?.title)}
        ${textarea("Meta description", "meta.description", state.data.meta?.description)}
        ${mediaSelect("Link paylaşım görseli", "meta.ogImage", state.data.meta?.ogImage, "WhatsApp, Instagram DM ve sosyal paylaşım kartlarında görünür. Sayfadaki arka plan görselini değiştirmez.")}
        <p class="admin-help">Ana sayfanın en üstündeki büyük arka plan görselini değiştirmek için Ana Sayfa sekmesindeki “Ana sayfa arka plan görseli” alanını kullan.</p>
        ${seoPreview()}
        ${input("Footer sol", "footer.left", state.data.footer?.left)}
        ${input("Footer sağ", "footer.right", state.data.footer?.right)}
      </div>
    </div>
    <div class="admin-card">
      <h3>Navigasyon</h3>
      <div class="admin-grid">
        ${(state.data.nav || [])
          .map((item, index) => `
            <div class="admin-mini-card">
              <h4>${escapeHtml(item.id)}</h4>
              ${input("Label TR", `nav.${index}.label.tr`, item.label?.tr)}
              ${input("Label EN", `nav.${index}.label.en`, item.label?.en)}
            </div>
          `)
          .join("")}
      </div>
    </div>
  `;
}

function renderSectionsAdmin() {
  return sortedSections()
    .map((section) => {
      const index = state.data.sections.indexOf(section);
      return `
        <div class="admin-row">
          <div class="admin-row__header">
            <h3>${section.id} / ${section.type}</h3>
            <div class="admin-actions">
              <button class="button button--muted" type="button" data-move-section="${index}" data-dir="-1">Yukarı</button>
              <button class="button button--muted" type="button" data-move-section="${index}" data-dir="1">Aşağı</button>
            </div>
          </div>
          ${sectionStyleControls(section, `sections.${index}`)}
        </div>
      `;
    })
    .join("");
}

function renderContentAdmin() {
  const hero = sectionByType("hero");
  const intro = sectionByType("intro");
  const story = sectionByType("story");
  const foca = sectionByType("foca");
  return `
    <div class="admin-card">
      <h3>Hero</h3>
      <div class="admin-grid">
        ${localizedInputs("Eyebrow", `sections.${hero.index}.content.eyebrow`, hero.section.content.eyebrow)}
        ${localizedInputs("Başlık", `sections.${hero.index}.content.title`, hero.section.content.title, true)}
        ${localizedInputs("Alt başlık", `sections.${hero.index}.content.subtitle`, hero.section.content.subtitle, true)}
        ${localizedInputs("Ana buton", `sections.${hero.index}.content.primaryButton`, hero.section.content.primaryButton)}
        ${localizedInputs("İkinci buton", `sections.${hero.index}.content.secondaryButton`, hero.section.content.secondaryButton)}
        ${mediaSelect("Ana sayfa arka plan görseli", `sections.${hero.index}.content.image`, hero.section.content.image, "Sitenin ilk ekranında, başlığın arkasında görünen büyük görsel.")}
        ${localizedInputs("Alt metin", `sections.${hero.index}.content.alt`, hero.section.content.alt)}
      </div>
    </div>
    <div class="admin-card">
      <h3>Intro</h3>
      <div class="admin-grid">
        ${localizedInputs("Metin", `sections.${intro.index}.content.text`, intro.section.content.text, true)}
      </div>
    </div>
    <div class="admin-card">
      <div class="admin-row__header">
        <h3>Visual story</h3>
        <button class="button button--dark" type="button" data-add-story>Story kartı ekle</button>
      </div>
      ${(story.section.items || [])
        .map((item, itemIndex) => `
          <div class="admin-row">
            <div class="admin-row__header">
              <h4>${itemIndex + 1}. ${escapeHtml(item.title?.tr || "Story")}</h4>
              <div class="admin-actions">
                <button class="button button--muted" type="button" data-move-story="${itemIndex}" data-dir="-1">Yukarı</button>
                <button class="button button--muted" type="button" data-move-story="${itemIndex}" data-dir="1">Aşağı</button>
                <button class="button button--muted" type="button" data-remove-story="${itemIndex}">Sil</button>
              </div>
            </div>
            <div class="admin-grid">
              ${localizedInputs("Eyebrow", `sections.${story.index}.items.${itemIndex}.eyebrow`, item.eyebrow)}
              ${localizedInputs("Başlık", `sections.${story.index}.items.${itemIndex}.title`, item.title, true)}
              ${localizedInputs("Metin", `sections.${story.index}.items.${itemIndex}.text`, item.text, true)}
              ${select("Layout", `sections.${story.index}.items.${itemIndex}.layout`, item.layout || "image-left", ["image-left", "image-right", "centered"])}
              ${mediaSelect("Bölüm görseli", `sections.${story.index}.items.${itemIndex}.image`, item.image)}
              ${select("Görsel oranı", `sections.${story.index}.items.${itemIndex}.imageRatio`, item.imageRatio || "auto", ["auto", "16 / 9", "4 / 3", "1 / 1", "4 / 5", "3 / 4"])}
              ${rangeInput("Görsel yüksekliği", `sections.${story.index}.items.${itemIndex}.imageHeight`, item.imageHeight ?? 620, 220, 820)}
              ${select("Görsel sığdırma", `sections.${story.index}.items.${itemIndex}.imageFit`, item.imageFit || "cover", ["cover", "contain"])}
              ${select("Görsel pozisyonu", `sections.${story.index}.items.${itemIndex}.imagePosition`, item.imagePosition || "center center", ["center center", "top center", "bottom center", "left center", "right center"])}
              ${localizedInputs("Alt metin", `sections.${story.index}.items.${itemIndex}.alt`, item.alt)}
            </div>
          </div>
        `)
        .join("")}
    </div>
    <div class="admin-card">
      <h3>Foça bölümü</h3>
      <div class="admin-grid">
        ${localizedInputs("Eyebrow", `sections.${foca.index}.content.eyebrow`, foca.section.content.eyebrow)}
        ${localizedInputs("Başlık", `sections.${foca.index}.content.title`, foca.section.content.title, true)}
        ${localizedInputs("Metin", `sections.${foca.index}.content.text`, foca.section.content.text, true)}
        ${mediaSelect("Foça bölüm görseli", `sections.${foca.index}.content.image`, foca.section.content.image)}
        ${localizedInputs("Alt metin", `sections.${foca.index}.content.alt`, foca.section.content.alt)}
      </div>
    </div>
  `;
}

function renderRoomsAdmin() {
  return `
    <div class="admin-card">
      <div class="admin-row__header">
        <div>
          <h3>Oda kataloğu</h3>
          <p>Bu alan Supabase <code>rooms</code> ve <code>room_images</code> tablolarına kaydedilir. Ana sitedeki Odalar listesi buradan beslenir.</p>
        </div>
        <button class="button button--dark" type="button" data-add-room>Oda ekle</button>
      </div>
      ${(state.rooms || [])
        .map((room, index) => `
          <div class="admin-row">
            <div class="admin-row__header">
              <h3>${index + 1}. ${escapeHtml(t(room.title) || "Oda")}</h3>
              <div class="admin-actions">
                <button class="button button--muted" type="button" data-move-room="${index}" data-dir="-1">Yukarı</button>
                <button class="button button--muted" type="button" data-move-room="${index}" data-dir="1">Aşağı</button>
                <button class="button button--muted" type="button" data-remove-room="${index}">Sil</button>
              </div>
            </div>
            <div class="admin-grid">
              ${roomLocalizedInputs("Oda adı", `${index}.title`, room.title)}
              ${roomLocalizedInputs("Kısa açıklama", `${index}.short_description`, room.short_description, true)}
              ${roomLocalizedInputs("Detay açıklaması", `${index}.description`, room.description, true)}
              ${roomLocalizedInputs("Konum etiketi", `${index}.location_label`, room.location_label)}
              ${roomInput("Slug", `${index}.slug`, room.slug)}
              ${roomInput("Sıra", `${index}.sort_order`, room.sort_order || index * 10, "number")}
              ${roomInput("Misafir", `${index}.details.guests`, room.details?.guests || 2, "number")}
              ${roomInput("Yatak bilgisi", `${index}.details.beds`, room.details?.beds)}
              ${roomInput("Banyo bilgisi", `${index}.details.bath`, room.details?.bath)}
              ${roomTextarea("Olanaklar (virgülle ayır)", `${index}.amenitiesText`, Array.isArray(room.amenities) ? room.amenities.join(", ") : "")}
              ${roomMediaSelect("Kapak görseli", `${index}.cover_image_url`, room.cover_image_url)}
              ${roomMediaSelect("Detay galeri görseli 1", `${index}.images.0.image_url`, room.images?.[0]?.image_url || room.cover_image_url)}
            </div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderRoomsAdminPro() {
  return `
    <div class="admin-card rooms-admin">
      <div class="admin-row__header">
        <div>
          <h3>Oda katalogu</h3>
          <p>Oda isimleri, detay metinleri, galeri gorselleri ve ozellikler Supabase oda tablolarina kaydedilir.</p>
        </div>
        <button class="button button--dark" type="button" data-add-room>Oda ekle</button>
      </div>
      ${(state.rooms || [])
        .map((room, index) => {
          const roomKey = String(room.id || room.slug || index);
          const expanded = state.expandedRoomKeys.has(roomKey);
          return `
          <div class="admin-row room-admin-card ${expanded ? "is-expanded" : ""}">
            <div class="admin-row__header">
              <div class="room-admin-heading">
                <div class="room-admin-thumb">${roomCover(room) ? adminImage(roomCover(room), t(room.title), 180, 140) : `<span>Oda</span>`}</div>
                <div>
                  <p class="eyebrow">Oda ${index + 1}</p>
                  <h3>${escapeHtml(t(room.title) || "Oda")}</h3>
                  <small>${escapeHtml(room.slug || "")}</small>
                </div>
              </div>
              <div class="admin-actions">
                <button class="button button--dark" type="button" data-toggle-room-editor="${escapeHtml(roomKey)}" aria-expanded="${expanded}">${expanded ? "Kapat" : "Duzenle"}</button>
                <button class="button button--muted" type="button" data-move-room="${index}" data-dir="-1">Yukari</button>
                <button class="button button--muted" type="button" data-move-room="${index}" data-dir="1">Asagi</button>
                <button class="button button--muted" type="button" data-remove-room="${index}">Sil</button>
              </div>
            </div>
            <div class="room-admin-layout" ${expanded ? "" : "hidden"}>
              <div class="room-admin-block">
                <h4>Temel bilgiler</h4>
                <div class="admin-grid">
                  ${roomLocalizedInputs("Oda adi", `${index}.title`, room.title)}
                  ${roomLocalizedInputs("Konum etiketi", `${index}.location_label`, room.location_label)}
                  ${roomInput("Slug", `${index}.slug`, room.slug)}
                  ${roomInput("Sira", `${index}.sort_order`, room.sort_order || index * 10, "number")}
                </div>
              </div>
              <div class="room-admin-block">
                <h4>Kapasite</h4>
                <div class="admin-grid">
                  ${roomInput("Misafir", `${index}.details.guests`, room.details?.guests || 2, "number")}
                  ${roomInput("Yatak bilgisi", `${index}.details.beds`, room.details?.beds)}
                  ${roomInput("Banyo bilgisi", `${index}.details.bath`, room.details?.bath)}
                </div>
              </div>
              <div class="room-admin-block room-admin-block--wide">
                <h4>Metinler</h4>
                <div class="admin-grid">
                  ${roomLocalizedInputs("Kisa aciklama", `${index}.short_description`, room.short_description, true)}
                  ${roomLocalizedInputs("Detay aciklamasi", `${index}.description`, room.description, true)}
                </div>
              </div>
              <div class="room-admin-block">
                <h4>Kapak gorseli</h4>
                ${roomMediaSelect("Kapak gorseli", `${index}.cover_image_url`, room.cover_image_url, "Liste kartinda ve oda detayinda ilk gorsel olarak kullanilir.")}
              </div>
              ${roomGalleryEditor(room, index)}
              ${roomAmenitiesEditor(room, index)}
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderGalleryAdmin() {
  const section = state.data.sections.find((item) => item.type === "gallery");
  if (!section) return "<p>Gallery section bulunamadı.</p>";
  const sectionIndex = state.data.sections.indexOf(section);
  return `
    <div class="admin-card">
      <div class="admin-row__header">
        <h3>Galeri</h3>
        <button class="button button--dark" type="button" data-add-gallery>Görsel ekle</button>
      </div>
      ${(section.items || [])
        .map((item, index) => `
          <div class="admin-row">
            <div class="admin-row__header">
              <h3>${index + 1}. ${escapeHtml(item.label?.tr || "Görsel")}</h3>
              <div class="admin-actions">
                <button class="button button--muted" type="button" data-move-gallery="${index}" data-dir="-1">Yukarı</button>
                <button class="button button--muted" type="button" data-move-gallery="${index}" data-dir="1">Aşağı</button>
                <button class="button button--muted" type="button" data-remove-gallery="${index}">Sil</button>
              </div>
            </div>
            <div class="admin-grid">
              ${input("Label TR", `sections.${sectionIndex}.items.${index}.label.tr`, item.label?.tr)}
              ${input("Label EN", `sections.${sectionIndex}.items.${index}.label.en`, item.label?.en)}
              ${select("Oran", `sections.${sectionIndex}.items.${index}.ratio`, item.ratio || "4 / 5", ["4 / 5", "5 / 4", "3 / 4", "16 / 10", "1 / 1"])}
              ${mediaSelect("Galeri görseli", `sections.${sectionIndex}.items.${index}.image`, item.image)}
            </div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderUploadPanel() {
  if (!state.upload) return "";
  const uploads = Array.isArray(state.upload) ? state.upload : [state.upload];
  const isBusy = uploads.some((item) => item.phase === "optimizing" || item.phase === "uploading" || item.phase === "queued");

  return `
    <div class="upload-stack" role="status" aria-live="polite">
      <div class="upload-stack__header">
        <strong>${uploads.length > 1 ? `${uploads.length} görsel seçildi` : "Yükleme durumu"}</strong>
        ${isBusy ? "" : `<button class="upload-progress__close" type="button" data-clear-upload aria-label="Yükleme durumunu kapat">×</button>`}
      </div>
      ${uploads
        .map((item) => {
          const progress = Math.min(100, Math.max(0, Number(item.progress) || 0));
          const phase = item.phase || "uploading";
          const preview = item.preview
            ? `<img src="${escapeHtml(item.preview)}" alt="${escapeHtml(item.name || "Upload preview")}" decoding="async">`
            : `<span>${escapeHtml((item.name || "IMG").slice(0, 3).toUpperCase())}</span>`;
          const phaseLabel = phase === "success" ? "Tamamlandı" : phase === "error" ? "Hata" : phase === "queued" ? "Sırada" : "Yükleniyor";
          return `
            <div class="upload-progress is-${escapeHtml(phase)}">
              <div class="upload-progress__preview">${preview}</div>
              <div class="upload-progress__body">
                <div class="upload-progress__meta">
                  <div>
                    <strong>${escapeHtml(item.name || "Görsel")}</strong>
                    <small>${escapeHtml(formatFileSize(item.size || 0))} · ${escapeHtml(phaseLabel)}</small>
                  </div>
                  <span>${progress}%</span>
                </div>
                <div class="upload-progress__track" aria-label="Yükleme ilerlemesi">
                  <span style="width:${progress}%"></span>
                </div>
                <p>${escapeHtml(item.status || "")}</p>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderMediaAdmin() {
  const uploads = Array.isArray(state.upload) ? state.upload : [state.upload].filter(Boolean);
  const isUploading = uploads.some((item) => item.phase === "optimizing" || item.phase === "uploading" || item.phase === "queued");
  return `
    <div class="admin-card">
      <div class="admin-row__header">
        <div>
          <h3>Medya kütüphanesi</h3>
          <p>Supabase Storage'a görsel yükleyebilir, yüklenen görselleri silebilir ve URL'lerini kopyalayabilirsin.</p>
        </div>
      </div>
      <div class="upload-dropzone${isUploading ? " is-busy" : ""}" data-upload-dropzone>
        <div>
          <strong>Görsel yükle</strong>
          <p>Birden fazla görseli aynı anda seçebilir veya buraya sürükleyip bırakabilirsin. Yükleme ilerlemesi burada canlı görünür.</p>
        </div>
        <label class="button button--dark file-button">
          ${isUploading ? "Yükleniyor..." : "Görselleri seç"}
          <input type="file" accept="image/*" data-upload-media multiple ${isUploading ? "disabled" : ""}>
        </label>
      </div>
      ${renderUploadPanel()}
      <div class="media-grid">
        ${
          state.media.length
            ? state.media
                .map((file, index) => `
            <div class="media-item" data-media-index="${index}">
              ${adminImage(file.path, file.name, 320, 240)}
              <small>${escapeHtml(file.path)}</small>
              <div class="media-actions">
                <button class="button button--muted" type="button" data-copy-media="${index}">URL kopyala</button>
                <button class="button button--muted" type="button" data-delete-media="${index}">Sil</button>
              </div>
            </div>
          `)
                .join("")
            : `<div class="media-empty">Henüz Supabase'e yüklenmiş görsel yok.</div>`
        }
      </div>
    </div>
  `;
}

function renderThemeAdmin() {
  const theme = state.data.theme;
  return `
    <div class="admin-card">
      <h3>Global tema</h3>
      <div class="admin-grid three">
        ${color("White", "theme.white", theme.white)}
        ${color("Sand", "theme.sand", theme.sand)}
        ${color("Stone", "theme.stone", theme.stone)}
        ${color("Ink", "theme.ink", theme.ink)}
        ${color("Blue", "theme.blue", theme.blue)}
        ${color("Soft blue", "theme.blueSoft", theme.blueSoft)}
        ${color("Gray", "theme.gray", theme.gray)}
        ${color("Body background", "theme.bodyBackground", theme.bodyBackground)}
        ${select("Button style", "theme.buttonStyle", theme.buttonStyle || "solid", ["solid", "outline", "soft"])}
        ${select("Radius", "theme.radiusPreset", theme.radiusPreset || "square", ["square", "soft", "rounded"])}
        <label><span>Animasyon</span><select data-path="theme.animations"><option value="true" ${theme.animations !== false ? "selected" : ""}>Açık</option><option value="false" ${theme.animations === false ? "selected" : ""}>Kapalı</option></select></label>
      </div>
    </div>
  `;
}

function renderSeoAdmin() {
  const contact = state.data.sections.find((section) => section.type === "contact");
  const contactIndex = state.data.sections.indexOf(contact);
  return `
    <div class="admin-card">
      <h3>SEO</h3>
      <div class="admin-grid">
        ${input("Title", "meta.title", state.data.meta.title)}
        ${mediaSelect("Link paylaşım görseli", "meta.ogImage", state.data.meta.ogImage, "Bu görsel sayfa içinde görünmez; link paylaşım önizlemelerinde kullanılır.")}
        <p class="admin-help">Sayfanın görünen hero arka planını değiştirmek için Ana Sayfa sekmesindeki “Ana sayfa arka plan görseli” alanını kullan.</p>
        ${seoPreview()}
        ${textarea("Description", "meta.description", state.data.meta.description)}
        ${input("Footer sol", "footer.left", state.data.footer.left)}
        ${input("Footer sağ", "footer.right", state.data.footer.right)}
      </div>
    </div>
    <div class="admin-card">
      <h3>İletişim</h3>
      <div class="admin-grid">
        ${input("WhatsApp", `sections.${contactIndex}.content.whatsapp`, contact.content.whatsapp)}
        ${input("Instagram", `sections.${contactIndex}.content.instagram`, contact.content.instagram)}
        ${input("Telefon", `sections.${contactIndex}.content.phone`, contact.content.phone)}
        ${input("Telefon href", `sections.${contactIndex}.content.phoneHref`, contact.content.phoneHref)}
        ${input("Map embed", `sections.${contactIndex}.content.map`, contact.content.map)}
        ${input("Adres TR", `sections.${contactIndex}.content.address.tr`, contact.content.address.tr)}
        ${input("Adres EN", `sections.${contactIndex}.content.address.en`, contact.content.address.en)}
      </div>
    </div>
  `;
}

function renderAdmin() {
  renderAdminTabs();
  const renderers = {
    dashboard: renderDashboard,
    site: renderSiteAdmin,
    sections: renderSectionsAdmin,
    content: renderContentAdmin,
    rooms: renderRoomsAdminPro,
    gallery: renderGalleryAdmin,
    media: renderMediaAdmin,
    theme: renderThemeAdmin,
    seo: renderSeoAdmin,
  };
  adminContent.innerHTML = `${renderers[state.adminTab]()}${renderMediaPicker()}`;
}

function normalizeValue(value) {
  if (typeof value === "string" && value.trim() === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function swap(items, index, dir) {
  const next = index + dir;
  if (next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next], items[index]];
}

async function loadMedia() {
  if (!state.token) return;
  try {
    const remote = await supabaseRequest(`/storage/v1/object/list/${supabaseMediaBucket}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "uploads", limit: 100, offset: 0, sortBy: { column: "created_at", order: "desc" } }),
    }).catch(() => []);
    const remoteFiles = (remote || [])
      .filter((file) => file.name && file.name !== ".emptyFolderPlaceholder")
      .map((file) => {
        const objectPath = `uploads/${file.name}`;
        return { name: file.name, path: storagePublicUrl(objectPath), storagePath: objectPath, size: file.metadata?.size || 0, local: false };
      });
    state.media = remoteFiles;
    if (state.adminOpen) renderAdmin();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function saveSite(message = "Supabase'e kaydedildi.") {
  if (!isAllowedAdmin()) throw new Error("Bu e-posta admin allowlist içinde değil.");
  await saveRoomsCatalog();
  state.data.updatedAt = new Date().toISOString();
  await supabaseRequest(`/rest/v1/site_documents?id=eq.${encodeURIComponent(supabaseDocumentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ content: state.data, updated_at: state.data.updatedAt }),
  });
  await fetch("/api/local-content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.data),
  }).catch(() => {});
  renderSite();
  renderAdmin();
  showAdminMessage(message);
}

function roomPayload(room, index) {
  const amenities = Array.isArray(room.amenities)
    ? room.amenities
    : String(room.amenitiesText || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const title = room.title || {};
  return {
    slug: room.slug || slugify(title.tr || title.en || `oda-${index + 1}`),
    title,
    short_description: room.short_description || {},
    description: room.description || room.short_description || {},
    location_label: room.location_label || { tr: "FoÃ§a bÃ¶lgesinde oda", en: "Room in Foca" },
    details: room.details || {},
    amenities,
    cover_image_url: room.cover_image_url || room.images?.[0]?.image_url || "",
    status: room.status || "published",
    sort_order: Number(room.sort_order || index * 10),
  };
}

async function saveRoomsCatalog() {
  if (!hasSupabaseConfig()) return;
  for (const id of state.removedRoomIds) {
    await supabaseRequest(`/rest/v1/rooms?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
  state.removedRoomIds = [];

  for (const [index, room] of state.rooms.entries()) {
    const payload = roomPayload(room, index);
    let saved;
    if (room.id && !String(room.id).startsWith("fallback-") && !String(room.id).startsWith("local-")) {
      saved = await supabaseRequest(`/rest/v1/rooms?id=eq.${encodeURIComponent(room.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    } else {
      saved = await supabaseRequest("/rest/v1/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    }
    const savedRoom = saved?.[0];
    if (!savedRoom?.id) continue;
    room.id = savedRoom.id;
    room.slug = savedRoom.slug;
    room.cover_image_url = savedRoom.cover_image_url;
    room.amenities = payload.amenities;

    const imageUrls = [payload.cover_image_url, ...(room.images || []).map((image) => image.image_url)].filter(Boolean);
    const uniqueImages = [...new Set(imageUrls)];
    await supabaseRequest(`/rest/v1/room_images?room_id=eq.${encodeURIComponent(savedRoom.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (uniqueImages.length) {
      await supabaseRequest("/rest/v1/room_images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(
          uniqueImages.map((url, imageIndex) => ({
            room_id: savedRoom.id,
            image_url: url,
            alt: savedRoom.title,
            sort_order: (imageIndex + 1) * 10,
            is_cover: imageIndex === 0,
          }))
        ),
      });
    }
  }
  await loadRoomsCatalog();
}

async function uploadMediaFiles(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!imageFiles.length) throw new Error("Lütfen en az bir görsel dosyası seç.");
  if (!isAllowedAdmin()) throw new Error("Bu e-posta medya yükleme yetkisine sahip değil.");

  clearUploadState();
  state.upload = imageFiles.map((file, index) => ({
    id: `${Date.now()}-${index}-${file.name}`,
    name: file.name,
    originalSize: file.size,
    size: file.size,
    preview: URL.createObjectURL(file),
    progress: 0,
    phase: index === 0 ? "optimizing" : "queued",
    status: index === 0 ? "Supabase Storage bağlantısı hazırlanıyor..." : "Yükleme sırasında bekliyor...",
  }));
  state.upload.forEach((item, index) => {
    item.status = index === 0 ? "Gorsel optimize ediliyor..." : "Optimizasyon sirasinda bekliyor...";
  });
  renderAdmin();

  let successCount = 0;
  for (const [index, file] of imageFiles.entries()) {
    const item = state.upload[index];
    let uploadFile = file;
    item.phase = "optimizing";
    item.status = "Supabase Storage'a yükleniyor...";
    item.progress = 5;
    item.status = "Gorsel boyutu ve kalitesi optimize ediliyor...";
    renderAdmin();

    try {
      const optimized = await optimizeImageForUpload(file);
      uploadFile = optimized.file;
      item.size = uploadFile.size;
      item.progress = 15;
      item.phase = "uploading";
      item.status = optimized.optimized
        ? `Optimize edildi: ${formatFileSize(file.size)} → ${formatFileSize(uploadFile.size)}. Supabase'e yukleniyor...`
        : `Optimizasyon gerekmiyor (${formatFileSize(uploadFile.size)}). Supabase'e yukleniyor...`;
      renderAdmin();

      const objectPath = safeUploadName(uploadFile.name);
      await uploadToStorageWithProgress(uploadFile, objectPath, (progress) => {
        item.progress = Math.min(100, 15 + Math.round(progress * 0.85));
        item.phase = "uploading";
        item.status = progress >= 100 ? "Yükleme tamamlandı, medya kütüphanesi yenilenecek..." : "Supabase Storage'a yükleniyor...";
        renderAdmin();
      });
      item.progress = 100;
      item.phase = "success";
      item.status = "Yükleme tamamlandı.";
      successCount += 1;
      renderAdmin();
    } catch (error) {
      item.phase = "error";
      item.status = error.message;
      renderAdmin();
    }
  }

  if (successCount > 0) {
    await loadMedia();
    state.upload = state.upload.map((item) =>
      item.phase === "success"
        ? { ...item, status: "Yükleme tamamlandı. Görsel medya kütüphanesine eklendi." }
        : item
    );
    renderAdmin();
  }

  const failCount = imageFiles.length - successCount;
  if (failCount) {
    showAdminMessage(`${successCount} görsel yüklendi, ${failCount} görselde hata oluştu.`, "error");
  } else {
    showAdminMessage(`${successCount} görsel Supabase Storage'a yüklendi.`);
  }
}

document.addEventListener("click", (event) => {
  const slide = event.target.closest("[data-room-slide]");
  if (slide) {
    moveRoomSlider(slide.dataset.roomSlide, Number(slide.dataset.dir || 1));
    return;
  }
  const open = event.target.closest("[data-open-room]");
  if (open) {
    openRoomDetail(open.dataset.openRoom);
    return;
  }
  const close = event.target.closest("[data-close-room]");
  if (close) {
    closeRoomDetail();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeRoomDetail();
});

adminContent.addEventListener("input", (event) => {
  const roomPath = event.target.dataset.roomPath;
  if (roomPath) {
    setRoomValue(roomPath, normalizeValue(event.target.value));
    return;
  }
  const path = event.target.dataset.path;
  if (!path) return;
  if (event.target.matches("select,input[type='color']")) return;
  const shouldRender = event.target.matches("input[type='range']");
  setValue(path, normalizeValue(event.target.value), { render: shouldRender });
  if (shouldRender) renderAdmin();
});

adminContent.addEventListener(
  "blur",
  (event) => {
    const roomPath = event.target.dataset.roomPath;
    if (roomPath && event.target.matches("input,textarea")) {
      setRoomValue(roomPath, normalizeValue(event.target.value));
      return;
    }
    const path = event.target.dataset.path;
    if (!path) return;
    if (event.target.matches("input,textarea")) {
      setValue(path, normalizeValue(event.target.value), { render: true });
    }
  },
  true
);

adminContent.addEventListener("click", async (event) => {
  const target = event.target.closest(
    "[data-open-media-picker], [data-close-media-picker], [data-pick-media], [data-clear-upload], [data-color-preset], [data-add-room], [data-add-gallery], [data-add-story], [data-remove-story], [data-move-story], [data-copy-media], [data-delete-media], [data-remove-room], [data-remove-gallery], [data-move-room], [data-move-gallery], [data-move-section], [data-add-room-image], [data-remove-room-image], [data-move-room-image], [data-set-room-cover], [data-toggle-room-amenity], [data-add-custom-amenity], [data-remove-room-amenity], [data-toggle-room-editor]"
  );
  if (!target || !adminContent.contains(target)) return;
  if (target.dataset.toggleRoomEditor !== undefined) {
    const key = String(target.dataset.toggleRoomEditor);
    if (state.expandedRoomKeys.has(key)) state.expandedRoomKeys.delete(key);
    else state.expandedRoomKeys.add(key);
    renderAdmin();
    return;
  }
  if (target.dataset.openMediaPicker !== undefined) {
    const label = target.closest(".media-choice")?.querySelector(".admin-field-label")?.textContent || "Görsel seç";
    state.mediaPicker = target.dataset.roomMediaPath ? { roomPath: target.dataset.roomMediaPath, label } : { path: target.dataset.path, label };
    state.mediaPickerLimit = 10;
    renderAdmin();
    return;
  }
  if (target.dataset.closeMediaPicker !== undefined) {
    state.mediaPicker = null;
    state.mediaPickerLimit = 10;
    renderAdmin();
    return;
  }
  if (target.dataset.pickMedia !== undefined) {
    const file = state.media[Number(target.dataset.pickMedia)];
    if (file?.path && (state.mediaPicker?.path || state.mediaPicker?.roomPath)) {
      if (state.mediaPicker.roomPath) {
        setRoomValue(state.mediaPicker.roomPath, file.path);
        renderSite();
      } else {
        setValue(state.mediaPicker.path, file.path, { render: true });
      }
      state.mediaPicker = null;
      renderAdmin();
      try {
        await saveSite("Görsel seçildi ve Supabase'e kaydedildi.");
      } catch (error) {
        showAdminMessage(error.message, "error");
      }
    }
    return;
  }
  if (target.dataset.clearUpload !== undefined) {
    clearUploadState();
    renderAdmin();
    return;
  }
  if (target.dataset.colorPreset !== undefined) {
    setValue(target.dataset.path, target.dataset.colorPreset, { render: true });
    renderAdmin();
    return;
  }
  if (target.dataset.addRoom !== undefined) {
    const image = "";
    const next = state.rooms.length + 1;
    state.rooms.push({
      id: `local-${Date.now()}`,
      slug: `oda-${next}`,
      title: { tr: "Yeni Oda", en: "New Room" },
      short_description: { tr: "KÄ±sa aÃ§Ä±klama.", en: "Short description." },
      description: { tr: "Oda detay aÃ§Ä±klamasÄ±.", en: "Room detail description." },
      location_label: { tr: "FoÃ§a bÃ¶lgesinde oda", en: "Room in Foca" },
      details: { guests: 2, beds: "1 Ã§ift kiÅŸilik yatak", bath: "Ã–zel banyo" },
      amenities: ["Klima", "Wi-Fi", "Ã–zel banyo"],
      cover_image_url: image,
      images: image ? [{ image_url: image, alt: { tr: "Oda", en: "Room" }, is_cover: true, sort_order: 10 }] : [],
      status: "published",
      sort_order: next * 10,
    });
    const newRoom = state.rooms.at(-1);
    newRoom.short_description = { tr: "K\u0131sa a\u00e7\u0131klama.", en: "Short description." };
    newRoom.description = { tr: "Oda detay a\u00e7\u0131klamas\u0131.", en: "Room detail description." };
    newRoom.location_label = { tr: "Fo\u00e7a b\u00f6lgesinde oda", en: "Room in Foca" };
    newRoom.details = { guests: 2, beds: "1 Adet \u00c7ift Ki\u015filik Yatak", bath: "\u00d6zel banyo" };
    newRoom.amenities = [];
    newRoom.cover_image_url = "";
    newRoom.images = [];
    state.expandedRoomKeys.add(String(state.rooms.at(-1).id));
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.addRoomImage !== undefined) {
    const roomIndex = Number(target.dataset.addRoomImage);
    const room = state.rooms[roomIndex];
    if (!room) return;
    room.images ??= [];
    room.images.push({ image_url: "", alt: room.title || { tr: "Oda", en: "Room" }, sort_order: (room.images.length + 1) * 10, is_cover: false });
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.removeRoomImage !== undefined) {
    const roomIndex = Number(target.dataset.removeRoomImage);
    const imageIndex = Number(target.dataset.imageIndex);
    const room = state.rooms[roomIndex];
    if (!room?.images) return;
    room.images.splice(imageIndex, 1);
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.moveRoomImage !== undefined) {
    const roomIndex = Number(target.dataset.moveRoomImage);
    const imageIndex = Number(target.dataset.imageIndex);
    const room = state.rooms[roomIndex];
    if (!room?.images) return;
    swap(room.images, imageIndex, Number(target.dataset.dir));
    room.images.forEach((image, index) => {
      image.sort_order = (index + 1) * 10;
    });
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.setRoomCover !== undefined) {
    const roomIndex = Number(target.dataset.setRoomCover);
    const imageIndex = Number(target.dataset.imageIndex);
    const room = state.rooms[roomIndex];
    const image = room?.images?.[imageIndex];
    if (!room || !image?.image_url) return;
    room.cover_image_url = image.image_url;
    room.images.forEach((item, index) => {
      item.is_cover = index === imageIndex;
    });
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.toggleRoomAmenity !== undefined) {
    const roomIndex = Number(target.dataset.toggleRoomAmenity);
    const room = state.rooms[roomIndex];
    if (!room) return;
    room.amenities ??= [];
    const amenity = { tr: target.dataset.amenityTr || "", en: target.dataset.amenityEn || target.dataset.amenityTr || "" };
    const key = amenityKey(amenity);
    const existingIndex = room.amenities.findIndex((item) => amenityKey(item) === key);
    if (existingIndex >= 0) room.amenities.splice(existingIndex, 1);
    else room.amenities.push(amenity);
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.addCustomAmenity !== undefined) {
    const roomIndex = Number(target.dataset.addCustomAmenity);
    const room = state.rooms[roomIndex];
    const input = adminContent.querySelector(`[data-room-custom-amenity="${roomIndex}"]`);
    const value = input?.value?.trim();
    if (!room || !value) return;
    room.amenities ??= [];
    if (!room.amenities.some((item) => amenityKey(item) === value)) room.amenities.push({ tr: value, en: value });
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.removeRoomAmenity !== undefined) {
    const roomIndex = Number(target.dataset.removeRoomAmenity);
    const amenityIndex = Number(target.dataset.amenityIndex);
    const room = state.rooms[roomIndex];
    if (!room?.amenities) return;
    room.amenities.splice(amenityIndex, 1);
    renderSite();
    renderAdmin();
    return;
  }
  if (target.dataset.addGallery !== undefined) {
    const gallery = state.data.sections.find((section) => section.type === "gallery");
    gallery.items.push({ label: { tr: "Yeni Görsel", en: "New Image" }, image: state.media[0]?.path || "assets/images/hero-aegean-escape.webp", ratio: "4 / 5" });
  }
  if (target.dataset.addStory !== undefined) {
    const story = state.data.sections.find((section) => section.type === "story");
    story.items.push({
      eyebrow: { tr: "Yeni Deneyim", en: "New Experience" },
      title: { tr: "Yeni başlık", en: "New title" },
      text: { tr: "Kısa açıklama.", en: "Short description." },
      image: state.media[0]?.path || "assets/images/hero-aegean-escape.webp",
      alt: { tr: "Paska Otel deneyimi", en: "Paska Hotel experience" },
      layout: "image-left",
      imageRatio: "auto",
      imageHeight: 620,
      imageFit: "cover",
      imagePosition: "center center",
    });
  }
  if (target.dataset.removeStory !== undefined) state.data.sections.find((section) => section.type === "story").items.splice(Number(target.dataset.removeStory), 1);
  if (target.dataset.moveStory !== undefined) swap(state.data.sections.find((section) => section.type === "story").items, Number(target.dataset.moveStory), Number(target.dataset.dir));
  if (target.dataset.copyMedia !== undefined) {
    const file = state.media[Number(target.dataset.copyMedia)];
    if (file?.path) {
      await navigator.clipboard?.writeText(file.path).catch(() => {});
      showAdminMessage("Görsel URL'i kopyalandı.");
    }
    return;
  }
  if (target.dataset.deleteMedia !== undefined) {
    const file = state.media[Number(target.dataset.deleteMedia)];
    if (!file || file.local || !file.storagePath) return;
    if (!confirm(`${file.name} silinsin mi?`)) return;
    try {
      if (!isAllowedAdmin()) throw new Error("Bu e-posta medya silme yetkisine sahip değil.");
      await supabaseRequest(`/storage/v1/object/${supabaseMediaBucket}/${file.storagePath}`, { method: "DELETE" });
      await loadMedia();
      showAdminMessage("Görsel silindi.");
    } catch (error) {
      showAdminMessage(error.message, "error");
    }
    return;
  }
  if (target.dataset.removeRoom !== undefined) {
    const roomIndex = Number(target.dataset.removeRoom);
    const room = state.rooms[roomIndex];
    const roomName = t(room?.title) || `Oda ${roomIndex + 1}`;
    if (!window.confirm(`"${roomName}" odasini silmek istediginize emin misiniz? Bu islem Kaydet butonuna bastiginizda Supabase'e yansir.`)) return;
    const removed = state.rooms.splice(roomIndex, 1)[0];
    state.expandedRoomKeys.delete(String(removed?.id || removed?.slug || roomIndex));
    if (removed?.id && !String(removed.id).startsWith("local-") && !String(removed.id).startsWith("fallback-")) state.removedRoomIds.push(removed.id);
  }
  if (target.dataset.removeGallery !== undefined) state.data.sections.find((section) => section.type === "gallery").items.splice(Number(target.dataset.removeGallery), 1);
  if (target.dataset.moveRoom !== undefined) {
    swap(state.rooms, Number(target.dataset.moveRoom), Number(target.dataset.dir));
    state.rooms.forEach((room, index) => {
      room.sort_order = (index + 1) * 10;
    });
  }
  if (target.dataset.moveGallery !== undefined) swap(state.data.sections.find((section) => section.type === "gallery").items, Number(target.dataset.moveGallery), Number(target.dataset.dir));
  if (target.dataset.moveSection !== undefined) {
    const current = state.data.sections[Number(target.dataset.moveSection)];
    const otherOrder = sortedSections()[Math.max(0, sortedSections().indexOf(current) + Number(target.dataset.dir))]?.order;
    if (otherOrder !== undefined) {
      const other = state.data.sections.find((section) => section.order === otherOrder);
      [current.order, other.order] = [other.order, current.order];
    }
  }
  renderSite();
  renderAdmin();
});

adminContent.addEventListener("change", async (event) => {
  const path = event.target.dataset.path;
  if (path) {
    setValue(path, normalizeValue(event.target.value), { render: true });
    renderAdmin();
    return;
  }
  if (!event.target.matches("[data-upload-media]")) return;
  const files = event.target.files;
  if (!files?.length) return;
  try {
    await uploadMediaFiles(files);
  } catch (error) {
    showAdminMessage(error.message, "error");
  } finally {
    event.target.value = "";
  }
});

adminContent.addEventListener("dragover", (event) => {
  const dropzone = event.target.closest("[data-upload-dropzone]");
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.add("is-dragover");
});

adminContent.addEventListener("dragleave", (event) => {
  const dropzone = event.target.closest("[data-upload-dropzone]");
  if (!dropzone || dropzone.contains(event.relatedTarget)) return;
  dropzone.classList.remove("is-dragover");
});

adminContent.addEventListener("drop", async (event) => {
  const dropzone = event.target.closest("[data-upload-dropzone]");
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.remove("is-dragover");
  const files = event.dataTransfer?.files;
  const uploads = Array.isArray(state.upload) ? state.upload : [state.upload].filter(Boolean);
  if (!files?.length || uploads.some((item) => item.phase === "optimizing" || item.phase === "uploading" || item.phase === "queued")) return;
  try {
    await uploadMediaFiles(files);
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
});

adminContent.addEventListener("scroll", (event) => {
  const panel = event.target.matches?.(".media-picker__panel") ? event.target : event.target.closest?.(".media-picker__panel");
  if (!panel || !state.mediaPicker) return;
  const nearBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 160;
  if (!nearBottom || state.mediaPickerLimit >= state.media.length) return;
  const current = state.mediaPicker.roomPath ? getRoomValue(state.mediaPicker.roomPath) : getValue(state.mediaPicker.path);
  const from = state.mediaPickerLimit;
  const to = Math.min(from + 10, state.media.length);
  const grid = panel.querySelector(".media-picker__grid");
  const more = panel.querySelector("[data-media-load-more]");
  if (!grid) return;
  grid.insertAdjacentHTML("beforeend", state.media.slice(from, to).map((file) => mediaPickerItem(file, current)).join(""));
  state.mediaPickerLimit = to;
  if (more) {
    if (to >= state.media.length) {
      more.remove();
    } else {
      more.textContent = `Kaydırdıkça daha fazla görsel yüklenecek · ${to}/${state.media.length}`;
    }
  }
}, true);

adminContent.addEventListener("pointerdown", (event) => {
  const target = event.target.closest("[data-brand-drag]");
  if (!target) return;
  event.preventDefault();
  const brand = state.data.brand || {};
  state.brandDrag = {
    startX: event.clientX,
    startY: event.clientY,
    offsetX: Number(brand.offsetX || 0),
    offsetY: Number(brand.offsetY || 0),
  };
  target.setPointerCapture?.(event.pointerId);
});

document.addEventListener("pointermove", (event) => {
  if (!state.brandDrag) return;
  const nextX = Math.max(-80, Math.min(180, Math.round(state.brandDrag.offsetX + event.clientX - state.brandDrag.startX)));
  const nextY = Math.max(-40, Math.min(80, Math.round(state.brandDrag.offsetY + event.clientY - state.brandDrag.startY)));
  state.data.brand.offsetX = nextX;
  state.data.brand.offsetY = nextY;
  renderSite();
  const mark = $("[data-brand-drag]");
  if (mark) {
    mark.style.setProperty("--brand-offset-x", `${nextX}px`);
    mark.style.setProperty("--brand-offset-y", `${nextY}px`);
  }
});

document.addEventListener("pointerup", () => {
  if (!state.brandDrag) return;
  state.brandDrag = null;
  if (state.adminOpen && state.adminTab === "site") renderAdmin();
});

adminTabs.addEventListener("click", (event) => {
  const tab = event.target.dataset.tab;
  if (!tab) return;
  state.adminTab = tab;
  renderAdmin();
});

async function handleLogin(formElement) {
  loginMessage.textContent = "";
  const submitButton = $("[data-login-submit]");
  const form = new FormData(formElement);
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");
  loginMessage.textContent = "Supabase girişi kontrol ediliyor...";
  if (submitButton) submitButton.disabled = true;
  try {
    const data = await supabaseSignIn(email, password);
    saveSession(data);
    if (!isAllowedAdmin(data.user?.email)) {
      clearSession();
      throw new Error("Bu e-posta admin allowlist içinde değil. config.js ve Supabase admin_emails tablosunu güncelle.");
    }
    loginMessage.textContent = "Panel açılıyor...";
    adminLogin.hidden = true;
    adminLogin.style.display = "none";
    adminPanel.hidden = false;
    adminPanel.style.display = "grid";
    renderAdmin();
    loadMedia();
    showAdminMessage("Supabase girişi başarılı.");
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

$("[data-login-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleLogin(event.currentTarget);
});

$("[data-login-submit]").addEventListener("click", async (event) => {
  const form = event.currentTarget.closest("form");
  if (!form || !form.reportValidity()) return;
  event.preventDefault();
  await handleLogin(form);
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-password-form]")) return;
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await supabaseRequest("/auth/v1/user", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.get("newPassword") }),
    });
    event.target.reset();
    showAdminMessage("Supabase şifresi güncellendi.");
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.matches("[data-close-toast]")) return;
  const toast = event.target.closest("[data-admin-toast]");
  if (toast) toast.classList.remove("is-visible");
});

$("[data-save-site]").addEventListener("click", () => saveSite().catch((error) => showAdminMessage(error.message, "error")));
$("[data-preview-site]").addEventListener("click", () => window.open("/", "_blank"));
$("[data-export-site]").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paska-site-content-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
$("[data-import-site]").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state.data = JSON.parse(await file.text());
  renderSite();
  renderAdmin();
  showAdminMessage("JSON içe aktarıldı. Kalıcı yapmak için Kaydet’e bas.");
});
$("[data-logout]").addEventListener("click", async () => {
  await supabaseSignOut();
  clearSession();
  openAdmin();
});
document.querySelectorAll("[data-admin-close]").forEach((button) => button.addEventListener("click", closeAdmin));

window.addEventListener("scroll", () => {
  $("[data-header]").classList.toggle("is-scrolled", window.scrollY > 24);
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    openAdmin();
  }
  if (event.key === "Escape" && state.mediaPicker) {
    state.mediaPicker = null;
    renderAdmin();
    return;
  }
  if (event.key === "Escape" && state.adminOpen) closeAdmin();
});

langToggle.addEventListener("click", () => {
  state.activeLang = state.activeLang === "tr" ? "en" : "tr";
  renderSite();
});

restoreSession();
loadSiteContent();
