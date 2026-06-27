const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentSection = "opere";
let editingId = null;
let currentItems = [];

function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0,0);
}

function titleFor(s){
  return s === "opere" ? "Opere" : s === "manutenzioni" ? "Manutenzioni" : "Urbanistica";
}

async function openSection(section){
  currentSection = section;
  document.getElementById("listTitle").textContent = titleFor(section);
  showPage("listPage");
  await loadItems();
}

async function loadItems(){
  const box = document.getElementById("items");
  box.innerHTML = "<div class='card'>Caricamento...</div>";

  const { data, error } = await db
    .from("voci")
    .select("*")
    .eq("sezione", currentSection)
    .order("created_at", { ascending:false });

  if(error){
    box.innerHTML = "<div class='card'>Errore caricamento: " + error.message + "</div>";
    return;
  }

  currentItems = data || [];
  if(!currentItems.length){
    box.innerHTML = "<div class='card'>Nessuna voce. Premi + per aggiungerne una.</div>";
    return;
  }

  box.innerHTML = currentItems.map(item => `
    <div class="card" onclick="editExisting('${item.id}')">
      <b>${escapeHtml(item.nome)}</b> <span class="badge">${escapeHtml(item.stato || "")}</span>
      <div class="small">${escapeHtml(item.tipo || "")}</div>
      <div class="progress"><div class="bar" style="width:${Number(item.avanzamento||0)}%"></div></div>
      <div class="small">${Number(item.avanzamento||0)}% · ${escapeHtml(item.prossima || "")}</div>
      <div>${escapeHtml(item.note || "")}</div>
    </div>
  `).join("");
}

function newItem(){
  editingId = null;
  document.getElementById("formTitle").textContent = "Nuova voce · " + titleFor(currentSection);
  document.getElementById("deleteBtn").style.display = "none";
  nome.value = "";
  tipo.value = "";
  stato.value = "Da avviare";
  avanzamento.value = 0;
  prossima.value = "";
  note.value = "";
  showPage("formPage");
}

function editExisting(id){
  const item = currentItems.find(x => x.id === id);
  if(!item) return;
  editingId = id;
  document.getElementById("formTitle").textContent = "Modifica · " + titleFor(currentSection);
  document.getElementById("deleteBtn").style.display = "inline-block";
  nome.value = item.nome || "";
  tipo.value = item.tipo || "";
  stato.value = item.stato || "Da avviare";
  avanzamento.value = item.avanzamento || 0;
  prossima.value = item.prossima || "";
  note.value = item.note || "";
  showPage("formPage");
}

async function saveItem(){
  if(!nome.value.trim()){
    alert("Inserisci il nome.");
    return;
  }

  const payload = {
    sezione: currentSection,
    nome: nome.value.trim(),
    tipo: tipo.value.trim(),
    stato: stato.value,
    avanzamento: Math.max(0, Math.min(100, Number(avanzamento.value || 0))),
    prossima: prossima.value.trim(),
    note: note.value.trim(),
    updated_at: new Date().toISOString()
  };

  let result;
  if(editingId){
    result = await db.from("voci").update(payload).eq("id", editingId);
  }else{
    result = await db.from("voci").insert(payload);
  }

  if(result.error){
    alert("Errore salvataggio: " + result.error.message);
    return;
  }

  await openSection(currentSection);
}

async function deleteItem(){
  if(!editingId) return;
  if(!confirm("Eliminare questa voce?")) return;

  const { error } = await db.from("voci").delete().eq("id", editingId);
  if(error){
    alert("Errore eliminazione: " + error.message);
    return;
  }

  await openSection(currentSection);
}

function cancelForm(){
  openSection(currentSection);
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
}
