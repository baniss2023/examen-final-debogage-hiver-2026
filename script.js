import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  runTransaction,
  serverTimestamp,
  collection,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIC1aoPrWaeaj0nl2DHdgcdbJAsPPcvHE",
  authDomain: "examen-debogage-hiver-2026.firebaseapp.com",
  projectId: "examen-debogage-hiver-2026",
  storageBucket: "examen-debogage-hiver-2026.firebasestorage.app",
  messagingSenderId: "4781354722",
  appId: "1:4781354722:web:2a233ebfe674fdcb3238bb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const EXAM_ID = "debogage_hiver_2026";
const EXAM_DURATION_MS = 2 * 60 * 60 * 1000;
const FS_LIMIT_SEC = 10;
const STORAGE_PREFIX = "debogage_h2026_firebase_proof_v1_";
const VERIFICATION_SOURCE = "debogage-h2026-firebase-proof-v1";
const IDENTITY_FIELD_IDS = ["#ident_nom", "#ident_no", "#ident_groupe"];

let examStarted = false;
let examEnd = 0;
let timerId = null;
let fsCountdownId = null;
let fsLeft = FS_LIMIT_SEC;
let fsExitStart = 0;
let fsExceeded = false;
let incidents = JSON.parse(localStorage.getItem(STORAGE_PREFIX + "fsIncidents") || "[]");

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }
function nowString(){ return new Date().toLocaleString("fr-CA", { dateStyle:"short", timeStyle:"medium" }); }
function normalizeText(value){ return String(value || "").trim().replace(/\s+/g," "); }
function sessionId(){
  let id = localStorage.getItem(STORAGE_PREFIX + "sessionId");
  if(!id){
    id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    localStorage.setItem(STORAGE_PREFIX + "sessionId", id);
  }
  return id;
}

async function sha256Hex(text){
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer)).map(b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function formatFingerprint(hex){
  const clean = String(hex || "").replace(/[^A-F0-9]/gi, "").toUpperCase().padEnd(16, "0");
  return "V-" + [clean.slice(0,4), clean.slice(4,8), clean.slice(8,12), clean.slice(12,16)].join("-");
}
async function makeVerificationFingerprint({code, studentName, studentId, studentGroup, sid, activationIso}){
  const base = [VERIFICATION_SOURCE, code, studentName, studentId, studentGroup, sid, activationIso].join("|");
  return formatFingerprint(await sha256Hex(base));
}
function formatDuration(sec){
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec/60), s = sec % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}
function getFsStats(){
  return JSON.parse(localStorage.getItem(STORAGE_PREFIX + "fsStats") || '{"exits":0,"outsideSeconds":0,"overLimit":0}');
}
function saveFsStats(st){ localStorage.setItem(STORAGE_PREFIX + "fsStats", JSON.stringify(st)); }
function saveIncidents(){ localStorage.setItem(STORAGE_PREFIX + "fsIncidents", JSON.stringify(incidents)); }

function setText(id, value){
  const el = qs(id);
  if(el) el.textContent = value;
}
function setInput(id, value){
  const el = qs(id);
  if(el){
    el.value = value;
    saveField(el);
  }
}
function getLockedIdentity(){
  return {
    code: localStorage.getItem(STORAGE_PREFIX + "accessCodeValue") || "",
    time: localStorage.getItem(STORAGE_PREFIX + "accessUsedAtText") || "",
    studentName: localStorage.getItem(STORAGE_PREFIX + "studentName") || "",
    studentId: localStorage.getItem(STORAGE_PREFIX + "studentId") || "",
    studentGroup: localStorage.getItem(STORAGE_PREFIX + "studentGroup") || "",
    sessionId: localStorage.getItem(STORAGE_PREFIX + "sessionId") || "",
    verificationFingerprint: localStorage.getItem(STORAGE_PREFIX + "verificationFingerprint") || "",
    verificationSource: localStorage.getItem(STORAGE_PREFIX + "verificationSource") || VERIFICATION_SOURCE,
    activationIso: localStorage.getItem(STORAGE_PREFIX + "accessUsedAtIso") || ""
  };
}

