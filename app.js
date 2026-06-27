const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LOCAL_ITEMS = "appregia_items_cache_v5";
const LOCAL_MACROS = "appregia_macro_cache_v5";
const LOCAL_QUEUE = "appregia_sync_queue_v5";
const LOCAL_BACKUPS = "appregia_backups_v5";

let macros = [];
let allItems = [];
let currentMacro = null;
let currentSection = "";
let currentItems = [];
let editingId = null;
let editingMacroId = null;
let autosaveTimer = null;
let syncing = false;

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js?v=5").catch(()=>{});
}

function uid(){return crypto.randomUUID ? crypto.randomUUID() : "local_" + Date.now() + "_" + Math.random().toString(16).slice(2)}
function setStatus(text){document.getElementById("syncStatus").textContent = text}
function getItems(){return JSON.parse(localStorage.getItem(LOCAL_ITEMS) || "[]")}
function setItems(items){localStorage.setItem(LOCAL_ITEMS, JSON.stringify(items))}
function getMacros(){return JSON.parse(localStorage.getItem(LOCAL_MACROS) || "[]")}
function setMacros(items){localStorage.setItem(LOCAL_MACROS, JSON.stringify(items))}
function getQueue(){return JSON.parse(localStorage.getItem(LOCAL_QUEUE) || "[]")}
function setQueue(q){localStorage.setItem(LOCAL_QUEUE, JSON.stringify(q))}

function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0,0);
  if(id === "home") renderMacros();
}

async function init(){
  macros = getMacros();
  allItems = getItems();
  renderMacros();

  if(navigator.onLine){
    try{
      setStatus("🔄 Sincronizzazione...");
      await syncQueue();
      await loadAllOnline();
      setStatus("🟢 Sincronizzato");
    }catch(e){
      setStatus("🟡 Cache locale");
    }
  }else{
    setStatus("🟡 Offline");
  }
  renderMacros();
}

async function loadAllOnline(){
  const {data: macroData, error: macroError} = await db.from("macrostrutture").select("*").order("ordine",{ascending:true});
  if(macroError) throw macroError;

  const {data: itemData, error: itemError} = await db.from("voci").select("*").order("created_at",{ascending:false});
  if(itemError) throw itemError;

  macros = macroData || [];
  allItems = itemData || [];
  setMacros(macros);
  setItems(allItems);
}

function renderMacros(){
  const box = document.getElementById("macroList");
  const localMacros = macros.length ? macros : getMacros();
  const localItems = allItems.length ? allItems : getItems();

  if(!localMacros.length){
    box.innerHTML = "<div class='card'>Nessuna macrostruttura. Creane una dal modulo qui sotto.</div>";
    return;
  }

  box.innerHTML = localMacros.map(m => {
    const count = localItems.filter(x => x.sezione === m.id).length;
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
  if(!nome){alert("Inserisci il nome della macrostruttura.");return}
  const macro = {
    id: uid(),
    nome,
    icona: newMacroIcon.value.trim() || "📁",
    ordine: macros.length + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  macros.push(macro);
  setMacros(macros);
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
  macros[idx] = {...macros[idx], nome: editMacroName.value.trim() || "Senza nome", icona: editMacroIcon.value.trim() || "📁", updated_at: new Date().toISOString()};
  currentMacro = macros[idx];
  setMacros(macros);
  queueMacroSave(macros[idx]);
  openSection(currentMacro.id);
}

async function deleteMacro(){
  if(!currentMacro) return;
  if(!confirm("Eliminare questa macrostruttura e tutte le voci contenute?")) return;
  const id = currentMacro.id;
  macros = macros.filter(m => m.id !== id);
  allItems = allItems.filter(x => x.sezione !== id);
  setMacros(macros);
  setItems(allItems);
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
  currentMacro = macros.find(m => m.id === sectionId) || getMacros().find(m => m.id === sectionId);
  document.getElementById("listTitle").textContent = currentMacro ? `${currentMacro.icona || "📁"} ${currentMacro.nome}` : "Sezione";
  showPage("listPage");
  await loadSectionItems();
}

async function loadSectionItems(){
  const box = document.getElementById("items");
  box.innerHTML = "<div class='card'>Caricamento...</div>";

  currentItems = allItems.filter(x => x.sezione === currentSection);
  renderList();

  if(navigator.onLine){
    try{
      setStatus("🔄 Sincronizzazione...");
      await syncQueue();
      const {data, error} = await db.from("voci").select("*").eq("sezione", currentSection).order("created_at",{ascending:false});
      if(error) throw error;
      allItems = [...allItems.filter(x => x.sezione !== currentSection), ...(data || [])];
      setItems(allItems);
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
  const item = {id: editingId,sezione: currentSection,nome:"",tipo:"",stato:"Da avviare",avanzamento:0,prossima:"",note:"",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),_local:true};
  upsertLocal(item);
  fillForm(item);
  document.getElementById("formTitle").textContent = "Nuova voce";
  document.getElementById("deleteBtn").style.display = "inline-block";
  showPage("formPage");
  queueSave(item);
}

function editExisting(id){
  const item = allItems.find(x => x.id === id) || getItems().find(x => x.id === id);
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
  return {id: editingId,sezione: currentSection,nome:nome.value.trim(),tipo:tipo.value.trim(),stato:stato.value,avanzamento:Math.max(0,Math.min(100,Number(avanzamento.value || 0))),prossima:prossima.value.trim(),note:note.value.trim(),updated_at:new Date().toISOString()};
}

function upsertLocal(item){
  const idx = allItems.findIndex(x => x.id === item.id);
  if(idx >= 0) allItems[idx] = {...allItems[idx], ...item};
  else allItems.unshift(item);
  setItems(allItems);
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
    currentItems = allItems.filter(x => x.sezione === currentSection);
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
        delete clean._local;
        const {error} = await db.from("voci").upsert(clean, {onConflict:"id"});
        if(error) throw error;
      }

      if(op.type === "delete"){
        const {error} = await db.from("voci").delete().eq("id", op.id);
        if(error) throw error;
      }

      if(op.type === "upsert_macro"){
        const {error} = await db.from("macrostrutture").upsert(op.item, {onConflict:"id"});
        if(error) throw error;
      }

      if(op.type === "delete_macro"){
        await db.from("voci").delete().eq("sezione", op.id);
        const {error} = await db.from("macrostrutture").delete().eq("id", op.id);
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
  allItems = allItems.filter(x => x.id !== editingId);
  setItems(allItems);
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
  backups.unshift({date:new Date().toISOString(),macros:getMacros(),items:getItems()});
  localStorage.setItem(LOCAL_BACKUPS, JSON.stringify(backups.slice(0,20)));
}

async function forceAppUpdate(){
  setStatus("🔄 Aggiornamento app...");
  try{
    if("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for(const reg of regs){await reg.update()}
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
