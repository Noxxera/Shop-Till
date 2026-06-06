/* ==================================================================
   api.js
   Every Supabase call lives here: auth, data loads, product CRUD, RPCs.
   ================================================================== */

/* ---------- auth ---------- */
async function doLogin(){
  const email=loginEmail.value.trim(), pass=loginPass.value;
  if(!email||!pass){ loginMsg.textContent="Enter email and password"; return; }
  loginMsg.textContent="Signing in…"; loginBtn.disabled=true;
  const {error}=await sb.auth.signInWithPassword({email, password:pass});
  loginBtn.disabled=false;
  if(error){ loginMsg.textContent=error.message||"Login failed"; return; }
  loginMsg.textContent=""; loginPass.value="";
  await boot();
}
async function lockNow(){ await sb.auth.signOut(); location.reload(); }

async function loadRole(){
  const {data:{user}} = await sb.auth.getUser();
  currentUser=user;
  const {data} = await sb.from("profiles").select("role,name").eq("id",user.id).single();
  currentRole = (data && data.role) || "employee";
}

/* ---------- data loads ---------- */
function mapProduct(r){
  return {id:r.id, name:r.name, cat:r.category||"General", sup:r.supplier||"",
    cost:(r.cost_price!=null?+r.cost_price:undefined), price:+r.sell_price,
    stock:r.stock, low:r.low_alert, barcode:r.barcode||""};
}
async function loadProducts(){
  const table = currentRole==="owner" ? "products" : "products_sale";
  const {data,error} = await sb.from(table).select("*").order("name");
  if(error){ products = lsGet("shoptill_products_cache", []); toast("Offline — showing saved products"); }
  else { products = (data||[]).map(mapProduct); lsSet("shoptill_products_cache", products); }
  renderSell(); renderProducts(); renderInventory();
}
async function loadCustomers(){
  const {data} = await sb.from("customers").select("id,name").order("name");
  customers = data || [];
  fillCustList();
}
async function loadSales(){
  const cols = currentRole==="owner"
    ? "id,client_id,customer,subtotal,discount,vat,total,refunded,created_at, sale_items(name,qty,unit_price,unit_cost)"
    : "id,client_id,customer,subtotal,discount,vat,total,refunded,created_at, sale_items(name,qty,unit_price)";
  const {data,error} = await sb.from("sales").select(cols).order("created_at",{ascending:false});
  if(error){ sales=[]; }
  else {
    sales=(data||[]).map(s=>({
      id:s.id, client_id:s.client_id, ts:new Date(s.created_at).getTime(),
      customer:s.customer, subtotal:+s.subtotal, discount:+s.discount, vat:+s.vat,
      total:+s.total, refunded:s.refunded,
      lines:(s.sale_items||[]).map(l=>({name:l.name, qty:l.qty, price:+l.unit_price, cost:l.unit_cost!=null?+l.unit_cost:0}))
    }));
  }
  renderHeader(); renderSales();
}
async function afterSaleRefresh(){
  await loadProducts(); await loadSales(); await loadCustomers();
  renderHeader();
}

/* ---------- product create / update / delete (owner) ---------- */
async function saveProduct(){
  if(currentRole!=="owner") return;
  const name=mName.value.trim();
  if(!name){ toast("Enter a name"); return; }
  const row={name, category:mCat.value.trim()||"General", supplier:mSup.value.trim(),
    cost_price:parseFloat(mCost.value)||0, sell_price:parseFloat(mPrice.value)||0,
    stock:parseInt(mStock.value)||0, low_alert:parseInt(mLow.value)||0, barcode:mBarcode.value.trim()};
  let error;
  if(editingId){ ({error}=await sb.from("products").update(row).eq("id",editingId)); }
  else { ({error}=await sb.from("products").insert(row)); }
  if(error){ toast(error.message||"Save failed"); return; }
  toast(editingId?"Updated":"Product added");
  closeModal(); await loadProducts();
}
async function deleteProduct(id){
  if(currentRole!=="owner"||!id||!confirm("Delete this product?")) return;
  const {error}=await sb.from("products").delete().eq("id",id);
  if(error){ toast(error.message||"Delete failed"); return; }
  delete cart[id]; closeModal(); await loadProducts(); renderCart(); toast("Deleted");
}

/* ---------- stock + refunds via secure RPCs (owner) ---------- */
async function restock(id){
  if(currentRole!=="owner") return;
  const p=byId(id);
  const n=prompt("Add stock for "+p.name+" (current: "+p.stock+")","");
  const add=parseInt(n); if(isNaN(add)) return;
  const {error}=await sb.rpc("restock",{p_product_id:id, p_qty:add});
  if(error){ toast(error.message||"Failed"); return; }
  await loadProducts(); toast("Stock updated");
}
async function refund(id){
  if(currentRole!=="owner") return;
  if(!confirm("Refund this sale? Stock will be restored.")) return;
  const {error}=await sb.rpc("refund_sale",{p_sale_id:id});
  if(error){ toast(error.message||"Failed"); return; }
  await afterSaleRefresh(); toast("Sale refunded");
}