function lockIdentityFields(){
  const ident = getLockedIdentity();
  if(!ident.code) return;

  const values = {
    "#ident_nom": ident.studentName,
    "#ident_no": ident.studentId,
    "#ident_groupe": ident.studentGroup
  };

  Object.entries(values).forEach(([selector, value]) => {
    const el = qs(selector);
    if(!el) return;
    if(el.value !== value) el.value = value;
    el.readOnly = true;
    el.setAttribute("aria-readonly", "true");
    el.setAttribute("title", "Identité verrouillée après validation du code d’accès.");
    el.classList.add("locked-identity");
    saveField(el);
  });
}

function enforceLockedIdentity(){
  const ident = getLockedIdentity();
  if(!ident.code) return;
  const before = {
    name: qs("#ident_nom")?.value || "",
    id: qs("#ident_no")?.value || "",
    group: qs("#ident_groupe")?.value || ""
  };
  lockIdentityFields();
  const modified = before.name !== ident.studentName || before.id !== ident.studentId || before.group !== ident.studentGroup;
  if(modified){
    localStorage.setItem(STORAGE_PREFIX + "identityTamper", "1");
    localStorage.setItem(STORAGE_PREFIX + "identityTamperTime", nowString());
  }
}

function updateAccessDisplay(){
  const ident = getLockedIdentity();
  const top = qs("#studentCodeInfo");
  const print = qs("#accessCodePrint");
  const timePrint = qs("#accessTimePrint");
  const lockedIdentityPrint = qs("#lockedIdentityPrint");
  const sessionIdPrint = qs("#sessionIdPrint");
  const verificationFingerprintPrint = qs("#verificationFingerprintPrint");
  const verificationSourcePrint = qs("#verificationSourcePrint");

  if(ident.code){
    const summary = `Code validé : ${ident.code} — ${ident.time || "heure non enregistrée"}`;
    if(top) top.textContent = summary;
    if(print) print.innerHTML = `<span class="code-access-print">${ident.code}</span>`;
    if(timePrint) timePrint.innerHTML = `<span class="code-access-print">${ident.time || "Heure non enregistrée"}</span>`;
    if(lockedIdentityPrint){
      lockedIdentityPrint.innerHTML = `<span class="code-access-print">${ident.studentName || "Nom non saisi"}</span> — N° : <span class="code-access-print">${ident.studentId || "Non saisi"}</span> — Groupe : <span class="code-access-print">${ident.studentGroup || "Non saisi"}</span> <span class="locked-identity-badge">verrouillé</span>`;
    }
    if(sessionIdPrint) sessionIdPrint.innerHTML = `<span class="code-access-print">${ident.sessionId || "Session non enregistrée"}</span>`;
    if(verificationFingerprintPrint) verificationFingerprintPrint.innerHTML = `<span class="code-access-print verification-fingerprint">${ident.verificationFingerprint || "Empreinte non générée"}</span>`;
    if(verificationSourcePrint) verificationSourcePrint.innerHTML = `<span class="code-access-print">${ident.verificationSource || VERIFICATION_SOURCE}</span>`;
    lockIdentityFields();
  } else {
    if(top) top.textContent = "Code d’accès non validé";
    if(print) print.textContent = "Code non validé";
    if(timePrint) timePrint.textContent = "Heure non validée";
    if(lockedIdentityPrint) lockedIdentityPrint.textContent = "Identité non validée";
    if(sessionIdPrint) sessionIdPrint.textContent = "Session non validée";
    if(verificationFingerprintPrint) verificationFingerprintPrint.textContent = "Empreinte non validée";
    if(verificationSourcePrint) verificationSourcePrint.textContent = "Source non validée";
  }
}
function addFullscreenIncident(durationSec, exceeded){
  const item = {
    date: nowString(),
    type: "Sortie du plein écran",
    detail: `Durée hors plein écran : ${formatDuration(durationSec)}${exceeded ? " — dépassement du délai autorisé de 10 secondes." : ""}`
  };
  incidents.push(item);
  saveIncidents();
  renderIncidents(true);
}
function renderIncidents(flash=false){
  const st = getFsStats();
  const box = qs("#incidentBox");
  const list = qs("#incidentPrintList");
  if(box){
    box.innerHTML = `<strong>Sorties plein écran : ${st.exits}</strong> — hors plein écran : ${formatDuration(st.outsideSeconds)} — dépassements : ${st.overLimit}`;
    if(flash){ box.classList.remove("danger"); void box.offsetWidth; box.classList.add("danger"); }
  }
  if(list){
    list.innerHTML = incidents.length
      ? incidents.map((i,idx)=>`<li>${idx+1}. ${i.date} — ${i.type} — ${i.detail}</li>`).join("")
      : "<li>Aucune sortie du plein écran enregistrée.</li>";
  }
}
function prepareResumeGate(){
  const gate = qs("#accessGate");
  if(!gate) return;
  gate.classList.remove("hidden");
  gate.innerHTML = `
    <div class="overlay-card">
      <h2>Reprise de l’examen</h2>
      <p><strong>Examen final débogage hiver 2026</strong><br>L’accès a déjà été validé sur ce navigateur.</p>
      <p>Code utilisé : <strong>${localStorage.getItem(STORAGE_PREFIX + "accessCodeValue") || "code validé"}</strong></p>
      <p>Pour continuer, l’examen doit revenir en plein écran.</p>
      <div class="actions"><button onclick="resumeExam()">Reprendre l’examen en plein écran</button></div>
    </div>`;
}

