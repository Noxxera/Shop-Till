/* ==================================================================
   ui.js
   All DOM rendering + presentation. No network here.
   ================================================================== */

/* ---------- product modal (owner) ---------- */
function openProductModal(id){
  if(currentRole!=="owner"){ toast("Owner access only"); return; }
  editingId = id || null;
  const p = id ? byId(id) : null;
  modalTitle.textContent = p ? "Edit product" : "Add product";
  mName.value=p?p.name:""; mCat.value=p?p.cat:""; mSup.value=p?(p.sup||""):"";
  mCost.value=p?(p.cost||""):""; mPrice.value=p?p.price:"";
  mStock.value=p?p.stock:""; mLow.value=p?p.low:"5"; mBarcode.value=p?(p.barcode||""):"";
  delBtn.style.display = p?"block":"none";
  modalBg.classList.add("show");
}
function closeModal(){ modalBg.classList.remove("show"); editingId=null; }

/* ---------- render products ---------- */
function renderProducts(){
  const q=(prodSearch.value||"").toLowerCase();
  const list=products.filter(p=>p.name.toLowerCase().includes(q)||p.cat.toLowerCase().includes(q));
  prodEmpty.style.display=products.length?"none":"block";
  prodGrid.innerHTML=list.map(p=>`
    <div class="pcard" onclick="openProductModal('${p.id}')">
      ${p.stock<=0?'<span class="lowtag">OUT</span>':p.stock<=p.low?'<span class="lowtag">LOW</span>':''}
      <div class="cat">${esc(p.cat)}</div><div class="name">${esc(p.name)}</div>
      <div class="price">${money(p.price)}</div><div class="stock">${p.stock} in stock</div>
    </div>`).join("");
}

/* ---------- sell grid ---------- */
function renderSell(){
  const q=(sellSearch.value||"").toLowerCase();
  const list=products.filter(p=>p.name.toLowerCase().includes(q)||p.cat.toLowerCase().includes(q)||(p.barcode||"").toLowerCase().includes(q));
  sellEmpty.style.display=products.length?"none":"block";
  sellGrid.innerHTML=list.map(p=>{
    const out=p.stock<=0;
    return `<div class="pcard ${out?'out':''}" ${out?'':`onclick="addToCart('${p.id}')"`}>
      ${out?'<span class="lowtag">OUT</span>':p.stock<=p.low?'<span class="lowtag">LOW</span>':''}
      <div class="cat">${esc(p.cat)}</div><div class="name">${esc(p.name)}</div>
      <div class="price">${money(p.price)}</div><div class="stock">${p.stock} left</div>
    </div>`;
  }).join("");
}

/* ---------- cart rendering ---------- */
function renderCart(){
  const ids=Object.keys(cart);
  if(!ids.length){
    cartItems.innerHTML='<div class="cart-empty">No items yet.<br>Tap a product to add it.</div>';
    cSub.textContent=money(0); cVat.textContent=money(0); cartTotal.textContent=money(0); checkoutBtn.disabled=true;
    cVatRow.style.display=settings.vat>0?"flex":"none"; return;
  }
  cartItems.innerHTML=ids.map(id=>{ const p=byId(id); const s=p.price*cart[id];
    return `<div class="citem"><div class="ci-name">${esc(p.name)}<small>${money(p.price)}</small></div>
      <div class="qty"><button onclick="setQty('${id}',-1)">−</button><span class="num">${cart[id]}</span><button onclick="setQty('${id}',1)">+</button></div>
      <div class="ci-sub">${money(s)}</div><button class="ci-x" onclick="delete cart['${id}'];renderCart()">×</button></div>`;
  }).join("");
  const c=cartCalc();
  cSub.textContent=money(c.sub); cVat.textContent=money(c.vat); cartTotal.textContent=money(c.total);
  cVatRow.style.display=settings.vat>0?"flex":"none"; checkoutBtn.disabled=false;
}

/* ---------- receipt ---------- */
function showReceipt(sale){
  const t=new Date(sale.ts);
  receipt.innerHTML=`<div style="font-family:monospace;max-width:320px;margin:0 auto;padding:16px;color:#000">
    <h2 style="text-align:center;margin:0 0 4px">${esc(settings.shop)}</h2>
    <div style="text-align:center;font-size:12px;margin-bottom:10px">${t.toLocaleString()}</div><hr>
    ${sale.lines.map(l=>`<div style="display:flex;justify-content:space-between;font-size:13px;margin:3px 0"><span>${esc(l.name)} x${l.qty}</span><span>${money(l.price*l.qty)}</span></div>`).join("")}<hr>
    <div style="display:flex;justify-content:space-between;font-size:13px"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    ${sale.discount>0?`<div style="display:flex;justify-content:space-between;font-size:13px"><span>Discount</span><span>-${money(sale.discount)}</span></div>`:""}
    ${sale.vat>0?`<div style="display:flex;justify-content:space-between;font-size:13px"><span>VAT</span><span>${money(sale.vat)}</span></div>`:""}
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;margin-top:6px"><span>TOTAL</span><span>${money(sale.total)}</span></div>
    ${sale.customer?`<div style="font-size:12px;margin-top:8px">Customer: ${esc(sale.customer)}</div>`:""}
    <div style="text-align:center;font-size:12px;margin-top:14px">Thank you!</div></div>`;
  window.print();
}

