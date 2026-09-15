let products = [];
let users = [];
let orders = [];
let admins = []; // [{username, password}] added by the site owner
let settings = {
  ip: 'play.arvon.mc',
  whatsapp: '989918180709',
  tagline: 'شبکه‌ی بدواز و پرکتیس — سکه اختصاصی VON برای خرید آیتم و امکانات داخل سرور',
};
let session = null; // {username}
let isAdmin = false;
let isOwner = false;
let currentAdminName = '';
let activeCat = 'all';
let authMode = 'register';
let pendingBuyProduct = null;

/* in-site chat state */
let chats = {}; // { threadId: { name, messages:[{from:'user'|'admin', text, time, seenByAdmin, seenByUser}] } }
let myThreadId = null;
let myThreadName = null;
let chatPollTimer = null;
let activeAdminThread = null;

const seedProducts = [
  {id:'p7', category:'coin', name:'100 VON', price:20000, image:''},
  {id:'p8', category:'coin', name:'500 VON', price:90000, image:''},
  {id:'p9', category:'coin', name:'1200 VON', price:200000, image:''},
  {id:'p10', category:'coin', name:'3000 VON', price:450000, image:''},
];

const catIcon = {coin:'🪙'};
const catLabel = {coin:'VON'};

/* ---------------- BACKGROUND FX ---------------- */
function buildStarfield(){
  const el = document.getElementById('stars');
  let html = '';
  for(let i=0;i<70;i++){
    const top = Math.random()*100, left = Math.random()*100;
    const delay = (Math.random()*3.5).toFixed(2);
    const size = (Math.random()*1.6+1).toFixed(1);
    html += `<div class="star" style="top:${top}%; left:${left}%; animation-delay:${delay}s; width:${size}px; height:${size}px;"></div>`;
  }
  const blockColors = ['rgba(38,224,255,.5)','rgba(255,63,208,.5)','rgba(255,207,77,.5)','rgba(155,77,255,.5)'];
  for(let i=0;i<8;i++){
    const top = Math.random()*90, left = Math.random()*95;
    const size = (Math.random()*22+14).toFixed(0);
    const dur = (Math.random()*8+10).toFixed(1);
    const color = blockColors[i % blockColors.length];
    html += `<div class="float-block" style="top:${top}%; left:${left}%; width:${size}px; height:${size}px; background:${color}; animation-duration:${dur}s;"></div>`;
  }
  el.innerHTML = html;
}

function uid(){ return 'p' + Date.now() + Math.floor(Math.random()*1000); }

let apiToken = localStorage.getItem('arvon_api_token') || '';
async function apiFetch(path, options={}){ const headers=Object.assign({'Content-Type':'application/json'}, options.headers||{}); if(apiToken) headers.Authorization='Bearer '+apiToken; const r=await fetch('/api'+path,{...options,headers}); let d={}; try{d=await r.json()}catch(e){} if(!r.ok) throw new Error(d.error||'خطا در ارتباط با سرور'); return d; }
function saveToken(t){ apiToken=t||''; if(t)localStorage.setItem('arvon_api_token',t); else localStorage.removeItem('arvon_api_token'); }
async function storageGet(key,shared){
 try{ if(key==='products') return (await apiFetch('/public/products')).products; if(key==='settings') return (await apiFetch('/public/settings')).settings; if(key==='orders') return (await apiFetch('/admin/orders')).orders; if(key==='admins') return (await apiFetch('/admin/admins')).admins; if(key==='chats') return (await apiFetch('/admin/chats')).chats; if(key==='session') return apiToken?(await apiFetch('/auth/me')):null; return null; }catch(e){return null}
}
async function storageSet(key,value,shared){ try{ if(key==='products')await apiFetch('/admin/products',{method:'PUT',body:JSON.stringify({products:value})}); else if(key==='settings')await apiFetch('/admin/settings',{method:'PUT',body:JSON.stringify(value)}); else if(key==='orders')await apiFetch('/admin/orders',{method:'PUT',body:JSON.stringify({orders:value})}); }catch(e){console.error(e)} }

