/* ==================================================================
   state.js
   Shared app state, localStorage helpers (cache/queue/settings) and tiny utils.
   ================================================================== */

/* ---- in-memory state (shared across all modules) ---- */
let settings = loadSettings();
let products = [];
let sales = [];
let customers = [];
let cart = {};
let editingId = null;
let currentUser = null;
let currentRole = "employee";
let reportPeriod = "today";

const money = n => settings.cur + " " + Math.round(n).toLocaleString();
const todayKey = () => new Date().toDateString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const byId = id => products.find(p=>p.id===id);

/* ---------- local storage helpers (cache, queue, settings) ---------- */
function lsGet(k,def){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch(e){ return def; } }
function lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function loadSettings(){ return lsGet("shoptill_settings", {shop:"ShopTill", cur:"KSh", vat:0}); }

/* ---- formatting + DOM-safety utils ---- */
function esc(s){ return (s||"").replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
let toastT;
function toast(m){ const t=document.getElementById("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2000); }
