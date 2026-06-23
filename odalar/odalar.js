const config = window.PASKA_SUPABASE_CONFIG || {};
const supabaseUrl = String(config.url || "").replace(/\/$/, "");
const anonKey = config.anonKey || "";
const documentId = config.documentId || "paska-main";

const state = { lang: "tr", rooms: [], site: {} };
const $ = (selector, root = document) => root.querySelector(selector);

const copy = {
  tr: {
    experience: "Deneyim",
    rooms: "Odalar",
    gallery: "Galeri",
    contact: "Iletisim",
    eyebrow: "Paska Otel Foca",
    title: "Size uygun odayi kesfedin.",
    intro: "Foca'nin sakin ritmine acilan odalarimizi, detaylarini ve fotograflarini inceleyin.",
    guests: "misafir",
    previous: "Onceki gorsel",
    next: "Sonraki gorsel",
    close: "Oda detayini kapat",
  },
  en: {
    experience: "Experience",
    rooms: "Rooms",
    gallery: "Gallery",
    contact: "Contact",
    eyebrow: "Paska Hotel Foca",
    title: "Find the room that feels right.",
    intro: "Explore rooms opening onto Foca's slower rhythm, with full details and photography.",
    guests: "guests",
    previous: "Previous image",
    next: "Next image",
    close: "Close room detail",
  },
};

function t(value) {
  if (typeof value === "string") return value;
  return value?.[state.lang] || value?.tr || value?.en || "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function request(path) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!response.ok) throw new Error("Supabase request failed");
  return response.json();
}

function roomCover(room) {
  return room.cover_image_url || room.images?.find((image) => image.is_cover)?.image_url || room.images?.[0]?.image_url || "";
}

function detailText(room) {
  const details = room.details || {};
  return [
    details.guests ? `${details.guests} ${copy[state.lang].guests}` : "",
    details.beds || "",
    details.bath || "",
  ].filter(Boolean).join(" · ");
}

function renderBrand() {
  const brand = state.site.brand || {};
  const markup = brand.logo
    ? `<img class="brand__logo" src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name || "Paska Otel")}">`
    : `<span>${escapeHtml(brand.name || "Paska")}</span><small>${escapeHtml(brand.location || "Otel Foca")}</small>`;
  $("[data-rooms-brand]").innerHTML = markup;
  const loaderBrand = $("[data-rooms-loader-brand]");
  loaderBrand.innerHTML = brand.logo ? `<img src="${escapeHtml(brand.logo)}" alt="">` : "";
}

function roomCard(room) {
  return `
    <article class="rooms-list-card">
      <button type="button" data-open-room="${escapeHtml(room.slug)}">
        <div class="rooms-list-card__image">
          <img src="${escapeHtml(roomCover(room))}" alt="${escapeHtml(t(room.title))}" loading="lazy" decoding="async">
        </div>
        <div class="rooms-list-card__copy">
          <h2>${escapeHtml(t(room.title))}</h2>
          <p>${escapeHtml(t(room.location_label) || "Paska Otel Foca")}</p>
          <span>${escapeHtml(t(room.short_description))}</span>
        </div>
      </button>
    </article>`;
}