async function init(){
 buildStarfield();
 try{products=(await apiFetch('/public/products')).products||seedProducts; settings=Object.assign(settings,(await apiFetch('/public/settings')).settings||{});}catch(e){products=seedProducts;}
 products=products.filter(p=>p.category==='coin'); if(!products.length)products=seedProducts; applySettingsToUI();
 if(apiToken){try{session=await apiFetch('/auth/me'); isAdmin=['admin','owner'].includes(session.role); isOwner=session.role==='owner'; currentAdminName=session.username; if(isAdmin)setAdminUi();}catch(e){saveToken('');session=null}}
 if(session){myThreadId='u_'+session.username;myThreadName=session.username}
 refreshAuthUI();renderProducts();setupChatGateIfKnown();
 if(myThreadId) loadMyThread();
 setInterval(()=>{if(myThreadId)loadMyThread()},4000);
}
/* ---------------- PRODUCTS ---------------- */
function renderProducts(){
  const grid = document.getElementById('productGrid');
  const list = products;
  document.getElementById('productCount').textContent = products.length;

  if(list.length === 0){
    grid.innerHTML = '<div class="empty-state">هنوز آیتمی توی این دسته اضافه نشده.</div>';
    return;
  }

  grid.innerHTML = list.map(p => `
    <div class="card" data-cat="${p.category}">
      <span class="rib ${p.category}">${catLabel[p.category]}</span>
      <div class="thumb">${p.image ? `<img src="${p.image}" alt="${p.name}">` : catIcon[p.category]}</div>
      <h3>${p.name}</h3>
      <div class="price">${Number(p.price).toLocaleString('fa-IR')} تومان</div>
      <div class="card-actions">
        <button class="btn btn-glow btn-sm" onclick="openBuy('${p.id}')">خرید</button>
      </div>
      <div class="card-actions admin-row">
        <button class="btn btn-ghost btn-sm" onclick="openProductForm('${p.id}')">ویرایش</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">حذف</button>
      </div>
    </div>
  `).join('');
}

/* ---------------- BUY FLOW ---------------- */
function openBuy(id){
  pendingBuyProduct = products.find(p => p.id === id);
  if(!pendingBuyProduct) return;
  document.getElementById('buyPreview').innerHTML = `
    <div class="thumb">${pendingBuyProduct.image ? `<img src="${pendingBuyProduct.image}">` : catIcon[pendingBuyProduct.category]}</div>
    <div>
      <div style="font-weight:700;">${pendingBuyProduct.name}</div>
      <div style="color:var(--gold); font-size:.9rem;">${Number(pendingBuyProduct.price).toLocaleString('fa-IR')} تومان</div>
    </div>
  `;
  document.getElementById('buyIgn').value = '';
  openModal('buyOverlay');
}

async function submitOrder(){const ign=document.getElementById('buyIgn').value.trim();if(!ign){alert('نام کاربریت داخل سرور رو بنویس');return}const p=pendingBuyProduct;if(!p)return;try{await apiFetch('/orders',{method:'POST',body:JSON.stringify({itemName:p.name,price:p.price,ign,buyer:session?session.username:null})});closeModal('buyOverlay');showToast('سفارش ثبت شد ✔ برو تو چت پیگیریش کن');if(!myThreadId){myThreadId='g_'+Date.now()+Math.floor(Math.random()*999);myThreadName=ign}await apiFetch('/chats/'+encodeURIComponent(myThreadId),{method:'POST',body:JSON.stringify({name:myThreadName,text:`سلام! میخوام آیتم "${p.name}" (${Number(p.price).toLocaleString('fa-IR')} تومان) رو بخرم. نام کاربری من داخل سرور: ${ign}`})});openChatDirect()}catch(e){alert(e.message)}}
function copyIP(){
  navigator.clipboard.writeText(settings.ip);
  showToast('IP کپی شد ✔');
}

function formatPhoneDisplay(num){
  return '+' + num;
}

/* ---------------- IN-SITE CALL BUTTON ---------------- */
function callNow(){
  const num = (settings.whatsapp || '').replace(/\D/g,'');
  if(!num){ showToast('شماره تماس هنوز تنظیم نشده'); return; }
  window.location.href = 'tel:+' + num;
}