async function validateAccess(){
  const codeInput = qs("#accessCode");
  const nameInput = qs("#gateStudentName");
  const idInput = qs("#gateStudentId");
  const groupInput = qs("#gateStudentGroup");
  const msg = qs("#accessError");
  const code = normalizeText(codeInput?.value).replace(/\D/g, "");
  const studentName = normalizeText(nameInput?.value);
  const studentId = normalizeText(idInput?.value);
  const studentGroup = normalizeText(groupInput?.value);

  if(msg) msg.textContent = "";
  if(!studentName){ if(msg) msg.textContent = "Veuillez entrer votre prénom et nom."; return; }
  if(!studentId){ if(msg) msg.textContent = "Veuillez entrer votre numéro d’étudiant(e)."; return; }
  if(!/^\d{10}$/.test(code)){ if(msg) msg.textContent = "Veuillez entrer un code à 10 chiffres."; return; }

  const btn = qs("#accessGate button");
  if(btn){ btn.disabled = true; btn.textContent = "Vérification du code..."; }

  try{
    const sid = sessionId();
    const activationIso = new Date().toISOString();
    const activationTime = nowString();
    const verificationFingerprint = await makeVerificationFingerprint({
      code,
      studentName,
      studentId,
      studentGroup,
      sid,
      activationIso
    });

    const codeRef = doc(db, "examens", EXAM_ID, "codes", code);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(codeRef);
      if(!snap.exists()) throw new Error("CODE_INVALIDE");
      const data = snap.data();
      if(data.status !== "available") throw new Error("CODE_DEJA_UTILISE");
      transaction.update(codeRef, {
        status: "used",
        usedAt: serverTimestamp(),
        usedBySessionId: sid,
        verificationFingerprint,
        verificationSource: VERIFICATION_SOURCE
      });
    });

    await setDoc(doc(db, "examens", EXAM_ID, "accessLogs", sid), {
      code,
      examId: EXAM_ID,
      studentName,
      studentId,
      studentGroup,
      sessionId: sid,
      createdAt: serverTimestamp(),
      activationClientIso: activationIso,
      activationClientText: activationTime,
      verificationFingerprint,
      verificationSource: VERIFICATION_SOURCE,
      userAgent: navigator.userAgent
    });
    localStorage.setItem(STORAGE_PREFIX + "accessGranted", "1");
    localStorage.setItem(STORAGE_PREFIX + "accessCodeValue", code);
    localStorage.setItem(STORAGE_PREFIX + "accessUsedAtText", activationTime);
    localStorage.setItem(STORAGE_PREFIX + "accessUsedAtMs", String(Date.now()));
    localStorage.setItem(STORAGE_PREFIX + "accessUsedAtIso", activationIso);
    localStorage.setItem(STORAGE_PREFIX + "verificationFingerprint", verificationFingerprint);
    localStorage.setItem(STORAGE_PREFIX + "verificationSource", VERIFICATION_SOURCE);
    localStorage.setItem(STORAGE_PREFIX + "studentName", studentName);
    localStorage.setItem(STORAGE_PREFIX + "studentId", studentId);
    localStorage.setItem(STORAGE_PREFIX + "studentGroup", studentGroup);

    qs("#accessGate").classList.add("hidden");
    updateAccessDisplay();
    startExam();
  } catch(error){
    console.error(error);
    let texte = "Impossible de valider le code. Vérifiez la connexion Internet et réessayez.";
    if(error.message === "CODE_INVALIDE") texte = "Code invalide. Demandez le bon code à l’enseignant.";
    if(error.message === "CODE_DEJA_UTILISE") texte = "Ce code a déjà été utilisé. Veuillez appeler l’enseignant.";
    if(msg) msg.textContent = texte;
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = "Entrer dans l’examen"; }
  }
}
async function resumeExam(){
  qs("#accessGate").classList.add("hidden");
  updateAccessDisplay();
  startExam();
}
async function startExam(){
  examStarted = true;
  const savedEnd = Number(localStorage.getItem(STORAGE_PREFIX + "examEnd") || 0);
  examEnd = savedEnd || (Date.now() + EXAM_DURATION_MS);
  localStorage.setItem(STORAGE_PREFIX + "examEnd", String(examEnd));
  try{ await document.documentElement.requestFullscreen(); }
  catch(e){ showFullscreenLock("Le plein écran doit être activé pour commencer."); }
  updateTimer();
  clearInterval(timerId);
  timerId = setInterval(updateTimer, 1000);
}
function updateTimer(){
  const left = Math.max(0, examEnd - Date.now());
  const h = Math.floor(left/3600000), m = Math.floor((left%3600000)/60000), s = Math.floor((left%60000)/1000);
  const timer = qs("#timerValue");
  if(timer) timer.textContent = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  if(left <= 0) lockExamTime();
}
function lockExamTime(){
  clearInterval(timerId);
  qsa("input, textarea, select").forEach(el=>{ if(!el.closest("#accessGate")) el.disabled = true; });
  document.body.classList.add("time-locked");
  const timer = qs("#timerValue");
  if(timer) timer.textContent = "00:00:00";
  alert("Le temps de l’examen est terminé. Les réponses sont verrouillées. Le bouton Exporter en PDF reste disponible.");
}
function startOutsideFullscreenPeriod(message="Sortie du plein écran détectée."){
  if(!examStarted || fsExitStart) return;
  fsExitStart = Date.now();
  fsExceeded = false;
  const st = getFsStats();
  st.exits += 1;
  saveFsStats(st);
  renderIncidents(true);
  showFullscreenLock(message);
}
function showFullscreenLock(message="Vous avez quitté le plein écran."){
  if(!examStarted) return;
  document.body.classList.add("fs-locked");
  const ov = qs("#fullscreenLock");
  const text = qs("#fsLockText");
  if(text) text.textContent = message + " Revenez en plein écran avant la fin du délai.";
  if(ov) ov.classList.remove("hidden");
  fsLeft = FS_LIMIT_SEC;
  const count = qs("#fsCountdown");
  if(count) count.textContent = fsLeft;
  clearInterval(fsCountdownId);
  fsCountdownId = setInterval(()=>{
    fsLeft--;
    const c = qs("#fsCountdown");
    if(c) c.textContent = Math.max(0, fsLeft);
    if(fsLeft <= 0 && !fsExceeded){
      fsExceeded = true;
      const st = getFsStats();
      st.overLimit += 1;
      saveFsStats(st);
      renderIncidents(true);
      alert("Vous avez dépassé plus de 10 secondes hors plein écran. Cela sera mentionné dans votre PDF exporté et peut être considéré comme plagiat.");
    }
  },1000);
}
function endOutsideFullscreenPeriod(){
  if(!fsExitStart) return;
  const durationSec = Math.round((Date.now() - fsExitStart)/1000);
  const st = getFsStats();
  st.outsideSeconds += durationSec;
  saveFsStats(st);
  addFullscreenIncident(durationSec, fsExceeded || durationSec > FS_LIMIT_SEC);
  fsExitStart = 0;
  fsExceeded = false;
  clearInterval(fsCountdownId);
  document.body.classList.remove("fs-locked");
  const ov = qs("#fullscreenLock");
  if(ov) ov.classList.add("hidden");
}
async function returnFullscreen(){
  try{ await document.documentElement.requestFullscreen(); }
  catch(e){ alert("Veuillez autoriser le plein écran pour continuer."); }
}