function roomDetail(room) {
  const images = room.images?.length ? room.images : [{ image_url: roomCover(room), alt: room.title }];
  const amenities = Array.isArray(room.amenities) ? room.amenities : [];
  const contact = state.site.sections?.find((section) => section.type === "contact")?.content || {};
  return `
    <div class="room-detail" data-room-detail="${escapeHtml(room.slug)}" hidden>
      <div class="room-detail__backdrop" data-close-room></div>
      <article class="room-detail__panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(t(room.title))}">
        <button class="room-detail__close" type="button" data-close-room aria-label="${copy[state.lang].close}">×</button>
        <div class="room-detail__slider">
          <button class="room-detail__arrow room-detail__arrow--prev" type="button" data-room-slide="${escapeHtml(room.slug)}" data-dir="-1" aria-label="${copy[state.lang].previous}">‹</button>
          <div class="room-detail__track" data-room-slider-track>
            ${images.map((image, index) => `<figure class="room-detail__slide"><img class="is-loaded" src="${escapeHtml(image.image_url)}" alt="${escapeHtml(t(image.alt) || t(room.title))}"><figcaption>${index + 1} / ${images.length}</figcaption></figure>`).join("")}
          </div>
          <button class="room-detail__arrow room-detail__arrow--next" type="button" data-room-slide="${escapeHtml(room.slug)}" data-dir="1" aria-label="${copy[state.lang].next}">›</button>
        </div>
        <div class="room-detail__content">
          <div><p class="eyebrow">${escapeHtml(t(room.location_label) || "Paska Otel Foca")}</p><h2>${escapeHtml(t(room.title))}</h2><p class="room-detail__summary">${escapeHtml(t(room.description) || t(room.short_description))}</p></div>
          ${detailText(room) ? `<div class="room-detail__facts"><span>${escapeHtml(detailText(room))}</span></div>` : ""}
          ${amenities.length ? `<div class="room-detail__amenities">${amenities.map((item) => `<span>${escapeHtml(t(item))}</span>`).join("")}</div>` : ""}
          <div class="room-detail__actions"><a class="button button--dark" href="${escapeHtml(contact.whatsapp || "/#contact")}" target="_blank" rel="noreferrer">WhatsApp</a><a class="button button--muted" href="/#contact">${copy[state.lang].contact}</a></div>
        </div>
      </article>
    </div>`;
}

function render() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = copy[state.lang][node.dataset.i18n] || node.textContent; });
  $("[data-rooms-lang]").textContent = state.lang === "tr" ? "EN" : "TR";
  renderBrand();
  $("[data-rooms-list]").innerHTML = state.rooms.map(roomCard).join("");
  $("[data-rooms-details]").innerHTML = state.rooms.map(roomDetail).join("");
  const footer = state.site.footer || {};
  $("[data-rooms-footer]").innerHTML = `<p>${escapeHtml(footer.left || "Paska Otel")}</p><p>${escapeHtml(footer.right || "Foca, Izmir")}</p>`;
}

async function load() {
  try {
    const [documents, rooms, images] = await Promise.all([
      request(`/rest/v1/site_documents?id=eq.${encodeURIComponent(documentId)}&select=content`),
      request("/rest/v1/rooms?select=*&status=eq.published&order=sort_order.asc,created_at.asc"),
      request("/rest/v1/room_images?select=*&order=sort_order.asc,created_at.asc"),
    ]);
    state.site = documents?.[0]?.content || {};
    state.rooms = (rooms || []).map((room) => ({ ...room, images: (images || []).filter((image) => image.room_id === room.id) }));
  } catch {
    state.site = await fetch("/data/site-content.json", { cache: "no-store" }).then((response) => response.json()).catch(() => ({}));
    const section = state.site.sections?.find((item) => item.type === "rooms");
    state.rooms = (section?.items || []).map((item, index) => ({ id: `fallback-${index}`, slug: `oda-${index + 1}`, title: item.name, short_description: item.desc, description: item.desc, cover_image_url: item.image, images: [{ image_url: item.image, alt: item.alt }], amenities: [] }));
  }
  render();
  const loader = $("[data-rooms-loader]");
  window.setTimeout(() => loader.classList.add("is-hidden"), 350);
}

document.addEventListener("click", (event) => {
  const lang = event.target.closest("[data-rooms-lang]");
  if (lang) { state.lang = state.lang === "tr" ? "en" : "tr"; render(); return; }
  const open = event.target.closest("[data-open-room]");
  if (open) { const detail = $(`[data-room-detail="${CSS.escape(open.dataset.openRoom)}"]`); if (detail) { detail.hidden = false; document.body.classList.add("room-detail-open"); } return; }
  const close = event.target.closest("[data-close-room]");
  if (close) { document.querySelectorAll("[data-room-detail]").forEach((detail) => { detail.hidden = true; }); document.body.classList.remove("room-detail-open"); return; }
  const slide = event.target.closest("[data-room-slide]");
  if (slide) { const track = $(`[data-room-detail="${CSS.escape(slide.dataset.roomSlide)}"] [data-room-slider-track]`); track?.scrollBy({ left: Number(slide.dataset.dir) * track.clientWidth, behavior: "smooth" }); }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { document.querySelectorAll("[data-room-detail]").forEach((detail) => { detail.hidden = true; }); document.body.classList.remove("room-detail-open"); }
});

load();