/* ---------------- IN-SITE CHAT (USER SIDE) ---------------- */
function setupChatGateIfKnown(){if(myThreadId&&myThreadName){document.getElementById('chatGate').style.display='none';document.getElementById('chatBody').style.display='flex';document.getElementById('chatFoot').style.display='flex'}updateChatBadge()}
async function startChat(){const name=document.getElementById('chatGateName').value.trim();if(!name){alert('اول اسمت رو بنویس');return}myThreadId=session?'u_'+session.username:'g_'+Date.now()+Math.floor(Math.random()*999);myThreadName=session?session.username:name;await apiFetch('/chats/'+encodeURIComponent(myThreadId),{method:'POST',body:JSON.stringify({name:myThreadName})});setupChatGateIfKnown();renderChatMessages()}
function toggleChat(){const p=document.getElementById('chatPanel'),opening=!p.classList.contains('show');p.classList.toggle('show');if(opening){loadMyThread();markThreadSeen('user');chatPollTimer=setInterval(loadMyThread,4000)}else clearInterval(chatPollTimer)}
function openChatDirect(){const p=document.getElementById('chatPanel');if(!p.classList.contains('show'))toggleChat()}
async function loadMyThread(){if(!myThreadId)return;try{const r=await apiFetch('/chats/'+encodeURIComponent(myThreadId));if(r.thread){chats[myThreadId]=r.thread;renderChatMessages();updateChatBadge()}}catch(e){}}
function renderChatMessages(){if(!myThreadId)return;const t=chats[myThreadId],body=document.getElementById('chatBody');if(!t||!t.messages.length){body.innerHTML='<div class="chat-empty">سلام '+escapeHtml(myThreadName||'')+'! سوالت رو بپرس، تیم پشتیبانی همینجا جوابتو میده 👋</div>';return}body.innerHTML=t.messages.map(m=>`<div class="bubble ${m.from==='user'?'me':'them'}">${escapeHtml(m.text)}<span class="time">${new Date(m.time).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</span></div>`).join('');body.scrollTop=body.scrollHeight}
async function sendChatMessage(){const input=document.getElementById('chatInput'),text=input.value.trim();if(!text||!myThreadId)return;input.value='';try{const r=await apiFetch('/chats/'+encodeURIComponent(myThreadId),{method:'POST',body:JSON.stringify({name:myThreadName,text})});chats[myThreadId]=r.thread;renderChatMessages()}catch(e){showToast(e.message)}}
async function markThreadSeen(who){if(!myThreadId)return;try{const r=await apiFetch('/chats/'+encodeURIComponent(myThreadId)+'/seen',{method:'PATCH',body:JSON.stringify({who})});if(r.thread)chats[myThreadId]=r.thread}catch(e){}updateChatBadge()}
function updateChatBadge(){const b=document.getElementById('chatBadge');if(!b)return;const t=chats[myThreadId],n=t?t.messages.filter(m=>m.from==='admin'&&!m.seenByUser).length:0;b.textContent=n;b.classList.toggle('show',n>0)}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------- IN-SITE CHAT (ADMIN SIDE) ---------------- */
async function openAdminInbox(){try{chats=(await apiFetch('/admin/chats')).chats||{};renderAdminInbox();openModal('inboxOverlay')}catch(e){showToast(e.message)}}
function renderAdminInbox(){const list=document.getElementById('adminInboxList'),ids=Object.keys(chats);if(!ids.length){list.innerHTML='<div class="empty-state">هنوز کسی پیام نداده.</div>';return}list.innerHTML=ids.map(id=>{const t=chats[id],last=t.messages.at(-1),unread=t.messages.some(m=>m.from==='user'&&!m.seenByAdmin);return `<div class="inbox-item ${unread?'unread':''}" onclick="openAdminThread('${encodeURIComponent(id)}')"><div><div class="nm">${escapeHtml(t.name||id)}</div><div class="prev">${last?escapeHtml(last.text):''}</div></div><span class="dot"></span></div>`}).join('')}
async function openAdminThread(enc){const id=decodeURIComponent(enc);activeAdminThread=id;try{const r=await apiFetch('/chats/'+encodeURIComponent(id));chats[id]=r.thread;document.getElementById('adminThreadName').textContent='گفتگو با '+(chats[id].name||id);renderAdminThreadBody();await markAdminSeen(id);closeModal('inboxOverlay');openModal('adminThreadOverlay')}catch(e){showToast(e.message)}}
async function markAdminSeen(id){try{const r=await apiFetch('/chats/'+encodeURIComponent(id)+'/seen',{method:'PATCH',body:JSON.stringify({who:'admin'})});if(r.thread)chats[id]=r.thread}catch(e){}}
function renderAdminThreadBody(){const body=document.getElementById('adminThreadBody'),t=chats[activeAdminThread];if(!t)return;body.innerHTML=t.messages.map(m=>`<div class="bubble ${m.from==='admin'?'me':'them'}">${escapeHtml(m.text)}<span class="time">${new Date(m.time).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</span></div>`).join('');body.scrollTop=body.scrollHeight}
async function sendAdminReply(){const input=document.getElementById('adminReplyInput'),text=input.value.trim();if(!text||!activeAdminThread)return;input.value='';try{const r=await apiFetch('/chats/'+encodeURIComponent(activeAdminThread),{method:'POST',body:JSON.stringify({text})});chats[activeAdminThread]=r.thread;renderAdminThreadBody()}catch(e){showToast(e.message)}}

