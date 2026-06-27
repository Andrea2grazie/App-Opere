const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LOCAL_ITEMS = "appregia_items_cache_v4";
const LOCAL_MACROS = "appregia_macro_cache_v4";
const LOCAL_QUEUE = "appregia_sync_queue_v4";
const LOCAL_BACKUPS = "appregia_backups_v4";

let macros = [];
let currentMacro = null;
let currentSection = "";
let currentItems = [];
let editingId = null;
let editingMacroId = null;
let autosaveTimer = null;
let syncing = false;

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js?v=4").catch(()=>{});
}

function uid(){
  return crypto.randomUUID ? crypto.randomUUID() : "local_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}
function setStatus(text){ document.getElementById("syncStatus").textContent = text; }

function getCache(){ return JSON.parse(localStorage.getItem(LOCAL_ITEMS) || "[]"); }
function setCache(items){ localStorage.setItem(LOCAL_ITEMS, JSON.stringify(items)); }
function getMacroCache(){ return JSON.parse(localStorage.getItem(LOCAL_MACROS) || "[]"); }
function setMacroCache(items){ localStorage.setItem(LOCAL_MACROS, JSON.stringify(items)); }
function getQueue(){ return JSON.parse(localStorage.getItem(LOCAL_QUEUE) || "[]"); }
function setQueue(q){ localStorage.setItem(LOCAL_QUEUE, JSON.stringify(q)); }

function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0,0);
  if(id === "home") renderMacros();
}

async function init(){
  macros = getMacroCache();
  renderMacros();

  if(navigator.onLine){
    try{
      setStatus("🔄 Sincronizzazione...");
      await syncQueue();
      await loadMacrosOnline();
      setStatus("🟢 Sincronizzato");
    }catch(e){
      setStatus("🟡 Cache locale");
      if(!macros.length) seedDefaultMacros();
    }
  }else{
    setStatus("🟡 Offline");
    if(!macros.length) seedDefaultMacros();
  }
  renderMacros();
}

function seedDefaultMacros(){
  macros = [
    {id:"opere", nome:"Opere", icona:"🏗️", ordine:1},
    {id:"manutenzioni", nome:"Manutenzioni", icona:"🔧", ordine:2},
    {id:"urbanistica", nome:"Urbanistica", icona:"📐", ordine:3}
  ];
  setMacroCache(macros);
}

async function loadMacrosOnline(){
  const { data, error } = await db.from("macrostrutture").select("*").order("ordine", { ascending:true });
  if(error) throw error;
  if(!data || !data.length){
    seedDefaultMacros();
    for(const m of macros) queueMacroSave(m);
    await syncQueue();
  }else{
    macros = data;
    setMacroCache(macros);
  }
}

function renderMacros(){
  const box = document.getElementById("macroList");
  const localMacros = macros.length ? macros : getMacroCache();
  if(!localMacros.length){
    box.innerHTML = "<div class='card'>Nessuna macrostruttura. Creane una dal modulo qui sotto.</div>";
    return;
  }
  const allItems = getCache();
  box.innerHTML = localMacros.map(m => {
    const count = allItems.filter(x => x.sezione === m.id && !x._deleted).length;
    return `<div class="tile" onclick="openSection('${m.id}')">
      <div class="tileTop">
        <div>
          <div class="icon">${escapeHtml(m.icona || "📁")}</div>
          <h2>${escapeHtml(m.nome)}</h2>
          <p>${count} voci</p>
        </div>
        <span class="badge">Apri</span>
      </div>
    </div>`;
  }).join("");
}

