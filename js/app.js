/* ==================================================================
   app.js
   Orchestration: navigation, settings save, exports, boot + event wiring.
   ================================================================== */

/* ---------- boot after login ---------- */
async function boot(){
  loginScreen.classList.remove("show");
  await loadRole();
  applySettings(); applyRole(); updateSwitchBtn();
  await loadProducts();
  await loadCustomers();
  await loadSales();
  renderSell(); renderCart(); renderProducts(); fillCustList();
  updatePending();
  await flushQueue();        // push any sales saved offline last time
  switchView("sell");
}

/* ---------- nav ---------- */
function switchView(v){
  if(currentRole==="employee" && ["products","reports","settings"].includes(v)){ toast("Owner access only"); return; }
  document.querySelectorAll(".view").forEach(s=>s.classList.remove("active"));
  document.getElementById("view-"+v).classList.add("active");
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active", b.dataset.view===v));
  if(v==="inventory") renderInventory();
  if(v==="sales") renderSales();
  if(v==="products") renderProducts();
  if(v==="reports") renderReports();
  if(v==="settings") fillSettings();
}

/* ---------- settings (local) ---------- */
function saveSettings(){
  settings.shop=setShop.value.trim()||"ShopTill"; settings.cur=setCur.value.trim()||"KSh"; settings.vat=parseFloat(setVat.value)||0;
  lsSet("shoptill_settings", settings); applySettings(); renderSell(); renderCart(); renderInventory(); renderSales(); toast("Settings saved");
}

/* ---------- backup / CSV ---------- */
function exportData(){
  const blob=new Blob([JSON.stringify({settings,products,sales,customers,exported:Date.now()},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="shoptill-backup-"+new Date().toISOString().slice(0,10)+".json"; a.click(); toast("Backup downloaded");
}
function importData(e){ toast("Data now lives in Supabase — backup/import not needed here"); e.target.value=""; }
function csvCell(v){ v=(v==null?"":String(v)); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
function downloadCSV(name, rows){ const csv="\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n"); const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); }
function exportProductsCSV(){
  if(!products.length){ toast("No products"); return; }
  const rows=[["Name","Category","Supplier","Cost","Price","Stock","Low alert","Barcode"]];
  products.forEach(p=>rows.push([p.name,p.cat,p.sup||"",p.cost||0,p.price,p.stock,p.low,p.barcode||""]));
  downloadCSV("products-"+new Date().toISOString().slice(0,10)+".csv", rows); toast("Products exported");
}
function exportSalesCSV(){
  if(!sales.length){ toast("No sales"); return; }
  const rows=[["Date","Time","Item","Qty","Unit price","Line total","Sale total","Customer","Refunded"]];
  sales.slice().reverse().forEach(s=>{ const d=new Date(s.ts); s.lines.forEach(l=>rows.push([d.toLocaleDateString(),d.toLocaleTimeString(),l.name,l.qty,l.price,l.price*l.qty,s.total,s.customer||"",s.refunded?"YES":""])); });
  downloadCSV("sales-"+new Date().toISOString().slice(0,10)+".csv", rows); toast("Sales exported");
}

/* ---------- listeners ---------- */
checkoutBtn.onclick=checkout;
prodSearch.oninput=renderProducts;
sellSearch.oninput=renderSell;
sellSearch.addEventListener("keydown",e=>{ if(e.key==="Enter"){ const code=sellSearch.value.trim(); const p=products.find(x=>(x.barcode||"")===code); if(p&&p.stock>0){ addToCart(p.id); sellSearch.value=""; renderSell(); } } });
loginPass.addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
document.querySelectorAll("#periodSeg button").forEach(b=>b.onclick=()=>setPeriod(b.dataset.p));
modalBg.onclick=e=>{ if(e.target===modalBg) closeModal(); };
window.addEventListener("online", ()=>{ toast("Back online — syncing…"); flushQueue(); });
window.addEventListener("offline", ()=>{ toast("Offline — sales will be saved & synced later"); });

/* ---------- init ---------- */
(async function(){
  applySettings();
  const {data:{session}} = await sb.auth.getSession();
  if(session){ await boot(); } else { loginScreen.classList.add("show"); }
})();