/* ---------------- SITE SETTINGS (ADMIN) ---------------- */
function openSettings(){
  document.getElementById('stIp').value = settings.ip;
  document.getElementById('stWhatsapp').value = settings.whatsapp;
  document.getElementById('stTagline').value = settings.tagline;
  document.getElementById('stAdminPass').value = '';
  document.getElementById('settingsMsg').className = 'msg';
  openModal('settingsOverlay');
}
async function saveSettings(){if(!isOwner)return;const ip=document.getElementById('stIp').value.trim(),whatsapp=document.getElementById('stWhatsapp').value.trim(),tagline=document.getElementById('stTagline').value.trim(),newPass=document.getElementById('stAdminPass').value.trim(),el=document.getElementById('settingsMsg');if(!ip||!whatsapp){el.textContent='حداقل IP و شماره تماس رو پر کن';el.className='msg show error';return}if(!/^\d+$/.test(whatsapp)){el.textContent='شماره تماس فقط باید عدد باشه';el.className='msg show error';return}try{settings=(await apiFetch('/admin/settings',{method:'PUT',body:JSON.stringify({ip,whatsapp,tagline,newPassword:newPass})})).settings;applySettingsToUI();showToast('تنظیمات ذخیره شد ✔');closeModal('settingsOverlay')}catch(e){el.textContent=e.message;el.className='msg show error'}}

/* ---------------- ORDERS (ADMIN) ---------------- */
async function openOrders(){try{orders=(await apiFetch('/admin/orders')).orders||[]}catch(e){showToast(e.message);orders=[]}renderOrders();openModal('ordersOverlay')}
function renderOrders(){const list=document.getElementById('ordersList');if(!orders.length){list.innerHTML='<div class="empty-state" style="border-radius:12px;">هنوز سفارشی ثبت نشده.</div>';return}list.innerHTML=orders.map(o=>`<div class="order-card ${o.status==='done'?'done':''}"><div class="info"><div>پکیج: <b>${escapeHtml(o.itemName)}</b> — ${Number(o.price).toLocaleString('fa-IR')} تومان</div><div>نام داخل سرور: <span class="ign">${escapeHtml(o.ign)}</span></div><span class="time">${new Date(o.time).toLocaleString('fa-IR')}</span></div><div><span class="status ${o.status}">${o.status==='done'?'زده شد':'در انتظار'}</span><div class="order-actions"><button class="btn btn-glow btn-sm" onclick="toggleOrderStatus('${o.id}')">تغییر وضعیت</button><button class="btn btn-danger btn-sm" onclick="deleteOrder('${o.id}')">حذف</button></div></div></div>`).join('')}
async function toggleOrderStatus(id){try{orders=(await apiFetch('/admin/orders/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({})})).orders;renderOrders()}catch(e){showToast(e.message)}}
async function deleteOrder(id){if(!confirm('این سفارش حذف بشه؟'))return;try{orders=(await apiFetch('/admin/orders/'+encodeURIComponent(id),{method:'DELETE'})).orders;renderOrders()}catch(e){showToast(e.message)}}

function openProductForm(id){
  document.getElementById('pfId').value = '';
  document.getElementById('pfName').value = '';
  document.getElementById('pfPrice').value = '';
  document.getElementById('pfImageUrl').value = '';
  document.getElementById('pfImageFile').value = '';
  document.getElementById('pfCategory').value = 'coin';
  document.getElementById('productFormTitle').textContent = 'افزودن آیتم';

  if(id){
    const p = products.find(x => x.id === id);
    if(p){
      document.getElementById('pfId').value = p.id;
      document.getElementById('pfName').value = p.name;
      document.getElementById('pfPrice').value = p.price;
      document.getElementById('pfImageUrl').value = p.image || '';
      document.getElementById('pfCategory').value = p.category;
      document.getElementById('productFormTitle').textContent = 'ویرایش آیتم';
    }
  }
  openModal('productFormOverlay');
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveProduct(){
  const id = document.getElementById('pfId').value;
  const name = document.getElementById('pfName').value.trim();
  const price = document.getElementById('pfPrice').value;
  const category = document.getElementById('pfCategory').value;
  const urlInput = document.getElementById('pfImageUrl').value.trim();
  const fileInput = document.getElementById('pfImageFile').files[0];

  if(!name || !price){ alert('اسم و قیمت آیتم رو بنویس'); return; }

  let image = urlInput || '';
  if(fileInput){
    try{ image = await fileToDataUrl(fileInput); }
    catch(e){ console.error(e); }
  }

  if(id){
    const p = products.find(x => x.id === id);
    p.name = name; p.price = Number(price); p.category = category;
    if(image) p.image = image;
  }else{
    products.push({ id: uid(), name, price: Number(price), category, image });
  }

  await storageSet('products', products, true);
  closeModal('productFormOverlay');
  renderProducts();
  showToast('آیتم ذخیره شد ✔');
}

async function deleteProduct(id){
  if(!confirm('مطمئنی میخوای این آیتم حذف بشه؟')) return;
  products = products.filter(p => p.id !== id);
  await storageSet('products', products, true);
  renderProducts();
  showToast('آیتم حذف شد');
}

/* ---------------- MODAL HELPERS ---------------- */
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', (e) => { if(e.target === ov) ov.classList.remove('show'); });
});

let toastTimer;
function showToast(text){
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

init();