function createMacro(){
  const nome = newMacroName.value.trim();
  if(!nome){ alert("Inserisci il nome della macrostruttura."); return; }
  const id = uid();
  const macro = {
    id,
    nome,
    icona: newMacroIcon.value.trim() || "📁",
    ordine: macros.length + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  macros.push(macro);
  setMacroCache(macros);
  queueMacroSave(macro);
  newMacroName.value = "";
  newMacroIcon.value = "";
  renderMacros();
}

function openMacroEdit(){
  if(!currentMacro) return;
  editingMacroId = currentMacro.id;
  editMacroName.value = currentMacro.nome || "";
  editMacroIcon.value = currentMacro.icona || "";
  showPage("macroEditPage");
}

function saveMacroEdit(){
  const idx = macros.findIndex(m => m.id === editingMacroId);
  if(idx < 0) return;
  macros[idx] = {
    ...macros[idx],
    nome: editMacroName.value.trim() || "Senza nome",
    icona: editMacroIcon.value.trim() || "📁",
    updated_at: new Date().toISOString()
  };
  currentMacro = macros[idx];
  setMacroCache(macros);
  queueMacroSave(macros[idx]);
  openSection(currentMacro.id);
}

async function deleteMacro(){
  if(!currentMacro) return;
  if(!confirm("Eliminare questa macrostruttura e tutte le voci al suo interno?")) return;

  const id = currentMacro.id;
  macros = macros.filter(m => m.id !== id);
  setMacroCache(macros);

  let items = getCache().filter(x => x.sezione !== id);
  setCache(items);

  const q = getQueue();
  q.push({type:"delete_macro", id});
  setQueue(q);
  if(navigator.onLine) await syncQueue();

  currentMacro = null;
  currentSection = "";
  showPage("home");
}

async function openSection(sectionId){
  currentSection = sectionId;
  currentMacro = macros.find(m => m.id === sectionId) || getMacroCache().find(m => m.id === sectionId);
  document.getElementById("listTitle").textContent = currentMacro ? `${currentMacro.icona || "📁"} ${currentMacro.nome}` : "Sezione";
  showPage("listPage");
  await loadItems();
}

async function loadItems(){
  const box = document.getElementById("items");
  box.innerHTML = "<div class='card'>Caricamento...</div>";

  const cached = getCache().filter(x => x.sezione === currentSection && !x._deleted);
  currentItems = cached;
  renderList();

  if(navigator.onLine){
    try{
      setStatus("🔄 Sincronizzazione...");
      await syncQueue();
      const { data, error } = await db.from("voci").select("*").eq("sezione", currentSection).order("created_at", { ascending:false });
      if(error) throw error;
      const allOther = getCache().filter(x => x.sezione !== currentSection);
      setCache([...allOther, ...(data || [])]);
      currentItems = data || [];
      renderList();
      autoBackup();
      setStatus("🟢 Sincronizzato");
    }catch(e){
      setStatus("🟡 Offline / cache locale");
    }
  }else{
    setStatus("🟡 Offline: salvataggio locale");
  }
}

function renderList(){
  const box = document.getElementById("items");
  if(!currentItems.length){
    box.innerHTML = "<div class='card'>Nessuna voce. Premi + per aggiungerne una.</div>";
    return;
  }
  box.innerHTML = currentItems.map(item => `
    <div class="card" onclick="editExisting('${item.id}')">
      <b>${escapeHtml(item.nome || "Senza nome")}</b> <span class="badge">${escapeHtml(item.stato || "")}</span>
      <div class="small">${escapeHtml(item.tipo || "")}</div>
      <div class="progress"><div class="bar" style="width:${Number(item.avanzamento||0)}%"></div></div>
      <div class="small">${Number(item.avanzamento||0)}% · ${escapeHtml(item.prossima || "")}</div>
      <div>${escapeHtml(item.note || "")}</div>
    </div>
  `).join("");
}

function newItem(){
  editingId = uid();
  const item = {id: editingId,sezione: currentSection,nome: "",tipo: "",stato: "Da avviare",avanzamento: 0,prossima: "",note: "",created_at: new Date().toISOString(),updated_at: new Date().toISOString(),_local: true};
  upsertLocal(item);
  fillForm(item);
  document.getElementById("formTitle").textContent = "Nuova voce";
  document.getElementById("deleteBtn").style.display = "inline-block";
  showPage("formPage");
  queueSave(item);
}

function editExisting(id){
  const item = getCache().find(x => x.id === id);
  if(!item) return;
  editingId = id;
  fillForm(item);
  document.getElementById("formTitle").textContent = "Modifica voce";
  document.getElementById("deleteBtn").style.display = "inline-block";
  showPage("formPage");
}

function fillForm(item){
  nome.value = item.nome || "";
  tipo.value = item.tipo || "";
  stato.value = item.stato || "Da avviare";
  avanzamento.value = item.avanzamento || 0;
  prossima.value = item.prossima || "";
  note.value = item.note || "";
}

function collectForm(){
  return {id: editingId,sezione: currentSection,nome: nome.value.trim(),tipo: tipo.value.trim(),stato: stato.value,avanzamento: Math.max(0, Math.min(100, Number(avanzamento.value || 0))),prossima: prossima.value.trim(),note: note.value.trim(),updated_at: new Date().toISOString()};
}

function upsertLocal(item){
  const items = getCache();
  const idx = items.findIndex(x => x.id === item.id);
  if(idx >= 0) items[idx] = {...items[idx], ...item};
  else items.unshift(item);
  setCache(items);
}

function queueSave(item){
  const q = getQueue().filter(x => !(x.type === "upsert" && x.item.id === item.id));
  q.push({type:"upsert", item});
  setQueue(q);
  setStatus(navigator.onLine ? "🟡 Salvataggio..." : "🟡 Salvato offline");
  if(navigator.onLine) syncQueue();
}

function queueMacroSave(macro){
  const q = getQueue().filter(x => !(x.type === "upsert_macro" && x.item.id === macro.id));
  q.push({type:"upsert_macro", item:macro});
  setQueue(q);
  setStatus(navigator.onLine ? "🟡 Salvataggio..." : "🟡 Salvato offline");
  if(navigator.onLine) syncQueue();
}

function scheduleAutosave(){
  clearTimeout(autosaveTimer);
  setStatus("🟡 Modifica locale...");
  autosaveTimer = setTimeout(() => {
    if(!editingId) return;
    const item = collectForm();
    if(!item.nome) item.nome = "Senza nome";
    upsertLocal(item);
    queueSave(item);
    autoBackup();
  }, 600);
}

document.addEventListener("input", e => { if(e.target.matches("[data-field]")) scheduleAutosave(); });
document.addEventListener("change", e => { if(e.target.matches("[data-field]")) scheduleAutosave(); });

async function syncQueue(){
  if(syncing) return;
  syncing = true;
  let q = getQueue();
  try{
    while(q.length){
      const op = q[0];

      if(op.type === "upsert"){
        const clean = {...op.item};
        delete clean._local; delete clean._deleted;
        const { error } = await db.from("voci").upsert(clean, { onConflict:"id" });
        if(error) throw error;
      }

      if(op.type === "delete"){
        const { error } = await db.from("voci").delete().eq("id", op.id);
        if(error) throw error;
      }

      if(op.type === "upsert_macro"){
        const clean = {...op.item};
        const { error } = await db.from("macrostrutture").upsert(clean, { onConflict:"id" });
        if(error) throw error;
      }

      if(op.type === "delete_macro"){
        await db.from("voci").delete().eq("sezione", op.id);
        const { error } = await db.from("macrostrutture").delete().eq("id", op.id);
        if(error) throw error;
      }

      q.shift();
      setQueue(q);
    }
    setStatus("🟢 Sincronizzato");
  }catch(e){
    setStatus("🔴 Da sincronizzare");
  }finally{
    syncing = false;
  }
}

async function deleteItem(){
  if(!editingId) return;
  if(!confirm("Eliminare questa voce?")) return;
  let items = getCache().filter(x => x.id !== editingId);
  setCache(items);
  const q = getQueue();
  q.push({type:"delete", id:editingId});
  setQueue(q);
  editingId = null;
  autoBackup();
  if(navigator.onLine) await syncQueue();
  await openSection(currentSection);
}

function backToList(){
  if(editingId) scheduleAutosave();
  openSection(currentSection);
}

function autoBackup(){
  const backups = JSON.parse(localStorage.getItem(LOCAL_BACKUPS) || "[]");
  backups.unshift({date: new Date().toISOString(),macros:getMacroCache(),items: getCache()});
  localStorage.setItem(LOCAL_BACKUPS, JSON.stringify(backups.slice(0, 20)));
}

async function forceAppUpdate(){
  setStatus("🔄 Aggiornamento app...");
  try{
    if("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for(const reg of regs){ await reg.update(); }
    }
    if("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now());
    window.location.replace(url.toString());
  }catch(e){
    window.location.reload();
  }
}

window.addEventListener("online", async () => {
  setStatus("🔄 Online: sincronizzazione...");
  await syncQueue();
  await init();
});
window.addEventListener("offline", () => setStatus("🟡 Offline: salvataggio locale"));

setInterval(() => {
  autoBackup();
  if(navigator.onLine) syncQueue();
}, 60000);

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
}

init();