document.addEventListener("fullscreenchange", ()=>{
  if(!examStarted) return;
  if(document.fullscreenElement) endOutsideFullscreenPeriod();
  else startOutsideFullscreenPeriod("Sortie du plein écran détectée.");
});
window.addEventListener("beforeunload", e=>{ if(examStarted){ e.preventDefault(); e.returnValue=""; } });
["copy","cut","paste"].forEach(evt=>document.addEventListener(evt, e=>{
  e.preventDefault();
  alert("Le copier, couper et coller sont désactivés pendant l’examen.");
}));
document.addEventListener("contextmenu", e=>{ e.preventDefault(); });
document.addEventListener("keydown", e=>{
  const k = e.key.toLowerCase();
  if((e.ctrlKey || e.metaKey) && ["c","v","x","a","s"].includes(k)){
    e.preventDefault();
    alert("Cette action est désactivée pendant l’examen.");
  }
});

function saveField(el){
  if(!el || (!el.name && !el.id)) return;
  const key = STORAGE_PREFIX + "field_" + (el.name || el.id);
  if(el.type === "radio" || el.type === "checkbox"){
    if(el.checked) localStorage.setItem(key, el.value);
  } else {
    localStorage.setItem(key, el.value);
  }
  updateProgress();
}
function restoreFields(){
  qsa("input,textarea,select").forEach(el=>{
    if(!el.name && !el.id) return;
    const key = STORAGE_PREFIX + "field_" + (el.name || el.id);
    const v = localStorage.getItem(key);
    if(v !== null){
      if(el.type === "radio" || el.type === "checkbox") el.checked = (el.value === v);
      else el.value = v;
    }
  });
  qsa("textarea").forEach(autoResize);
  updateProgress();
}
function autoResize(el){
  el.style.height = "auto";
  el.style.height = Math.max(el.scrollHeight, el.dataset.minh ? Number(el.dataset.minh) : el.offsetHeight) + "px";
}
function updateProgress(){
  const fields = qsa("[data-answer]");
  let total = 0, done = 0;
  const radioGroups = new Set();
  fields.forEach(el=>{
    if(el.type === "radio"){
      if(!radioGroups.has(el.name)){
        radioGroups.add(el.name);
        total++;
        if(qs(`input[name="${CSS.escape(el.name)}"]:checked`)) done++;
      }
    } else {
      total++;
      if((el.value || "").trim().length > 0) done++;
    }
  });
  const pct = total ? Math.round(done/total*100) : 0;
  const fill = qs("#progressFill");
  if(fill) fill.style.width = pct + "%";
  const txt = qs("#progressText");
  if(txt) txt.textContent = `${pct} % rempli`;
}
function exportPdf(){
  enforceLockedIdentity();
  renderIncidents();
  updateAccessDisplay();
  alert("Rappel : après l’exportation du PDF, vous devez fermer complètement cet examen, puis commencer la partie pratique sur LÉA-Travaux > Évaluations, dans « Examen final débogage hiver 2026 ».");
  window.print();
}
function resetLocalExam(){
  if(confirm("Effacer les réponses et les données locales de cette version ? Attention : le code Firebase déjà utilisé ne redeviendra pas disponible.")){
    Object.keys(localStorage).forEach(k=>{ if(k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k); });
    location.reload();
  }
}

window.validateAccess = validateAccess;
window.resumeExam = resumeExam;
window.returnFullscreen = returnFullscreen;
window.exportPdf = exportPdf;
window.resetLocalExam = resetLocalExam;

window.addEventListener("DOMContentLoaded", ()=>{
  renderIncidents();
  restoreFields();
  updateAccessDisplay();
  lockIdentityFields();
  setInterval(enforceLockedIdentity, 3000);
  qsa("input,textarea,select").forEach(el=>{
    el.addEventListener("input", ()=>{ if(el.classList.contains("locked-identity")){ enforceLockedIdentity(); return; } saveField(el); if(el.tagName === "TEXTAREA") autoResize(el); });
    el.addEventListener("change", ()=>{ if(el.classList.contains("locked-identity")){ enforceLockedIdentity(); return; } saveField(el); });
  });
  if(localStorage.getItem(STORAGE_PREFIX + "accessGranted") === "1") prepareResumeGate();
});
