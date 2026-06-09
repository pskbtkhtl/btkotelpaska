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
let toastTimer = null;

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
    .map((item) => `<a href="#${item.id}">${escapeHtml(t(item.label))}</a>`)
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

function renderHero(section) {
  const content = section.content || {};
  return `
    <section class="hero" id="hero" aria-label="Paska Otel">
      <img class="hero__image" src="${escapeHtml(content.image)}" alt="${escapeHtml(t(content.alt))}" />
      <div class="hero__shade"></div>
      <div class="hero__content reveal">
        <p class="eyebrow">${escapeHtml(t(content.eyebrow))}</p>
        <h1>${escapeHtml(t(content.title))}</h1>
        <p>${escapeHtml(t(content.subtitle))}</p>
        <div class="hero__actions">
          <a class="button button--light" href="#rooms">${escapeHtml(t(content.primaryButton))}</a>
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
                <img src="${escapeHtml(item.image)}" alt="${escapeHtml(t(item.alt))}" loading="lazy">
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
  return `
    <section class="${sectionClass(section, "rooms")}" id="rooms" ${styleVars(section)}>
      ${heading(section)}
      <div class="room-grid ${layout}">
        ${(section.items || [])
          .map(
            (room) => `
              <article class="room-card reveal">
                <div class="room-card__image"><img src="${escapeHtml(room.image)}" alt="${escapeHtml(t(room.alt))}" loading="lazy"></div>
                <div class="room-card__copy">
                  <h3>${escapeHtml(t(room.name))}</h3>
                  <p>${escapeHtml(t(room.desc))}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
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
                <img src="${escapeHtml(item.image)}" alt="${escapeHtml(t(item.label))}" loading="lazy">
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
      <div class="foca__image reveal"><img src="${escapeHtml(content.image)}" alt="${escapeHtml(t(content.alt))}" loading="lazy" /></div>
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
  siteRoot.innerHTML = sortedSections().map(renderSection).join("");
  footerRoot.innerHTML = `<p>${escapeHtml(state.data.footer?.left || "")}</p><p>${escapeHtml(state.data.footer?.right || "")}</p>`;
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
  renderSite();
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
  const current = getValue(state.mediaPicker.path);
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
  const section = state.data.sections.find((item) => item.type === "rooms");
  if (!section) return "<p>Rooms section bulunamadı.</p>";
  const sectionIndex = state.data.sections.indexOf(section);
  return `
    <div class="admin-card">
      <div class="admin-row__header">
        <h3>Oda kartları</h3>
        <button class="button button--dark" type="button" data-add-room>Oda ekle</button>
      </div>
      ${(section.items || [])
        .map((room, index) => `
          <div class="admin-row">
            <div class="admin-row__header">
              <h3>${index + 1}. ${escapeHtml(room.name?.tr || "Oda")}</h3>
              <div class="admin-actions">
                <button class="button button--muted" type="button" data-move-room="${index}" data-dir="-1">Yukarı</button>
                <button class="button button--muted" type="button" data-move-room="${index}" data-dir="1">Aşağı</button>
                <button class="button button--muted" type="button" data-remove-room="${index}">Sil</button>
              </div>
            </div>
            <div class="admin-grid">
              ${input("İsim TR", `sections.${sectionIndex}.items.${index}.name.tr`, room.name?.tr)}
              ${input("İsim EN", `sections.${sectionIndex}.items.${index}.name.en`, room.name?.en)}
              ${textarea("Açıklama TR", `sections.${sectionIndex}.items.${index}.desc.tr`, room.desc?.tr)}
              ${textarea("Açıklama EN", `sections.${sectionIndex}.items.${index}.desc.en`, room.desc?.en)}
              ${mediaSelect("Oda görseli", `sections.${sectionIndex}.items.${index}.image`, room.image)}
            </div>
          </div>
        `)
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
  const isBusy = uploads.some((item) => item.phase === "uploading" || item.phase === "queued");

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
  const isUploading = uploads.some((item) => item.phase === "uploading" || item.phase === "queued");
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
    rooms: renderRoomsAdmin,
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

async function uploadMediaFiles(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!imageFiles.length) throw new Error("Lütfen en az bir görsel dosyası seç.");
  if (!isAllowedAdmin()) throw new Error("Bu e-posta medya yükleme yetkisine sahip değil.");

  clearUploadState();
  state.upload = imageFiles.map((file, index) => ({
    id: `${Date.now()}-${index}-${file.name}`,
    name: file.name,
    size: file.size,
    preview: URL.createObjectURL(file),
    progress: 0,
    phase: index === 0 ? "uploading" : "queued",
    status: index === 0 ? "Supabase Storage bağlantısı hazırlanıyor..." : "Yükleme sırasında bekliyor...",
  }));
  renderAdmin();

  let successCount = 0;
  for (const [index, file] of imageFiles.entries()) {
    const item = state.upload[index];
    const objectPath = safeUploadName(file.name);
    item.phase = "uploading";
    item.status = "Supabase Storage'a yükleniyor...";
    item.progress = Math.max(1, item.progress || 0);
    renderAdmin();

    try {
      await uploadToStorageWithProgress(file, objectPath, (progress) => {
        item.progress = progress;
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

adminContent.addEventListener("input", (event) => {
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
    "[data-open-media-picker], [data-close-media-picker], [data-pick-media], [data-clear-upload], [data-color-preset], [data-add-room], [data-add-gallery], [data-add-story], [data-remove-story], [data-move-story], [data-copy-media], [data-delete-media], [data-remove-room], [data-remove-gallery], [data-move-room], [data-move-gallery], [data-move-section]"
  );
  if (!target || !adminContent.contains(target)) return;
  if (target.dataset.openMediaPicker !== undefined) {
    const label = target.closest(".media-choice")?.querySelector(".admin-field-label")?.textContent || "Görsel seç";
    state.mediaPicker = { path: target.dataset.path, label };
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
    if (file?.path && state.mediaPicker?.path) {
      setValue(state.mediaPicker.path, file.path, { render: true });
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
    const rooms = state.data.sections.find((section) => section.type === "rooms");
    rooms.items.push({ name: { tr: "Yeni Oda", en: "New Room" }, desc: { tr: "Kısa açıklama.", en: "Short description." }, image: state.media[0]?.path || "assets/images/room-balcony-sea.webp", alt: { tr: "Oda", en: "Room" } });
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
  if (target.dataset.removeRoom !== undefined) state.data.sections.find((section) => section.type === "rooms").items.splice(Number(target.dataset.removeRoom), 1);
  if (target.dataset.removeGallery !== undefined) state.data.sections.find((section) => section.type === "gallery").items.splice(Number(target.dataset.removeGallery), 1);
  if (target.dataset.moveRoom !== undefined) swap(state.data.sections.find((section) => section.type === "rooms").items, Number(target.dataset.moveRoom), Number(target.dataset.dir));
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
  if (!files?.length || uploads.some((item) => item.phase === "uploading" || item.phase === "queued")) return;
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
  const current = getValue(state.mediaPicker.path);
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
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
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