/* ---------- inventory ---------- */
function renderInventory(){
  const owner=currentRole==="owner";
  invCostHead.style.display=owner?"":"none"; invActHead.style.display=owner?"":"none";
  invEmpty.style.display=products.length?"none":"block";
  invBody.innerHTML=products.map(p=>{
    let cls="",pill='<span class="pill ok">OK</span>';
    if(p.stock<=0){cls="outrow";pill='<span class="pill no">OUT</span>';}
    else if(p.stock<=p.low){cls="low";pill='<span class="pill lo">LOW</span>';}
    return `<tr class="${cls}">
      <td><b>${esc(p.name)}</b><br><span style="color:var(--muted);font-size:12px">${esc(p.cat)}</span></td>
      ${owner?`<td class="num">${money(p.cost||0)}</td>`:""}
      <td class="num">${money(p.price)}</td><td class="num">${p.stock}</td><td>${pill}</td>
      ${owner?`<td class="row-actions"><button onclick="restock('${p.id}')">Restock</button><button onclick="openProductModal('${p.id}')">Edit</button></td>`:""}
    </tr>`;
  }).join("");
}

/* ---------- sales + refunds ---------- */
function renderSales(){
  const owner=currentRole==="owner";
  const list=[...pendingDisplays(), ...sales];
  salesEmpty.style.display=list.length?"none":"block";
  salesEmpty.textContent="No sales recorded yet.";
  salesLog.innerHTML=list.map(s=>{
    const t=new Date(s.ts);
    const when=t.toLocaleDateString()+" "+t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const tag = s.pending?'<span class="pill lo" style="margin-left:8px">PENDING SYNC</span>'
                        : (s.refunded?'<span class="pill ref">REFUNDED</span>':'');
    return `<div class="sale ${s.refunded?'refunded':''}">
      <div class="sale-head"><span class="when">${when}${s.customer?' · '+esc(s.customer):''}${tag}</span><span class="tot">${money(s.total)}</span></div>
      <div class="sale-lines">${s.lines.map(l=>`<div><span>${esc(l.name)} × ${l.qty}</span><span class="num">${money(l.price*l.qty)}</span></div>`).join("")}</div>
      <div class="sale-foot">
        <button onclick='reprintById("${s.client_id||s.id}")'>Receipt</button>
        ${(owner && !s.pending && !s.refunded)?`<button onclick="refund('${s.id}')">Refund</button>`:''}
      </div></div>`;
  }).join("");
}
function reprintById(key){
  const all=[...pendingDisplays(), ...sales];
  const s=all.find(x=>(x.client_id||x.id)===key); if(s) showReceipt(s);
}

/* ---------- reports (owner) ---------- */
function setPeriod(p){ reportPeriod=p; document.querySelectorAll("#periodSeg button").forEach(b=>b.classList.toggle("active",b.dataset.p===p)); renderReports(); }
function inPeriod(s){
  if(s.refunded) return false;
  const d=Date.now()-s.ts;
  if(reportPeriod==="today") return new Date(s.ts).toDateString()===todayKey();
  if(reportPeriod==="week") return d<=7*864e5;
  if(reportPeriod==="month") return d<=30*864e5;
  return true;
}
function renderReports(){
  const list=sales.filter(inPeriod);
  let rev=0,profit=0,items=0; const tally={};
  list.forEach(s=>{ rev+=s.total; s.lines.forEach(l=>{ profit+=(l.price-(l.cost||0))*l.qty; items+=l.qty; tally[l.name]=(tally[l.name]||0)+l.price*l.qty; }); });
  rRev.textContent=money(rev); rProfit.textContent=money(profit); rCount.textContent=list.length; rItems.textContent=items;
  const top=Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,6); const max=top.length?top[0][1]:1;
  bestSellers.innerHTML=top.length?top.map(([n,v])=>`<div class="bar-row"><span class="bn">${esc(n)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,v/max*100)}%"></div></div><span class="bar-val">${money(v)}</span></div>`).join(""):'<div style="color:var(--muted);font-size:13px">No sales in this period.</div>';
  const low=products.filter(p=>p.stock<=p.low);
  lowReport.innerHTML=low.length?low.map(p=>`<div class="bar-row"><span class="bn">${esc(p.name)}</span><span class="bar-val" style="color:${p.stock<=0?'var(--danger)':'var(--warn)'}">${p.stock} left</span></div>`).join(""):'<div style="color:var(--muted);font-size:13px">All stock levels healthy.</div>';
}

/* ---------- settings form + role/header presentation ---------- */
function fillSettings(){ setShop.value=settings.shop; setCur.value=settings.cur; setVat.value=settings.vat||""; }
function applySettings(){ shopName.textContent=settings.shop; if(window.lockShop) lockShop.textContent=settings.shop; }
function applyRole(){
  document.body.dataset.role=currentRole;
  roleBadge.textContent=currentRole==="owner"?"Owner":"Employee";
  roleBadge.classList.toggle("owner", currentRole==="owner");
  if(currentRole==="employee"){ const a=document.querySelector(".view.active"); if(a&&["view-products","view-reports","view-settings"].includes(a.id)) switchView("sell"); }
}
function updateSwitchBtn(){ switchBtn.style.display="block"; switchBtn.textContent="Sign out"; }
function renderHeader(){
  const tk=todayKey();
  const live=sales.filter(s=>new Date(s.ts).toDateString()===tk && !s.refunded);
  const pend=pendingDisplays().filter(s=>new Date(s.ts).toDateString()===tk);
  const all=[...live,...pend];
  todayTotal.textContent=money(all.reduce((a,s)=>a+s.total,0)); todayCount.textContent=all.length;
}
function fillCustList(){ custList.innerHTML=customers.map(c=>`<option value="${esc(c.name)}">`).join(""); }
