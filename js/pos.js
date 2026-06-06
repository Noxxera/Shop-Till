/* ==================================================================
   pos.js
   Point-of-sale: cart maths, checkout, and the offline sales queue + sync.
   ================================================================== */

/* ---------- cart ---------- */
function addToCart(id){ const p=byId(id); const n=cart[id]||0; if(n>=p.stock){ toast("No more stock"); return; } cart[id]=n+1; renderCart(); }
function setQty(id,d){ const p=byId(id); let q=(cart[id]||0)+d; if(q<=0) delete cart[id]; else if(q>p.stock){ toast("No more stock"); return; } else cart[id]=q; renderCart(); }
function clearCart(){ cart={}; cDisc.value=0; renderCart(); }
function cartCalc(){
  let sub=0; Object.keys(cart).forEach(id=>{ const p=byId(id); sub+=p.price*cart[id]; });
  const disc=Math.min(parseFloat(cDisc.value)||0, sub);
  const vat=settings.vat>0 ? (sub-disc)*(settings.vat/100) : 0;
  return {sub, disc, vat, total:sub-disc+vat};
}

/* ---------- checkout (online + offline queue) ---------- */
async function checkout(){
  const ids=Object.keys(cart); if(!ids.length) return;
  const c=cartCalc();
  const client_id=uid();
  const items=ids.map(id=>({product_id:id, qty:cart[id]}));
  const lines=ids.map(id=>{ const p=byId(id); return {name:p.name, qty:cart[id], price:p.price, cost:p.cost||0}; });
  const custName=custInput.value.trim();
  const display={client_id, ts:Date.now(), customer:custName, subtotal:c.sub, discount:c.disc, vat:c.vat, total:c.total, lines, refunded:false};
  const payload={p_client_id:client_id, p_customer:custName, p_discount:c.disc, p_vat_rate:settings.vat, p_items:items};

  // clear cart + optimistic local stock drop + receipt immediately (never make the till wait)
  cart={}; cDisc.value=0; custInput.value=""; renderCart();
  lines.forEach(l=>{ const p=products.find(x=>x.name===l.name); if(p) p.stock-=l.qty; });
  renderSell();
  showReceipt(display);

  if(navigator.onLine){
    const {error}=await sb.rpc("record_sale", payload);
    if(error){ enqueue(payload, display); toast("Saved offline — will sync"); }
    else {
      if(custName && !customers.find(c2=>c2.name.toLowerCase()===custName.toLowerCase())) await sb.from("customers").insert({name:custName});
      toast("Sale recorded · "+money(c.total)); await afterSaleRefresh();
    }
  } else {
    enqueue(payload, display); toast("Offline — sale saved, will sync");
  }
  renderHeader();
}
function enqueue(payload, display){ const q=lsGet("shoptill_queue",[]); q.push({payload, display}); lsSet("shoptill_queue",q); updatePending(); renderSales(); }
async function flushQueue(){
  if(!navigator.onLine) return;
  let q=lsGet("shoptill_queue",[]); if(!q.length) return;
  let ok=0;
  for(const entry of q.slice()){
    const {error}=await sb.rpc("record_sale", entry.payload);
    if(error) break;                 // stop (network/stock); try again later
    ok++; q=q.filter(e=>e.payload.p_client_id!==entry.payload.p_client_id); lsSet("shoptill_queue",q);
  }
  updatePending();
  if(ok){ toast("Synced "+ok+" offline sale"+(ok>1?"s":"")); await afterSaleRefresh(); }
}
function pendingDisplays(){ return lsGet("shoptill_queue",[]).map(e=>({...e.display, pending:true})); }
function updatePending(){
  const n=lsGet("shoptill_queue",[]).length;
  pendingTag.style.display = n?"inline-block":"none";
  pendingTag.textContent = n+" to sync";
}
