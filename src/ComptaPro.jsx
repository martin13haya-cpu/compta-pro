import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useCallback, useRef, Fragment } from 'react'

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SUPABASE_URL       ='https://proehigsikgqdrxjltmq.supabase.co'
const SUPABASE_ANON_KEY  = 'sb_publishable_DqCGxDWGqJ5K0rnnzDv6Hg_gWG7wzfX'
const SUPER_ADMIN_EMAIL    = 'martin13haya@gmail.com'
const SUPER_ADMIN_WHATSAPP = '2290196078696' // ← Mettre ici votre vrai numéro WhatsApp (sans +, ex: 22997000000)
const APP_VERSION        = 'v2.1.0' // force rebuild
// Détecter le token recovery AVANT que Supabase le consomme
const _hash = window.location.hash
const _params = new URLSearchParams(_hash.replace('#',''))
if (_params.get('type') === 'recovery') {
  sessionStorage.setItem('sb_recovery', '1')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Helper : récupère le company_id effectif pour l'utilisateur courant
async function getEffectiveCompanyId(companyId, companies) {
  const uid = (await supabase.auth.getUser()).data?.user?.id
  if (!uid) return null
  if (companyId) return companyId
  if (companies?.length > 0) return companies[0].id
  const { data } = await supabase.from('compta_profiles').select('company_id').eq('id', uid).single()
  return data?.company_id || null
}



// Helper : retourne un filtre uid ou company selon le rôle
// Pour le super admin, utilise .or() pour matcher company_id OU user_id du propriétaire
// (couvre les anciens enregistrements sans company_id)
async function buildQuery(q, uid, companyId, isAdmin) {
  if (isAdmin) {
    if (!companyId) return q // super admin sans filtre = voit tout
    const { data: comp } = await supabase.from('compta_companies').select('user_id').eq('id', companyId).single()
    const ownerUid = comp?.user_id
    if (ownerUid) return q.or(`company_id.eq.${companyId},user_id.eq.${ownerUid}`)
    return q.eq('company_id', companyId)
  }
  if (companyId) return q.eq('company_id', companyId)
  return q.eq('user_id', uid)
}

// Helper inline pour les fonctions load des étuveuses
async function etvFilter(q, uid, companyId, isAdmin) {
  return buildQuery(q, uid, companyId, isAdmin)
}

// ── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
function useResponsive() {
  const getSize = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    isLandscape: window.innerWidth > window.innerHeight
  })
  const [size, setSize] = useState(getSize)

  useEffect(() => {
    const handler = () => setSize(getSize())
    const orientHandler = () => {
      // Délai pour laisser le navigateur finir la rotation
      setTimeout(() => {
        setSize({
          width: window.innerWidth,
          height: window.innerHeight,
          isLandscape: window.innerWidth > window.innerHeight
        })
      }, 300)
    }
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', orientHandler)
    // Support moderne
    screen.orientation?.addEventListener('change', orientHandler)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', orientHandler)
      screen.orientation?.removeEventListener('change', orientHandler)
    }
  }, [])

  const { width, height, isLandscape } = size
  // En paysage sur mobile (ex: 667px large), traiter comme tablette
  const isMobile  = width < 768 && !isLandscape
  const isMobileLandscape = isLandscape && height < 500
  const isTablet  = (width >= 768 && width < 1024) || (isMobileLandscape && width < 1024)
  const isDesktop = width >= 1024 && !isMobileLandscape

  return { isMobile, isTablet, isDesktop, isLandscape, isMobileLandscape, width, height }
}

// ── UTILITIES ───────────────────────────────────────────────────────────────
const fcfa    = v => Math.round(v || 0).toLocaleString('fr-FR') + ' FCFA'
const today   = () => new Date().toISOString().slice(0, 10)

// Injecte une barre d'actions (Retour, Télécharger PDF, Imprimer) dans le HTML
function buildPrintDocument(html, filename) {
  const fname = (filename || 'document').replace(/[^a-zA-Z0-9_-]/g,'_')
  const scriptTag = '<scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></scr'+'ipt>'
  const pdfScript = '<scr'+'ipt>' + `
    // Détecte si on est dans une WebView Android (Capacitor) — le téléchargement de blob y échoue
    function __isAndroidWebView(){
      var ua=navigator.userAgent||'';
      var isAndroid=ua.indexOf('Android')>-1;
      var isWebView=ua.indexOf('; wv')>-1 || ua.indexOf('Capacitor')>-1;
      return isAndroid && isWebView;
    }
    function __downloadPDF(){
      // Sur Android WebView, le téléchargement de blob ne marche pas : on utilise l'impression native
      if(__isAndroidWebView()){
        window.print();
        return;
      }
      var btn=document.getElementById('__pdfbtn');
      if(typeof html2pdf==="undefined"){ alert("La librairie PDF nest pas encore chargee. Verifiez votre connexion internet et reessayez."); return; }
      btn.textContent='⏳ Génération...'; btn.disabled=true;
      var tb=document.getElementById('__toolbar'); tb.style.display='none';
      var opt={ margin:[8,8,8,8], filename:'${fname}.pdf', image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true,logging:false}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };
      var content=document.getElementById('__content')||document.body;
      html2pdf().set(opt).from(content).save().then(function(){
        tb.style.display='flex'; btn.textContent='📥 Télécharger PDF'; btn.disabled=false;
      }).catch(function(err){
        tb.style.display='flex'; btn.textContent='📥 Télécharger PDF'; btn.disabled=false;
        alert('Erreur PDF : '+(err&&err.message?err.message:'inconnue'));
      });
    }
  ` + '</scr'+'ipt>'

  const toolbar = `
    <div id="__toolbar" style="position:sticky;top:0;left:0;right:0;z-index:99999;background:#075E54;padding:8px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,0.2)">
      <button onclick="history.length>1?history.back():window.close()" style="background:white;color:#075E54;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">← Retour</button>
      <button id="__pdfbtn" onclick="__downloadPDF()" style="background:#25D366;color:white;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">📥 PDF</button>
      <button onclick="window.print()" style="background:#f0f2f5;color:#1e293b;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">🖨️ Imprimer / PDF</button>
    </div>
    <div style="background:#fffbe6;padding:8px 14px;font-size:12px;color:#92400e;border-bottom:1px solid #fde68a;line-height:1.4">💡 Sur mobile : touchez « 🖨️ Imprimer / PDF » puis choisissez « Enregistrer au format PDF » dans la liste des imprimantes.</div>
    <style>@media print { #__toolbar { display:none !important } }</style>
  `
  // Envelopper le contenu original dans une div #__content (pour le PDF)
  // et insérer toolbar + scripts
  if (html.includes('<body>')) {
    return html
      .replace('<body>', '<body>' + scriptTag + pdfScript + toolbar + '<div id="__content">')
      .replace('</body>', '</div></body>')
  } else if (html.includes('<body')) {
    return html
      .replace(/(<body[^>]*>)/, '$1' + scriptTag + pdfScript + toolbar + '<div id="__content">')
      .replace('</body>', '</div></body>')
  }
  return scriptTag + pdfScript + toolbar + '<div id="__content">' + html + '</div>'
}

// Ouvre un document HTML pour impression/PDF — compatible Web ET Android (Capacitor)
// Utilise un blob (URL.createObjectURL) car document.write bloque les scripts externes (html2pdf)
function openPrintWindow(html, filename) {
  const fullHtml = buildPrintDocument(html, filename)
  try {
    const blob = new Blob([fullHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const opened = window.open(url, '_blank')
    if (!opened) {
      // Fallback : navigation directe (Android sans popup)
      const a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
    setTimeout(()=>URL.revokeObjectURL(url), 120000)
  } catch (e) {
    alert("Impossible d'ouvrir le document : " + e.message)
  }
}
const ACCENT  = '#25D366'
const SIDEBAR = '#075E54'

// Theme system
const THEMES = {
  light: { bg:'#f0f2f5', surface:'#ffffff', text:'#1e293b', textMuted:'#64748b', border:'#e2e8f0', sidebar:'#075E54' },
  dark:  { bg:'#0b141a', surface:'#1f2c34', text:'#e9edef', textMuted:'#8696a0', border:'#2a3942', sidebar:'#1f2c34' }
}
function applyTheme(mode){
  const t = THEMES[mode] || THEMES.light
  const r = document.documentElement
  r.setAttribute('data-theme', mode)
  let s = document.getElementById('theme-css')
  if(!s){ s=document.createElement('style'); s.id='theme-css'; document.head.appendChild(s) }
  if(mode==='dark'){
    s.textContent = `
      html,body{background:${t.bg}!important;color:${t.text}!important}
      [data-theme="dark"] div[style*="background:#f1f5f9"],
      [data-theme="dark"] div[style*="background: #f1f5f9"]{background:${t.bg}!important}
      [data-theme="dark"] div[style*="background:white"],
      [data-theme="dark"] div[style*="background: white"],
      [data-theme="dark"] div[style*="background:#fff"],
      [data-theme="dark"] div[style*="background:#ffffff"]{background:${t.surface}!important;color:${t.text}!important}
      [data-theme="dark"] table{color:${t.text}!important}
      [data-theme="dark"] input,[data-theme="dark"] select,[data-theme="dark"] textarea{background:${t.surface}!important;color:${t.text}!important;border-color:${t.border}!important}
      [data-theme="dark"] th{background:${t.bg}!important;color:${t.text}!important}
    `
  } else { s.textContent='' }
}
function getStoredTheme(){ try{return localStorage.getItem('comptapro_theme')||'light'}catch{return 'light'} }
function setStoredTheme(m){ try{localStorage.setItem('comptapro_theme',m)}catch{}; applyTheme(m) }

const CAT_LABELS = {
  riz_paddy:'Riz Paddy', riz_etuve:'Riz Étuvé', riz_blanc:'Riz Blanc',
  semi_fini:'Semi-fini', emballage:'Emballage', autre:'Autre',
}
const TYPE_DOC_LABELS = {
  proforma:'Proforma', bon_commande:'Bon de Commande',
  bon_livraison:'Bon de Livraison', facture:'Facture',
}
const TYPE_DOC_PREFIX = { proforma:'PRF', bon_commande:'BC', bon_livraison:'BL', facture:'FAC' }
const STATUT_COLORS = {
  brouillon:'secondary', validé:'info', livré:'info', payé:'success', annulé:'danger',
}

// ── PDF PRINT ────────────────────────────────────────────────────────────────
const CSS_PRINT = `
  @page { size: A4; margin: 1.8cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #0f2044; padding-bottom: 12px; }
  .company-logo { max-height:70px; max-width:120px; object-fit:contain; margin-bottom:4px; display:block; }
  .company-name { font-size: 16pt; font-weight: 800; color: #0f2044; }
  .company-info { font-size: 9.5pt; color: #555; line-height: 1.6; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 18pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0f2044; }
  .doc-numero { font-size: 12pt; color: #555; margin-top: 4px; }
  .doc-date { font-size: 10pt; color: #555; }
  .client-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; font-size: 10.5pt; }
  .client-box strong { color: #0f2044; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5pt; }
  th { background: #0f2044; color: white; padding: 8px 10px; text-align: left; font-size: 9.5pt; }
  th.r { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
  td.r { text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
  .totals { margin-left: auto; width: 280px; font-size: 10.5pt; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
  .totals .ttc { background: #0f2044; color: white; font-weight: 800; font-size: 13pt; padding: 10px 14px; display: flex; justify-content: space-between; border-radius: 4px; margin-top: 6px; }
  .notes { background: #fffde7; border-left: 3px solid #f59e0b; padding: 8px 12px; font-size: 9.5pt; margin-top: 10px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig-box { width: 44%; text-align: center; border-top: 1px solid #ccc; padding-top: 8px; font-size: 9.5pt; }
  .print-btn { position: fixed; top: 12px; right: 12px; background: #0f2044; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; z-index: 999; font-family: Arial, sans-serif; }
  @media print { .print-btn { display: none; } }
`

const CSS_PRINT_LANDSCAPE = CSS_PRINT.replace('@page { size: A4;', '@page { size: A4 landscape;')

function buildCommercialDocHtml(doc, lignes) {
  const estBC = doc.type_doc==='bon_commande'
  const cli  = estBC ? doc.compta_fournisseurs : doc.compta_clients
  const comp = doc.compta_companies
  const partLabel = estBC ? 'Fournisseur' : 'Client'
  const cliNom = cli ? (cli.type==='morale' ? cli.nom_societe : (cli.nom||'').trim()) : null

  const estBL = doc.type_doc==='bon_livraison'
  const nbCols = estBL ? 4 : 6
  const lignesHtml = (lignes||[]).length > 0
    ? (lignes||[]).map((l,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${l.designation||''}</td>
      <td class="r">${l.unite||''}</td>
      <td class="r">${(+(l.quantite)||0).toFixed(3)}</td>
      ${estBL ? '' : `<td class="r">${Math.round(+(l.prix_unitaire)||0).toLocaleString('fr-FR')}</td><td class="r"><strong>${Math.round(+(l.montant_ligne)||0).toLocaleString('fr-FR')}</strong></td>`}
    </tr>`).join('')
    : `<tr><td colspan="${nbCols}" style="text-align:center;color:#888;padding:16px">Aucune ligne enregistrée</td></tr>`

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${doc.numero}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        ${comp?.logo_url?`<img src="${comp.logo_url}" class="company-logo" alt="logo" />`:''}
        <div class="company-name">${comp?.raison_sociale||''}</div>
        <div class="company-info">
          ${comp?.rccm ? `RCCM : ${comp.rccm}<br>` : ''}
          ${comp?.adresse||''} ${comp?.tel ? `&mdash; T&eacute;l : ${comp.tel}` : ''}
        </div>
      </div>
      <div class="doc-title">
        <h1>${TYPE_DOC_LABELS[doc.type_doc]||doc.type_doc}</h1>
        <div class="doc-numero">N&deg; ${doc.numero}</div>
        <div class="doc-date">Date : ${doc.date_doc}${doc.date_echeance?` &mdash; &Eacute;ch&eacute;ance : ${doc.date_echeance}`:''}</div>
      </div>
    </div>
    ${cliNom ? `<div class="client-box"><strong>${partLabel} :</strong> ${cliNom}${cli?.telephone?` &mdash; T&eacute;l : ${cli.telephone}`:''}${cli?.ifu?` &mdash; IFU : ${cli.ifu}`:''}</div>` : ''}
    <table>
      <thead><tr>
        <th style="width:30px">#</th>
        <th>D&eacute;signation</th>
        <th class="r" style="width:55px">Unit&eacute;</th>
        <th class="r" style="width:80px">Quantit&eacute;</th>
        ${estBL ? '' : `<th class="r" style="width:110px">Prix U. (FCFA)</th><th class="r" style="width:120px">Montant (FCFA)</th>`}
      </tr></thead>
      <tbody>${lignesHtml}</tbody>
    </table>
    ${estBL ? '' : `<div class="totals">
      <div class="row"><span>Montant HT</span><span>${Math.round(doc.montant_ht||0).toLocaleString('fr-FR')} FCFA</span></div>
      ${(doc.tva_pct||0)>0 ? `<div class="row"><span>TVA (${doc.tva_pct}%)</span><span>${Math.round(doc.montant_tva||0).toLocaleString('fr-FR')} FCFA</span></div>` : ''}
      <div class="ttc"><span>TOTAL TTC</span><span>${Math.round(doc.montant_ttc||0).toLocaleString('fr-FR')} FCFA</span></div>
      ${(doc.montant_paye||0)>0 ? `<div class="row" style="margin-top:4px"><span>Pay&eacute;</span><span style="color:#16a34a">${Math.round(doc.montant_paye||0).toLocaleString('fr-FR')} FCFA</span></div>` : ''}
    </div>`}
    ${doc.notes ? `<div class="notes"><strong>Notes :</strong> ${doc.notes}</div>` : ''}
    <div class="signatures">
      <div class="sig-box">Signature du vendeur</div>
      <div class="sig-box">Signature du ${partLabel.toLowerCase()}${cliNom?`<br><small>${cliNom}</small>`:''}</div>
    </div>
  </body></html>`
}

function printCommercialDoc(doc, lignes) {
  const html = buildCommercialDocHtml(doc, lignes)
  openPrintWindow(html)
}

function DocPreviewModal({ open, onClose, doc, lignes }) {
  if (!open || !doc) return null
  const html = buildCommercialDocHtml(doc, lignes)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:3000,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:12, width:'100%', maxWidth:900,
        maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 30px 80px rgba(0,0,0,.4)' }}>
        {/* Header */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #e2e8f0', display:'flex',
          alignItems:'center', justifyContent:'space-between', background:'#0f2044', borderRadius:'12px 12px 0 0' }}>
          <span style={{ color:'white', fontWeight:700, fontSize:15 }}>
            👁️ Aperçu — {doc.numero}
          </span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>printCommercialDoc(doc, lignes)}
              style={{ background:'#2563eb', color:'white', border:'none', padding:'7px 18px',
                borderRadius:7, fontWeight:700, fontSize:13, cursor:'pointer' }}>
              🖨️ Imprimer / PDF
            </button>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,.15)', color:'white', border:'none',
                padding:'7px 14px', borderRadius:7, fontWeight:700, fontSize:14, cursor:'pointer' }}>
              ✕ Fermer
            </button>
          </div>
        </div>
        {/* Preview iframe */}
        <iframe
          srcDoc={html}
          style={{ flex:1, border:'none', borderRadius:'0 0 12px 12px', minHeight:0 }}
          title="Aperçu document"
        />
      </div>
    </div>
  )
}

function printAchatSemiFini(row) {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Achat ${row.numero_fact||'Semi-fini'}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">BON D'ACHAT SEMI-FINI</div>
        <div class="doc-numero" style="margin-top:4px">N° Fact. ${row.numero_fact||'—'}</div>
      </div>
      <div class="doc-title">
        <div class="doc-date">Date : ${row.date_achat||'—'}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead>
      <tbody>
        <tr><td>Entité</td><td class="r">${row.entite||'—'}</td></tr>
        <tr><td>Fournisseur</td><td class="r">${row.nom_fournisseur||'—'}</td></tr>
        <tr><td>Provenance</td><td class="r">${row.provenance||'—'}</td></tr>
        <tr><td>Acheteur</td><td class="r">${row.nom_acheteur||'—'}</td></tr>
        <tr><td>ID Produit</td><td class="r">${row.id_produit||'—'}</td></tr>
        <tr><td>Nature du produit</td><td class="r">${row.nature_produit||'—'}</td></tr>
        <tr><td>Quantité (kg)</td><td class="r">${(row.quantite||0).toFixed(2)} kg</td></tr>
        <tr><td>Prix unitaire</td><td class="r">${Math.round(row.prix_unitaire||0).toLocaleString('fr-FR')} FCFA/kg</td></tr>
        <tr><td>Statut</td><td class="r">${row.statut||'—'}</td></tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="ttc"><span>MONTANT TOTAL</span><span>${Math.round(row.montant||0).toLocaleString('fr-FR')} FCFA</span></div>
    </div>
    <div class="signatures">
      <div class="sig-box">Signature du fournisseur<br><small>${row.nom_fournisseur||''}</small></div>
      <div class="sig-box">Signature de l'acheteur<br><small>${row.nom_acheteur||''}</small></div>
    </div>
  </body></html>`
  openPrintWindow(html)
}


function printEpierrage(row, companyName='') {
  const ecart = Math.max(0,(row.poids_avant||0)-(row.poids_apres||0)-(row.poids_cailloux||0)).toFixed(2)
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Fiche Épierrage ${row.numero||''}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">${companyName||'ComptaPro'}</div>
        <div class="doc-numero" style="margin-top:4px">FICHE D'ÉPIERRAGE N° ${row.numero||'—'}</div>
      </div>
      <div class="doc-title"><div class="doc-date">Date : ${row.date_epierrage||'—'}</div></div>
    </div>
    <table>
      <thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead>
      <tbody>
        <tr><td>N° Lot</td><td class="r">${row.numero_lot||'—'}</td></tr>
        <tr><td>Responsable de section</td><td class="r">${row.responsable||'—'}</td></tr>
        <tr><td>Poids avant épierrage</td><td class="r">${(row.poids_avant||0).toFixed(2)} kg</td></tr>
        <tr><td>Poids après épierrage</td><td class="r">${(row.poids_apres||0).toFixed(2)} kg</td></tr>
        <tr><td>Poids des cailloux</td><td class="r">${(row.poids_cailloux||0).toFixed(2)} kg</td></tr>
        <tr><td><strong>Écart</strong></td><td class="r"><strong>${ecart} kg</strong></td></tr>
        <tr><td>Taux d'humidité</td><td class="r">${row.taux_humidite||0}%</td></tr>
        ${row.observation?`<tr><td>Observation</td><td class="r">${row.observation}</td></tr>`:''}
        ${row.recommandation?`<tr><td>Recommandation</td><td class="r">${row.recommandation}</td></tr>`:''}
      </tbody>
    </table>
    <div class="signatures">
      <div class="sig-box">Signature du responsable<br><small>${row.responsable||''}</small></div>
      <div class="sig-box">Visa de la direction</div>
    </div>
  </body></html>`
  openPrintWindow(html)
}

function printExpressionBesoin(fiche, lignes, budgets, companyInfo, sigImg=null, cachetImg=null) {
  // Détermine si la fiche est validée (traitée) => Fiche d'Autorisation de Dépense
  const isValidee = fiche.statut_validation === 'traitee'
  const docTitle  = isValidee ? "Fiche d'Autorisation de Dépense" : "Fiche d'Expression de Besoin"
  const totalAutorise = (lignes||[]).reduce((s,l)=>l.validation==='approuve'?s+Math.round(parseFloat(l.montant_autorise)||0):s,0)

  const totalTTC = lignes.reduce((s,l)=>{
    const pu=parseFloat(l.prix_unitaire)||0, qty=parseFloat(l.quantite)||0, tva=parseFloat(l.tva)||0
    return s + Math.round(pu*qty*(1+tva/100))
  },0)

  // Lignes demandées (toujours affichées)
  const lignesDemandeesHtml = lignes.map((l,i)=>{
    const pu=parseFloat(l.prix_unitaire)||0, qty=parseFloat(l.quantite)||0, tva=parseFloat(l.tva)||0
    const montant=Math.round(pu*qty*(1+tva/100))
    const sv=l.validation||'en_attente'
    const rowStyle=isValidee?(sv==='approuve'?'background:#f0fdf4':sv==='refuse'?'background:#fef2f2;opacity:0.6':'')  :''
    const badge=isValidee?(sv==='approuve'?'<span style="color:#16a34a;font-weight:700">✅</span>':sv==='refuse'?'<span style="color:#dc2626;font-weight:700">❌</span>':'<span style="color:#f59e0b">⏳</span>')  :''
    return `<tr style="${rowStyle}">
      <td>${l.numero_ordre||i+1}</td>
      <td>${l.description||''}${isValidee?' '+badge:''}</td>
      <td class="r">${qty}</td>
      <td class="r">${pu.toLocaleString('fr-FR')}</td>
      <td class="r">${tva}%</td>
      <td class="r">${montant.toLocaleString('fr-FR')}</td>
    </tr>`
  }).join('')

  // Lignes autorisées (uniquement pour Fiche Autorisation de Dépense)
  const lignesAutoriseeHtml = isValidee ? lignes.filter(l=>l.validation==='approuve').map((l,i)=>{
    const pu=parseFloat(l.prix_unitaire)||0, tva=parseFloat(l.tva)||0
    const qtyAut=parseFloat(l.quantite_autorisee||l.quantite)||0
    const montantAut=Math.round(parseFloat(l.montant_autorise)||0)
    return `<tr style="background:#f0fdf4">
      <td>${l.numero_ordre||i+1}</td>
      <td>${l.description||''}</td>
      <td class="r"><strong>${qtyAut}</strong></td>
      <td class="r">${pu.toLocaleString('fr-FR')}</td>
      <td class="r">${tva}%</td>
      <td class="r"><strong style="color:#16a34a">${montantAut.toLocaleString('fr-FR')}</strong></td>
    </tr>`
  }).join('') : ''

  const budgetsHtml = (fiche.codes_budget||[]).map(cb=>{
    const b=budgets.find(x=>x.id===cb)||{}
    return `<tr><td>${b.code||cb}</td><td>${b.libelle||'—'}</td><td class="r">${Math.round(b.montant||0).toLocaleString('fr-FR')} FCFA</td></tr>`
  }).join('')

  const css = CSS_PRINT + `
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; margin-bottom:14px; font-size:10pt; }
    .info-item { border-bottom:1px solid #ccc; padding:4px 0; }
    .info-label { font-size:8.5pt; color:#666; }
    .section-title { font-size:10pt; font-weight:700; text-transform:uppercase; color:#0f2044; border-bottom:2px solid #0f2044; padding-bottom:4px; margin:14px 0 8px; }
    .autorisation-badge { display:inline-block; background:#dcfce7; color:#16a34a; border:1px solid #bbf7d0; padding:4px 12px; border-radius:20px; font-size:9pt; font-weight:700; margin-top:6px; }
    .totals-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
    .total-box { padding:10px 14px; border-radius:6px; display:flex; justify-content:space-between; font-size:11pt; font-weight:700; }
  `

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${docTitle} ${fiche.reference||''}</title>
    <style>${css}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        ${companyInfo?.logo_url?`<img src="${companyInfo.logo_url}" class="company-logo" alt="logo" />`:''}
        <div class="company-name">${companyInfo?.raison_sociale||'ComptaPro'}</div>
        <div class="company-info">
          ${companyInfo?.rccm?`RCCM : ${companyInfo.rccm}<br>`:''}
          ${companyInfo?.adresse||''} ${companyInfo?.tel?`— Tél : ${companyInfo.tel}`:''}
        </div>
      </div>
      <div class="doc-title">
        <h1>${docTitle}</h1>
        <div class="doc-numero">Réf. ${fiche.reference||'—'}</div>
        <div class="doc-date">Date : ${fiche.date_fiche||'—'}</div>
        ${isValidee?'<div class="autorisation-badge">✅ VALIDÉE ET AUTORISÉE</div>':''}
      </div>
    </div>
    <div style="font-size:9pt;color:#555;font-style:italic;margin-bottom:10px">
      ${isValidee?'Cette fiche a été validée et autorisée par la direction.':'NB: La fiche doit être validée par le supérieur hiérarchique.'}
    </div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Réalisé par</div><strong>${fiche.realise_par||'—'}</strong></div>
      <div class="info-item"><div class="info-label">Direction d'exploitation</div><strong>${fiche.direction||'—'}</strong></div>
      <div class="info-item"><div class="info-label">Fonction</div><strong>${fiche.fonction||'—'}</strong></div>
      <div class="info-item"><div class="info-label">Référence</div><strong>${fiche.reference||'—'}</strong></div>
      <div class="info-item" style="grid-column:1/-1"><div class="info-label">Objet / Description</div><strong>${fiche.expression||'—'}</strong></div>
    </div>
    <div class="section-title">Lignes budgétaires concernées</div>
    <table><thead><tr><th>Code</th><th>Ligne budgétaire</th><th class="r">Montant</th></tr></thead>
    <tbody>${budgetsHtml||'<tr><td colspan="3" style="text-align:center;color:#999">Aucune ligne</td></tr>'}</tbody></table>

    <div class="section-title">${isValidee?'Détail des besoins exprimés':'Détail des besoins'}</div>
    <table><thead><tr style="background:#0f2044;color:white"><th>N°</th><th>Description</th><th class="r">Qté demandée</th><th class="r">Prix U.</th><th class="r">TVA</th><th class="r">Montant demandé</th></tr></thead>
    <tbody>${lignesDemandeesHtml||'<tr><td colspan="6" style="text-align:center;color:#999">Aucune ligne</td></tr>'}</tbody></table>

    ${isValidee&&lignesAutoriseeHtml?`
    <div class="section-title" style="color:#16a34a;border-color:#16a34a">✅ Lignes autorisées</div>
    <table><thead><tr style="background:#16a34a;color:white"><th>N°</th><th>Description</th><th class="r">Qté autorisée</th><th class="r">Prix U.</th><th class="r">TVA</th><th class="r">Montant autorisé</th></tr></thead>
    <tbody>${lignesAutoriseeHtml}</tbody></table>
    `:''}

    <div class="totals-grid">
      <div class="total-box" style="background:#f1f5f9;color:#0f2044">
        <span>TOTAL DEMANDÉ</span><span>${totalTTC.toLocaleString('fr-FR')} FCFA</span>
      </div>
      ${isValidee?`<div class="total-box" style="background:#dcfce7;color:#16a34a">
        <span>TOTAL AUTORISÉ</span><span>${totalAutorise.toLocaleString('fr-FR')} FCFA</span>
      </div>`:''}
    </div>

    <div class="signatures" style="margin-top:50px">
      <div class="sig-box">
        Signature de l'agent<br><small>${fiche.realise_par||''}</small>
        ${sigImg?`<img src="${sigImg}" style="max-width:100px;max-height:60px;margin-top:8px;display:block" />`:''}
      </div>
      <div class="sig-box">
        ${isValidee?"Signature d'autorisation":"Signature du gérant"}
        ${cachetImg?`<img src="${cachetImg}" style="max-width:120px;max-height:70px;margin-top:8px;display:block" />`:''}
      </div>
      <div class="sig-box">
        Visa du DG
        ${sigImg?`<img src="${sigImg}" style="max-width:100px;max-height:60px;margin-top:8px;display:block" />`:''}
      </div>
    </div>
    <div style="text-align:center;margin-top:30px;font-size:9pt;color:#888;font-style:italic">NOUS COMPTONS SUR VOTRE DISPONIBILITÉ !!!!</div>
  </body></html>`
  openPrintWindow(html)
}

function printPaiementEtuvage(row) {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${row.numero||'Paiement Étuvage'}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">REÇU DE PAIEMENT ÉTUVAGE</div>
        <div class="doc-numero" style="margin-top:4px">N° ${row.numero||'—'}</div>
      </div>
      <div class="doc-title">
        <div class="doc-date">Date : ${row.date_paiement}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead>
      <tbody>
        <tr><td>N° Lot</td><td class="r">${row.numero_lot||'—'}</td></tr>
        <tr><td>Étuveuse / Coopérative</td><td class="r">${row.etuveuse_cooperative||'—'}</td></tr>
        <tr><td>Quantité étuvée</td><td class="r">${(row.qte_etuvee_kg||0).toFixed(2)} kg</td></tr>
        <tr><td>Montant brut</td><td class="r">${Math.round(row.montant_brut||0).toLocaleString('fr-FR')} FCFA</td></tr>
        <tr><td>Taux AIB</td><td class="r">${((row.taux_aib||0)*100).toFixed(0)}%</td></tr>
        <tr><td style="color:#dc2626">Retenue AIB</td><td class="r" style="color:#dc2626">- ${Math.round(row.retenue_aib||0).toLocaleString('fr-FR')} FCFA</td></tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="ttc"><span>NET À PAYER</span><span>${Math.round(row.net_a_payer||0).toLocaleString('fr-FR')} FCFA</span></div>
    </div>
    <div style="margin-top:16px;font-size:10pt;color:#555">
      Mode de paiement : <strong>${row.mode_paiement||'—'}</strong>
      ${row.reference_paiement ? ` — Réf : ${row.reference_paiement}` : ''}
    </div>
    <div class="signatures">
      <div class="sig-box">Signature du payeur</div>
      <div class="sig-box">Signature de l'étuveuse<br><small>${row.etuveuse_cooperative||''}</small></div>
    </div>
  </body></html>`

  openPrintWindow(html)
}

function printReglement(row) {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Règlement ${row.numero_facture||''}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">REÇU DE RÈGLEMENT</div>
        ${row.numero_facture ? `<div class="doc-numero">Facture N° ${row.numero_facture}</div>` : ''}
      </div>
      <div class="doc-title"><div class="doc-date">Date : ${row.date_paiement}</div></div>
    </div>
    <table>
      <thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead>
      <tbody>
        <tr><td>Type</td><td class="r">${row.tiers_type==='client'?'Client':'Fournisseur'}</td></tr>
        <tr><td>Tiers</td><td class="r">${row.tiers_nom||'—'}</td></tr>
        ${row.entite ? `<tr><td>Entité</td><td class="r">${row.entite}</td></tr>` : ''}
        ${row.provenance ? `<tr><td>Provenance</td><td class="r">${row.provenance}</td></tr>` : ''}
        ${row.nature_produit ? `<tr><td>Nature produit</td><td class="r">${row.nature_produit}</td></tr>` : ''}
        <tr><td>Mode de paiement</td><td class="r">${row.mode_paiement||'—'}</td></tr>
        ${row.reference_paiement ? `<tr><td>Référence</td><td class="r">${row.reference_paiement}</td></tr>` : ''}
      </tbody>
    </table>
    <div class="totals">
      <div class="ttc"><span>MONTANT PAYÉ</span><span>${Math.round(row.montant_paye||0).toLocaleString('fr-FR')} FCFA</span></div>
      ${(row.solde||0)>0 ? `<div class="row" style="margin-top:4px"><span style="color:#dc2626">Solde restant</span><span style="color:#dc2626">${Math.round(row.solde||0).toLocaleString('fr-FR')} FCFA</span></div>` : ''}
    </div>
    <div class="signatures">
      <div class="sig-box">Signature du caissier</div>
      <div class="sig-box">Signature du ${row.tiers_type==='client'?'client':'fournisseur'}<br><small>${row.tiers_nom||''}</small></div>
    </div>
  </body></html>`

  openPrintWindow(html)
}

function printProductionStage(items, title, fields, companyName) {
  const headers = ['Date','N&deg; Lot',...fields.map(f=>f.label),'Responsable']
  const rows = (items||[]).map(it => {
    const cols = [
      it.date_etape||it.date_reception||'&mdash;',
      it.compta_lots_production?.numero_lot||it.numero_lot||'&mdash;',
      ...fields.map(f => {
        const val = it[f.name]
        if (f.type==='number') return (+(val||0)).toFixed(f.dec||2)+(f.unit?` ${f.unit}`:'')
        return val||'&mdash;'
      }),
      it.responsable_section||'&mdash;',
    ]
    return `<tr>${cols.map((c,i)=>`<td style="text-align:${i>1&&fields[i-2]?.type==='number'?'right':'left'}">${c}</td>`).join('')}</tr>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${CSS_PRINT_LANDSCAPE}
      body { font-size: 9.5pt; }
      h1 { font-size: 14pt; color: #0f2044; margin-bottom: 4px; }
      .subtitle { font-size: 10pt; color: #555; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
      table { font-size: 8.5pt; }
      th { font-size: 8pt; white-space: nowrap; padding: 6px 8px; }
      td { padding: 5px 8px; white-space: nowrap; }
    </style></head><body>
    <button class="print-btn" onclick="window.print()">Imprimer / PDF</button>
    <h1>${title}</h1>
    <div class="subtitle">${companyName||''} &mdash; ${(items||[]).length} enregistrement(s) &mdash; &Eacute;dit&eacute; le ${new Date().toLocaleDateString('fr-FR')}</div>
    <table>
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows||`<tr><td colspan="${headers.length}" style="text-align:center;color:#888;padding:20px">Aucun enregistrement</td></tr>`}</tbody>
    </table>
  </body></html>`

  openPrintWindow(html)
}

function useToast() {
  const [toasts, setToasts] = useState([])
  const add = (msg, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }
  return { toasts, success: m => add(m, 'success'), error: m => add(m, 'error') }
}
function Toasts({ toasts }) {
  return (
    <div style={{ position:'fixed', top:16, right:16, zIndex:9999, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type==='success'?'#dcfce7':'#fee2e2',
          color: t.type==='success'?'#16a34a':'#dc2626',
          border: `1px solid ${t.type==='success'?'#86efac':'#fca5a5'}`,
          borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:600,
          boxShadow:'0 4px 12px rgba(0,0,0,.1)', minWidth:260, maxWidth:400,
        }}>
          {t.type==='success'?'✓ ':'✕ '}{t.msg}
        </div>
      ))}
    </div>
  )
}

// ── SHARED UI ───────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
      <div>
        <h3 style={{ margin:0, fontSize:22, fontWeight:800, color:'#0f172a' }}>{title}</h3>
        {subtitle && <small style={{ color:'#64748b', fontSize:13 }}>{subtitle}</small>}
      </div>
      {actions && <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{actions}</div>}
    </div>
  )
}

function Card({ children, style={}, accent:ab }) {
  return (
    <div style={{ background:'white', borderRadius:12, border:'1px solid #e2e8f0', padding:28,
      borderLeft: ab?`4px solid ${ab}`:undefined, ...style }}>
      {children}
    </div>
  )
}

function SectionTitle({ children, color='#6b7280' }) {
  return (
    <div style={{ fontSize:12, fontWeight:700, color, textTransform:'uppercase', letterSpacing:.5,
      paddingBottom:8, borderBottom:'2px solid #f1f5f9', marginBottom:18 }}>
      {children}
    </div>
  )
}

function Btn({ onClick, variant='primary', sm, children, type='button', disabled, style:sx={} }) {
  const S = {
    primary:   { background:ACCENT,     color:'white', border:'none' },
    danger:    { background:'#dc2626',  color:'white', border:'none' },
    success:   { background:'#16a34a',  color:'white', border:'none' },
    warning:   { background:'#f59e0b',  color:'white', border:'none' },
    secondary: { background:'transparent', color:'#374151', border:'1px solid #d1d5db' },
    outline:   { background:'transparent', color:ACCENT, border:`1px solid ${ACCENT}` },
    info:      { background:'#0891b2',  color:'white', border:'none' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...S[variant]||S.primary, padding:sm?'6px 14px':'9px 18px',
      borderRadius:8, fontSize:sm?12:13, fontWeight:600, cursor:disabled?'not-allowed':'pointer',
      opacity:(disabled?0.6:1), display:'inline-flex', alignItems:'center', gap:6, ...sx,
    }}>
      {children}
    </button>
  )
}

// Transforme un texte en MAJUSCULES sans accents
function toUpperNoAccent(str) {
  return (str||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // retire les accents
    .toUpperCase()
}

function Input({ label, name, value, onChange, type='text', required, placeholder, min, step, readOnly }) {
  // Champs qui NE doivent PAS être transformés en majuscules
  const noUpper = type==='email' || type==='password' || type==='number' || type==='date' || type==='tel' || name==='email' || name==='mot_de_passe'
  const handleChange = (e) => {
    if (!noUpper && (type==='text' || !type)) {
      const transformed = toUpperNoAccent(e.target.value)
      // Conserver la position du curseur
      const pos = e.target.selectionStart
      e.target.value = transformed
      try { e.target.setSelectionRange(pos, pos) } catch {}
    }
    onChange(e)
  }
  return (
    <div>
      {label && <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#374151', marginBottom:5 }}>
        {label}{required&&' *'}
      </label>}
      <input type={type} name={name} value={value||''} onChange={handleChange}
        required={required} placeholder={placeholder} min={min} step={step} readOnly={readOnly}
        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #d1d5db',
          fontSize:13.5, boxSizing:'border-box', background:readOnly?'#f8fafc':'white' }} />
    </div>
  )
}

function Sel({ label, name, value, onChange, options, required }) {
  return (
    <div>
      {label && <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#374151', marginBottom:5 }}>
        {label}{required&&' *'}
      </label>}
      <select name={name} value={value||''} onChange={onChange} required={required}
        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #d1d5db',
          fontSize:13.5, background:'white' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Badge({ children, type='info' }) {
  const C = {
    success:   { bg:'#dcfce7', c:'#16a34a' },
    warning:   { bg:'#fef9c3', c:'#ca8a04' },
    info:      { bg:'#dbeafe', c:'#2563eb' },
    danger:    { bg:'#fee2e2', c:'#dc2626' },
    secondary: { bg:'#f1f5f9', c:'#64748b' },
  }
  const s = C[type]||C.info
  return <span style={{ background:s.bg, color:s.c, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>{children}</span>
}

function TH({ children, right }) {
  return (
    <th style={{ background:'#f8fafc', fontSize:11, fontWeight:700, letterSpacing:.5,
      textTransform:'uppercase', color:'#64748b', borderBottom:'1px solid #e2e8f0',
      padding:'12px 16px', textAlign:right?'right':'left', whiteSpace:'nowrap' }}>
      {children}
    </th>
  )
}
function TR({ children }) {
  return (
    <tr style={{ borderBottom:'1px solid #f1f5f9' }}
      onMouseEnter={e=>{ for(const c of e.currentTarget.cells) c.style.background='#f8fafc' }}
      onMouseLeave={e=>{ for(const c of e.currentTarget.cells) c.style.background='' }}>
      {children}
    </tr>
  )
}
function TD({ children, right, bold, color, sm }) {
  return (
    <td style={{ padding:'11px 16px', fontSize:sm?12:13.5, verticalAlign:'middle',
      textAlign:right?'right':'left', fontWeight:bold?700:400, color:color||'inherit' }}>
      {children}
    </td>
  )
}

function Modal({ open, onClose, title, children, size='md' }) {
  if (!open) return null
  const W = { sm:400, md:600, lg:820, xl:1040 }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:W[size],
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding:'16px 24px', borderBottom:'1px solid #e2e8f0', display:'flex',
          alignItems:'center', justifyContent:'space-between', position:'sticky',
          top:0, background:'white', zIndex:1 }}>
          <h5 style={{ margin:0, fontSize:16, fontWeight:700 }}>{title}</h5>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20,
            cursor:'pointer', color:'#94a3b8', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  )
}

function TableWrap({ children }) {
  return <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>{children}</div>
}
function Grid({ cols=2, gap=14, children, style={} }) {
  const { isMobile, isTablet } = useResponsive()
  const effectiveCols = isMobile ? 1 : isTablet ? Math.min(cols, 2) : cols
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${effectiveCols},1fr)`, gap, ...style }}>
      {children}
    </div>
  )
}
function Span2({ children }) {
  return <div style={{ gridColumn:'1 / -1' }}>{children}</div>
}
function Row({ children, style={} }) {
  return <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8, ...style }}>{children}</div>
}

// ── PERIOD FILTER — composant réutilisable ────────────────────────────────────
function PeriodFilter({ dateFrom, dateTo, onFrom, onTo, onReset }) {
  return (
    <Card style={{marginBottom:16,padding:'10px 16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <span style={{fontSize:12.5,fontWeight:700,color:'#374151',whiteSpace:'nowrap'}}>📅 Période :</span>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <label style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>Du</label>
          <input type="date" value={dateFrom} onChange={e=>onFrom(e.target.value)}
            style={{padding:'5px 9px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12.5}} />
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <label style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>Au</label>
          <input type="date" value={dateTo} onChange={e=>onTo(e.target.value)}
            style={{padding:'5px 9px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12.5}} />
        </div>
        {(dateFrom||dateTo) && (
          <Btn sm variant="secondary" onClick={onReset}>✕ Réinitialiser</Btn>
        )}
        {(dateFrom||dateTo) && (
          <span style={{fontSize:11,color:'#64748b',fontStyle:'italic'}}>
            Filtre actif{dateFrom&&dateTo?` : ${dateFrom} → ${dateTo}`:dateFrom?` : depuis ${dateFrom}`:` : jusqu'au ${dateTo}`}
          </span>
        )}
      </div>
    </Card>
  )
}

// ── PRINT FILTERED LIST — fonction générique ──────────────────────────────────
function printFilteredList({ title, subtitle='', headers, rows, companyName='', dateFrom='', dateTo='', totals=[] }) {
  const period = dateFrom||dateTo
    ? `Période : ${dateFrom||'—'} → ${dateTo||'—'}`
    : 'Toutes dates'
  const rowsHtml = rows.length > 0
    ? rows.map((r,i)=>`<tr>${r.map((c,j)=>`<td style="text-align:${headers[j]?.r?'right':'left'}">${c??'—'}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}" style="text-align:center;color:#888;padding:16px">Aucun enregistrement</td></tr>`
  const totalsHtml = totals.map(t=>`
    <div style="display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5pt">
      <span>${t.label}</span><strong>${t.value}</strong>
    </div>`).join('')
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${CSS_PRINT_LANDSCAPE}
      body { font-size: 9.5pt; }
      h1 { font-size: 14pt; color: #0f2044; margin-bottom: 3px; }
      .meta { font-size: 9.5pt; color: #555; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
      table { font-size: 8.5pt; }
      th { font-size: 8pt; white-space: nowrap; padding: 6px 8px; }
      td { padding: 5px 8px; white-space: nowrap; }
      .totals-wrap { margin-top: 16px; margin-left: auto; width: 320px; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
    </style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <h1>${title}</h1>
    <div class="meta">
      ${companyName ? `<strong>${companyName}</strong> &mdash; ` : ''}${period}
      &mdash; ${rows.length} enregistrement(s)
      &mdash; Édité le ${new Date().toLocaleDateString('fr-FR')}
      ${subtitle ? `<br>${subtitle}` : ''}
    </div>
    <table>
      <thead><tr>${headers.map(h=>`<th style="text-align:${h.r?'right':'left'}">${h.label}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    ${totals.length>0?`<div class="totals-wrap">${totalsHtml}</div>`:''}
  </body></html>`
  openPrintWindow(html)
}

// ── AUTH PAGES ──────────────────────────────────────────────────────────────

// ── ÉCRAN CHANGEMENT MOT DE PASSE (après reset) ──────────────────────────────
function PasswordChangePage({ onDone }) {
  const [pwd, setPwd]       = useState('')
  const [pwd2, setPwd2]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (pwd.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.')
    if (pwd !== pwd2)   return setError('Les mots de passe ne correspondent pas.')
    setSaving(true)
    const err = await onDone(pwd)
    if (err) setError(err)
    setSaving(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#1e3a5f,#2d6a4f)'}}>
      <div style={{background:'white',borderRadius:16,padding:'40px 36px',width:'100%',maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:40,marginBottom:8}}>🔐</div>
          <h2 style={{margin:0,fontSize:22,fontWeight:700,color:'#1e293b'}}>Créer votre mot de passe</h2>
          <p style={{margin:'8px 0 0',fontSize:13,color:'#64748b'}}>Définissez un nouveau mot de passe sécurisé pour votre compte.</p>
        </div>
        {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',marginBottom:16,color:'#dc2626',fontSize:13}}>{error}</div>}
        <form onSubmit={submit}>
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:13,fontWeight:600,color:'#374151',marginBottom:6}}>Nouveau mot de passe *</label>
            <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} required minLength={6}
              placeholder="Au moins 6 caractères"
              style={{width:'100%',padding:'10px 14px',border:'1px solid #d1d5db',borderRadius:8,fontSize:14,boxSizing:'border-box'}} />
          </div>
          <div style={{marginBottom:24}}>
            <label style={{display:'block',fontSize:13,fontWeight:600,color:'#374151',marginBottom:6}}>Confirmer le mot de passe *</label>
            <input type="password" value={pwd2} onChange={e=>setPwd2(e.target.value)} required
              placeholder="Retapez le mot de passe"
              style={{width:'100%',padding:'10px 14px',border:'1px solid #d1d5db',borderRadius:8,fontSize:14,boxSizing:'border-box'}} />
          </div>
          <button type="submit" disabled={saving}
            style={{width:'100%',padding:'12px',background:saving?'#94a3b8':'#2d6a4f',color:'white',border:'none',borderRadius:8,fontSize:15,fontWeight:600,cursor:saving?'not-allowed':'pointer'}}>
            {saving ? 'Enregistrement...' : '✓ Enregistrer mon mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}

function LoginPage({ onLogin }) {
  const [mode, setMode]       = useState('login') // 'login' | 'register' | 'forgot'
  const [form, setForm]       = useState({ email:'', password:'', nom:'', whatsapp:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const set = e => setForm(f=>({...f,[e.target.name]:e.target.value}))

  const submitLogin = async e => {
    e.preventDefault(); setLoading(true); setError('')
    const { data, error:err } = await supabase.auth.signInWithPassword({ email:form.email, password:form.password })
    setLoading(false)
    if (err) { setError('Identifiants incorrects'); return }
    onLogin(data.user)
  }

  const submitForgot = async e => {
    e.preventDefault(); setLoading(true); setError('')
    const { error:err } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: window.location.origin
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSuccess('Un lien de réinitialisation a été envoyé à ' + form.email + '. Vérifiez votre boîte mail.')
    setMode('login')
  }

  const submitRegister = async e => {
    e.preventDefault(); setLoading(true); setError('')
    // Validation numéro WhatsApp
    const wa = form.whatsapp.replace(/\D/g,'')
    if (wa.length < 8) { setError('Numéro WhatsApp invalide (minimum 8 chiffres)'); setLoading(false); return }
    const { data, error:err } = await supabase.auth.signUp({ email:form.email, password:form.password })
    if (err) { setError(err.message); setLoading(false); return }
    // Mettre à jour le profil avec nom + whatsapp
    if (data?.user?.id) {
      await new Promise(r=>setTimeout(r,1200)) // attendre le trigger DB
      await supabase.from('compta_profiles').update({ nom:form.nom, whatsapp:wa }).eq('id', data.user.id)
    }
    setLoading(false)
    setSuccess('Compte créé ! En attente de validation par l\'administrateur.')
    setMode('login')
    setForm({ email:'', password:'', nom:'', whatsapp:'' })
  }

  const inp = (label, name, type='text', placeholder='', required=false, extra={}) => (
    <div style={{marginBottom:16}}>
      <label style={{display:'block',fontSize:12.5,fontWeight:700,color:'#374151',marginBottom:6}}>
        {label}{required&&<span style={{color:'#dc2626'}}>*</span>}
      </label>
      <input type={type} name={name} value={form[name]} onChange={set} required={required} placeholder={placeholder} {...extra}
        style={{width:'100%',padding:'11px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:14,boxSizing:'border-box'}} />
    </div>
  )

  const panel = (
    <div style={{width:'40%',background:'linear-gradient(160deg,#1d4ed8,#2563eb)',padding:'48px 40px',color:'white',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
      <div>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:32}}>
          <div style={{width:52,height:52,background:'rgba(255,255,255,.15)',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>📊</div>
          <div><div style={{fontSize:22,fontWeight:800}}>Compta Pro</div><div style={{fontSize:12,opacity:.75}}>Gestion Commerciale & Stock</div></div>
        </div>
        {['Gestion multi-sociétés','Documents commerciaux','Stocks & Production riz','Clients & Fournisseurs','Paiements & Règlements'].map(f=>(
          <div key={f} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,fontSize:13.5,opacity:.85}}>
            <span style={{color:'#93c5fd'}}>✓</span>{f}
          </div>
        ))}
      </div>
      <div>
        <div style={{fontSize:12,opacity:.7,marginBottom:8}}>Besoin d'aide ? Contactez l'admin :</div>
        <a href={`https://wa.me/${SUPER_ADMIN_WHATSAPP}?text=Bonjour, j'ai besoin d'aide pour Compta Pro`}
          target="_blank" rel="noopener noreferrer"
          style={{display:'inline-flex',alignItems:'center',gap:8,background:'#25d366',color:'white',padding:'8px 16px',borderRadius:20,fontSize:12,fontWeight:700,textDecoration:'none'}}>
          <span style={{fontSize:16}}>📱</span> WhatsApp Admin
        </a>
        <div style={{fontSize:11,opacity:.4,marginTop:12}}>© Compta Pro — Bénin</div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0f2044,#1a3a6e)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{display:'flex',width:'100%',maxWidth:860,borderRadius:20,overflow:'hidden',boxShadow:'0 30px 80px rgba(0,0,0,.4)'}}>
        {window.innerWidth >= 640 && panel}
        <div style={{flex:1,background:'white',padding:'40px 32px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
          <h3 style={{margin:'0 0 6px',fontSize:24,fontWeight:800,color:'#0f172a'}}>
            {mode==='login'?'Connexion':mode==='register'?'Créer un compte':'Mot de passe oublié'}
          </h3>
          <p style={{margin:'0 0 20px',color:'#64748b',fontSize:13.5}}>
            {mode==='login'?'Accédez à votre espace de gestion'
             :mode==='register'?'Votre compte sera activé par l\'administrateur'
             :'Entrez votre email pour recevoir un lien de réinitialisation'}
          </p>
          {error   && <div style={{background:'#fee2e2',color:'#dc2626',padding:'10px 14px',borderRadius:10,marginBottom:16,fontSize:13}}>{error}</div>}
          {success && <div style={{background:'#dcfce7',color:'#16a34a',padding:'10px 14px',borderRadius:10,marginBottom:16,fontSize:13}}>{success}</div>}
          <form onSubmit={mode==='login'?submitLogin:mode==='register'?submitRegister:submitForgot}>
            {mode==='register' && inp('Nom complet','nom','text','Votre nom complet',true)}
            {inp('Email','email','email','votre@email.bj',true)}
            {mode==='register' && (
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:12.5,fontWeight:700,color:'#374151',marginBottom:6}}>
                  Numéro WhatsApp <span style={{color:'#dc2626'}}>*</span>
                  <span style={{fontWeight:400,color:'#64748b',marginLeft:6}}>(ex: 0197777777)</span>
                </label>
                <div style={{display:'flex',alignItems:'center',border:'1.5px solid #e2e8f0',borderRadius:10,overflow:'hidden'}}>
                  <span style={{padding:'11px 12px',background:'#f8fafc',borderRight:'1px solid #e2e8f0',fontSize:14,color:'#374151',whiteSpace:'nowrap'}}>📱 +229</span>
                  <input type="tel" name="whatsapp" value={form.whatsapp} onChange={set} required placeholder="97000000"
                    style={{flex:1,padding:'11px 14px',border:'none',fontSize:14,outline:'none'}} />
                </div>
              </div>
            )}
            {mode!=='forgot' && inp('Mot de passe','password','password','••••••••',true,{minLength:6})}
            {mode==='login' && (
              <div style={{textAlign:'right',marginTop:-8,marginBottom:14}}>
                <span onClick={()=>{setMode('forgot');setError('');setSuccess('')}}
                  style={{fontSize:12.5,color:ACCENT,cursor:'pointer',fontWeight:600}}>
                  Mot de passe oublié ?
                </span>
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{width:'100%',background:ACCENT,color:'white',border:'none',borderRadius:10,padding:12,fontSize:15,fontWeight:700,cursor:'pointer',opacity:(loading?0.7:1)}}>
              {loading?'Chargement...'
                :mode==='login'?'→ Se connecter'
                :mode==='register'?'→ Créer mon compte'
                :'📧 Envoyer le lien de réinitialisation'}
            </button>
          </form>
          <div style={{marginTop:20,textAlign:'center',fontSize:13,color:'#64748b'}}>
            {mode==='login' && (
              <span>Pas encore de compte ? <span onClick={()=>{setMode('register');setError('');setSuccess('')}} style={{color:ACCENT,cursor:'pointer',fontWeight:600}}>{"S'inscrire"}</span></span>
            )}
            {mode==='register' && (
              <span>{"Déjà un compte ?"} <span onClick={()=>{setMode('login');setError('');setSuccess('')}} style={{color:ACCENT,cursor:'pointer',fontWeight:600}}>Se connecter</span></span>
            )}
            {mode==='forgot' && (
              <span>
                <span onClick={()=>{setMode('login');setError('');setSuccess('')}}
                  style={{color:ACCENT,cursor:'pointer',fontWeight:600}}>
                  ← Retour à la connexion
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PendingPage({ onLogout }) {
  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:16, padding:'48px 40px', maxWidth:480, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,.1)' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>⏳</div>
        <h2 style={{ margin:'0 0 12px', color:'#0f172a' }}>Compte en attente</h2>
        <p style={{ color:'#64748b', fontSize:14, lineHeight:1.6, marginBottom:24 }}>
          Votre compte a été créé avec succès. L'administrateur doit valider votre accès avant que vous puissiez utiliser l'application.
        </p>
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#1d4ed8', marginBottom:24 }}>
          📧 Vous recevrez une notification une fois votre compte activé.
        </div>
        <button onClick={onLogout} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 24px', fontSize:13, cursor:'pointer', fontWeight:600, color:'#374151' }}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

// ── GESTION UTILISATEURS (Super Admin) ───────────────────────────────────────
function UsersManagementPage({ toast }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const load = useCallback(async()=>{
    setLoading(true)
    const { data } = await supabase.from('compta_profiles').select('*').order('created_at', { ascending:false })
    setUsers(data||[]); setLoading(false)
  },[])

  useEffect(()=>{ load() },[load])

  const updateStatut = async (id, statut) => {
    const { error } = await supabase.from('compta_profiles').update({ statut }).eq('id', id)
    if (error) { toast.error(error.message); return }
    const msgs = { active:'✅ Compte activé !', suspended:'🚫 Compte suspendu.', pending:'⏳ Compte remis en attente.' }
    toast.success(msgs[statut]||'Mis à jour.'); load()
  }

  const updateRole = async (id, role) => {
    await supabase.from('compta_profiles').update({ role }).eq('id', id)
    toast.success('Rôle mis à jour !'); load()
  }

  const formatDate = dt => {
    if (!dt) return null
    const d = new Date(dt)
    const now = new Date()
    const diffMin = Math.floor((now - d) / 60000)
    const diffH   = Math.floor(diffMin / 60)
    const diffD   = Math.floor(diffH / 24)
    if (diffMin < 2)  return { label: '🟢 En ligne',           color:'#16a34a', recent:true }
    if (diffMin < 60) return { label: `🟡 Il y a ${diffMin} min`, color:'#ca8a04', recent:true }
    if (diffH < 24)   return { label: `🔵 Aujourd'hui ${d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`, color:'#2563eb', recent:false }
    if (diffD < 2)    return { label: `⚪ Hier ${d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`,        color:'#64748b', recent:false }
    return { label: d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}), color:'#94a3b8', recent:false }
  }

  const renderLastLogin = (dt) => {
    const info = formatDate(dt)
    if (!info) return <span style={{fontSize:11,color:'#94a3b8',fontStyle:'italic'}}>Jamais connecté</span>
    return <span style={{fontSize:11,color:info.color,fontWeight:info.recent?700:400}}>{info.label}</span>
  }

  const openWhatsApp = (whatsapp, nom) => {
    if (!whatsapp) { toast.error('Numéro WhatsApp non renseigné pour cet utilisateur.'); return }
    const num = whatsapp.replace(/\D/g,'')
    const intl = num.startsWith('229') ? num : '229'+num
    const msg = encodeURIComponent(`Bonjour ${nom||''},\n\nMessage de l'administrateur Compta Pro.`)
    window.open(`https://wa.me/${intl}?text=${msg}`, '_blank')
  }

  const STATUT_STYLE = {
    pending:   { bg:'#fef9c3', c:'#ca8a04', label:'En attente', icon:'⏳' },
    active:    { bg:'#dcfce7', c:'#16a34a', label:'Actif',      icon:'✅' },
    suspended: { bg:'#fee2e2', c:'#dc2626', label:'Suspendu',   icon:'🚫' },
  }

  const filtered = users.filter(u =>
    !search || (u.email+' '+(u.nom||'')).toLowerCase().includes(search.toLowerCase())
  )

  const pending = users.filter(u=>u.statut==='pending').length

  return (
    <div>
      <PageHeader title="Gestion des utilisateurs" subtitle={`${users.length} compte(s) — ${pending} en attente`}
        actions={
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'6px 12px',fontSize:11,color:'#374151'}}>
              📱 Mon WA Admin : <strong>+{SUPER_ADMIN_WHATSAPP}</strong>
            </div>
            <a href={`https://wa.me/${SUPER_ADMIN_WHATSAPP}`} target="_blank" rel="noopener noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:6,background:'#25d366',color:'white',padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,textDecoration:'none'}}>
              📱 Tester mon WA
            </a>
          </div>
        } />

      {/* Alerte comptes en attente */}
      {pending > 0 && (
        <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10,fontSize:13,color:'#92400e'}}>
          <span style={{fontSize:18}}>⚠️</span>
          <span><strong>{pending} compte(s)</strong> en attente de validation</span>
        </div>
      )}

      {/* Barre de recherche */}
      <Card style={{marginBottom:16,padding:'10px 16px'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher par email ou nom..."
          style={{padding:'8px 14px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13,width:320}} />
      </Card>

      {loading ? <div style={{padding:24}}>Chargement...</div> : (
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
            <thead><tr>
              <TH>Email</TH><TH>Nom</TH><TH>WhatsApp</TH><TH>Rôle</TH>
              <TH>Statut</TH><TH>Inscrit le</TH><TH>Dernière connexion</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {filtered.map(u => {
                const s = STATUT_STYLE[u.statut] || STATUT_STYLE.pending
                const isSelf = u.email === SUPER_ADMIN_EMAIL
                const isActive = u.statut === 'active'
                return (
                  <TR key={u.id}>
                    <TD bold sm>{u.email}</TD>
                    <TD>{u.nom||'—'}</TD>
                    <TD>
                      {u.whatsapp ? (
                        <span style={{fontFamily:'monospace',fontSize:12,color:'#374151'}}>
                          +229 {u.whatsapp.replace(/^229/,'')}
                        </span>
                      ) : (
                        <span style={{color:'#dc2626',fontSize:11,fontStyle:'italic'}}>Non renseigné</span>
                      )}
                    </TD>
                    <TD>
                      {isSelf ? (
                        <span style={{background:'#fef3c7',color:'#d97706',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>👑 Super Admin</span>
                      ) : (
                        <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)}
                          style={{padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12}}>
                          <option value="user">Utilisateur simple</option>
                          <option value="admin_societe">Admin Société</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      )}
                    </TD>
                    <TD>
                      <span style={{background:s.bg,color:s.c,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>
                        {s.icon} {s.label}
                      </span>
                    </TD>
                    <TD sm>{u.created_at?.slice(0,10)||'—'}</TD>
                    <TD sm>{renderLastLogin(u.last_login_at)}</TD>
                    <TD>
                      {!isSelf && (
                        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                          {/* Toggle Activer/Désactiver */}
                          {isActive ? (
                            <Btn sm variant="danger" onClick={()=>updateStatut(u.id,'suspended')}>
                              🚫 Désactiver
                            </Btn>
                          ) : (
                            <Btn sm variant="success" onClick={()=>updateStatut(u.id,'active')}>
                              ✅ Activer
                            </Btn>
                          )}
                          {/* WhatsApp */}
                          <button onClick={()=>openWhatsApp(u.whatsapp, u.nom)}
                            style={{background:u.whatsapp?'#25d366':'#e2e8f0',color:u.whatsapp?'white':'#94a3b8',border:'none',padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:600,cursor:u.whatsapp?'pointer':'not-allowed',display:'flex',alignItems:'center',gap:4}}>
                            📱 WA
                          </button>
                        </div>
                      )}
                      {isSelf && <span style={{fontSize:11,color:'#94a3b8',fontStyle:'italic'}}>Votre compte</span>}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SIDEBAR ─────────────────────────────────────────────────────────────────
const NAV = [
  { section:'Principal' },
  { id:'dashboard',          icon:'🏠', label:'Tableau de bord' },
  { id:'chat',               icon:'💬', label:'Messagerie' },
  { section:'Référentiel' },
  { id:'companies',          icon:'🏢', label:'Sociétés' },
  { id:'clients',            icon:'👥', label:'Clients' },
  { id:'fournisseurs',       icon:'🚚', label:'Fournisseurs' },
  { section:'Stock' },
  { id:'stock',              icon:'📦', label:'Articles & Stock' },
  { id:'mouvements',         icon:'↕️',  label:'Mouvements' },
  { id:'inventaire',         icon:'📋', label:'Inventaire' },
  { section:'Commercial' },
  { id:'commercial',         icon:'📄', label:'Documents' },
  { id:'reglements_clients',   icon:'💳', label:'Règlements Clients' },
  { id:'reglements_fourn',     icon:'💸', label:'Règlements Fournisseurs' },
  { id:'prestations',        icon:'🛠️',  label:'Prestations' },
  { section:'Production' },
  { id:'suivi_lot',          icon:'🔎', label:'Suivi de lot' },
  { id:'lots',               icon:'🏭', label:'Lots Production' },
  { id:'etuvage',            icon:'🔥', label:'Étuvage' },
  { id:'decorticage',        icon:'⚙️',  label:'Décorticage' },
  { id:'calibrage',          icon:'📐', label:'Calibrage' },
  { id:'tri_optique',        icon:'🔍', label:'Tri optique' },
  { id:'conditionnement',    icon:'🎁', label:'Conditionnement' },
  { section:'Étuveuses' },
  { id:'etv_repertoire',  icon:'👩', label:'Répertoire' },
  { id:'etv_avances',     icon:'💰', label:'Avances' },
  { id:'etv_bc',          icon:'📋', label:'Bons de Commande' },
  { id:'etv_br',          icon:'✅', label:'Bons de Réception' },
  { id:'etv_entrees',     icon:'📥', label:'Entrées Magasin' },
  { id:'etv_sorties',     icon:'📤', label:'Sorties Magasin' },
  { id:'etv_inventaire',  icon:'📊', label:'Inventaire' },
  { id:'etv_tresorerie',  icon:'💼', label:'Trésorerie' },
  { section:'Achats' },
  { id:'achats',             icon:'🛒', label:'Achats semi-finis' },
  { id:'lots_semi_finis',    icon:'📦', label:'Lots Semi-finis' },
  { id:'epierrage',          icon:'🪨', label:'Épierrage' },
  { id:'etuvage_paiements',  icon:'💰', label:'Paiements étuvage' },
  { section:'Documents' },
  { id:'docs_admin',         icon:'📁', label:'Documents administratifs' },
  { section:'Comptabilité' },
  { id:'journal_caisse',     icon:'🏦', label:'Journal Caisse' },
  { id:'journal_banque',     icon:'🏛️',  label:'Journal Banque' },
  { id:'journal_mobile',     icon:'📱', label:'Journal Mobile Money' },
  { id:'plan_comptable',     icon:'📒', label:'Plan Comptable' },
  { id:'grand_livre',        icon:'📚', label:'Grand-Livre' },
  { id:'controle_budget',    icon:'📊', label:'Contrôle Budgétaire' },
]

const NAV_ADMIN = [
  { section:'Administration' },
  { id:'users',              icon:'👤', label:'Utilisateurs' },
  { id:'mes_utilisateurs',   icon:'👥', label:'Mes utilisateurs' },
  { id:'parametres',         icon:'⚙️', label:'Paramètres' },
]

const NAV_ADMIN_SOCIETE = [
  { section:'Administration' },
  { id:'mes_utilisateurs',   icon:'👥', label:'Mes utilisateurs' },
  { id:'parametres',         icon:'⚙️', label:'Paramètres' },
]

function Sidebar({ page, setPage, user, profile, onLogout, open, onClose }) {
  const { isMobile, isTablet, isLandscape, isMobileLandscape } = useResponsive()
  // En paysage sur mobile : sidebar visible en mode compact
  const collapsed = isMobile || isMobileLandscape  // sidebar overlay en portrait ET paysage mobile
  const isSuperAdmin = profile?.role === 'super_admin' || user?.email === SUPER_ADMIN_EMAIL
  const isAdminSociete = profile?.role === 'admin_societe' || profile?.role === 'admin'
  const isUtilisateurSimple = profile?.role === 'utilisateur_simple'
  const permissions = profile?.permissions || {}

  // Filter NAV based on permissions for utilisateur_simple
  const filteredNAV = isUtilisateurSimple
    ? NAV.filter(item => !item.id || item.id==='chat' || item.id==='dashboard' || (permissions[item.id] === 'read' || permissions[item.id] === 'write'))
    : NAV

  const navItems = isSuperAdmin
    ? [...NAV, ...NAV_ADMIN]
    : isAdminSociete
    ? [...NAV, ...NAV_ADMIN_SOCIETE]
    : filteredNAV

  const handleNav = (id) => { setPage(id); if (onClose) onClose() }

  return (
    <>
      {collapsed && open && (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999 }} />
      )}
      <nav style={{
        position:'fixed', top:0, left:0, height:'100vh', width:260,
        background:SIDEBAR, display:'flex', flexDirection:'column', zIndex:1000,
        transform: collapsed ? (open ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
        transition:'transform .3s ease',
      }}>
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, background:ACCENT, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📊</div>
            <div>
              <div style={{ color:'white', fontWeight:700, fontSize:14 }}>Compta Pro</div>
              {isSuperAdmin
                ? <div style={{ color:'#fbbf24', fontSize:10, fontWeight:600 }}>👑 Super Admin</div>
                : <div style={{ color:'rgba(255,255,255,.5)', fontSize:10 }}>Gestion & Stock</div>}
            </div>
          </div>
          {collapsed && <span onClick={onClose} style={{ color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:20, lineHeight:1 }}>✕</span>}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'12px 0' }}>
          {navItems.map((item,i) => {
            if (item.section) return (
              <div key={i} style={{ padding:'8px 16px 4px', fontSize:10, fontWeight:700, letterSpacing:1.2, color:'rgba(255,255,255,.35)', textTransform:'uppercase' }}>{item.section}</div>
            )
            const active = page===item.id
            return (
              <div key={item.id} onClick={()=>handleNav(item.id)} style={{
                display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
                color:active?'white':'rgba(255,255,255,.7)', cursor:'pointer',
                background:active?ACCENT:'transparent', fontSize:13.5, fontWeight:active?600:500,
                borderLeft:active?'3px solid #60a5fa':'3px solid transparent',
              }}>
                <span style={{ width:20, textAlign:'center', fontSize:14 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </div>
        <div style={{ padding:'14px 20px', borderTop:'1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, background:isSuperAdmin?'#f59e0b':ACCENT, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:13, flexShrink:0 }}>
              {(user?.email||'U')[0].toUpperCase()}
            </div>
            <div style={{ flex:1, overflow:'hidden' }}>
              <div style={{ color:'white', fontSize:11, fontWeight:600, textOverflow:'ellipsis', overflow:'hidden', whiteSpace:'nowrap' }}>{user?.email}</div>
              <div style={{ color:'rgba(255,255,255,.4)', fontSize:10 }}>
                {isSuperAdmin?'Super Admin ⭐':isAdminSociete?'Admin Société 🏢':isUtilisateurSimple?'Utilisateur 👤':'Administrateur'}
              </div>
              <div style={{ color:'rgba(255,255,255,.3)', fontSize:9 }}>{APP_VERSION}</div>
            </div>
            <span onClick={onLogout} style={{ color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:14 }} title="Déconnexion">🚪</span>
          </div>
        </div>
      </nav>
    </>
  )
}

function CompanySelector({ companies, companyId, setCompanyId }) {
  return (
    <select value={companyId||''} onChange={e=>setCompanyId(e.target.value)}
      style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:13, maxWidth:220 }}>
      <option value="">Toutes les sociétés</option>
      {companies.map(c=><option key={c.id} value={c.id}>{c.raison_sociale}</option>)}
    </select>
  )
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ companyId, toast, setPage }) {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    const load = async ()=>{
      setLoading(true)
      const { data:ad } = await supabase.auth.getUser()
      const uid = ad?.user?.id
      const isAdmin = ad?.user?.email === SUPER_ADMIN_EMAIL
      if (!uid) { setLoading(false); return }
      // Quand companyId est fourni (admin consultant une société ou user normal),
      // filtrer par company_id uniquement pour voir les données de cette société
      const base = (tbl) => {
        let q = supabase.from(tbl).select('id',{count:'exact',head:true})
        if (companyId) q = q.eq('company_id', companyId)
        else q = q.eq('user_id', uid)
        return q
      }
      const docsQ = () => {
        let q = supabase.from('compta_documents').select('id,numero,type_doc,date_doc,montant_ttc,montant_paye,statut').order('created_at',{ascending:false}).limit(6)
        if (isAdmin && companyId) q = q.eq('company_id', companyId)
        else if (companyId) q = q.eq('user_id', uid).eq('company_id', companyId)
        else q = q.eq('user_id', uid)
        return q
      }
      const alertesQ = () => {
        let q = supabase.from('compta_articles').select('stock_actuel,stock_min').eq('actif',true)
        if (companyId) q = q.eq('company_id', companyId)
        else q = q.eq('user_id', uid)
        return q
      }
      const [cli,fou,art,docs,lots,alerteRes] = await Promise.all([
        base('compta_clients').eq('actif',true),
        base('compta_fournisseurs').eq('actif',true),
        base('compta_articles').eq('actif',true),
        docsQ(),
        base('compta_lots_production').eq('statut','en_cours'),
        alertesQ(),
      ])
      const alertes = (alerteRes.data||[]).filter(a=>(a.stock_actuel||0)<=(a.stock_min||0)).length
      setStats({ nb_clients:cli.count||0, nb_fournisseurs:fou.count||0, nb_articles:art.count||0, lots_en_cours:lots.count||0, alertes, recent_docs:docs.data||[] })
      setLoading(false)
    }
    load()
  },[companyId])

  const { isMobile, isTablet } = useResponsive()
  const statCols = isMobile ? 2 : isTablet ? 3 : 6

  if (loading) return <div style={{padding:24}}>Chargement...</div>
  if (!stats) return null

  const cards = [
    {icon:'👥',bg:'#dbeafe',c:'#2563eb',label:'Clients',v:stats.nb_clients,p:'clients'},
    {icon:'🚚',bg:'#fef9c3',c:'#ca8a04',label:'Fournisseurs',v:stats.nb_fournisseurs,p:'fournisseurs'},
    {icon:'📦',bg:'#dcfce7',c:'#16a34a',label:'Articles',v:stats.nb_articles,p:'stock'},
    {icon:'⚠️',bg:'#fee2e2',c:'#dc2626',label:'Alertes stock',v:stats.alertes,p:'stock'},
    {icon:'🏭',bg:'#fff7ed',c:'#ea580c',label:'Lots en cours',v:stats.lots_en_cours,p:'lots'},
    {icon:'📄',bg:'#f5f3ff',c:'#7c3aed',label:'Docs récents',v:stats.recent_docs.length,p:'commercial'},
  ]

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble Compta Pro" />
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${statCols},1fr)`, gap:12, marginBottom:24 }}>
        {cards.map(c=>(
          <div key={c.label} onClick={()=>setPage(c.p)} style={{ background:'white', borderRadius:12, padding:'16px 20px', border:'1px solid #e2e8f0', cursor:'pointer' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:c.bg, color:c.c, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>{c.icon}</div>
              <span style={{ fontSize:11, color:'#64748b', fontWeight:500 }}>{c.label}</span>
            </div>
            <div style={{ fontSize:22, fontWeight:800 }}>{c.v}</div>
          </div>
        ))}
      </div>
      {stats.recent_docs.length>0 && (
        <Card>
          <SectionTitle>Derniers documents commerciaux</SectionTitle>
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              {['N° Document','Type','Date',{l:'Montant TTC',r:true},'Statut'].map((h,i)=>(
                <TH key={i} right={h?.r}>{h?.l||h}</TH>
              ))}
            </tr></thead>
            <tbody>
              {stats.recent_docs.map(d=>(
                <TR key={d.id}>
                  <TD bold>{d.numero}</TD>
                  <TD><Badge type="info">{TYPE_DOC_LABELS[d.type_doc]||d.type_doc}</Badge></TD>
                  <TD>{d.date_doc}</TD>
                  <TD right bold>{fcfa(d.montant_ttc)}</TD>
                  <TD><Badge type={STATUT_COLORS[d.statut]||'secondary'}>{d.statut}</Badge></TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── COMPANIES ────────────────────────────────────────────────────────────────
function CompaniesPage({ companies, refresh, toast, isSuperAdmin=false, currentUserId=null }) {
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({})
  const [saving,setSaving]= useState(false)
  const set = e => setForm(f=>({...f,[e.target.name]:e.target.value}))

  // Vérifie si la société appartient à l'utilisateur courant
  const isOwn = c => !c || c.user_id === currentUserId

  const open = (c=null) => {
    if (!c && !isSuperAdmin && companies.length >= 1) {
      toast.error('Vous ne pouvez créer qu\'une seule société. Contactez l\'administrateur pour plus.')
      return
    }
    // Super admin ne peut modifier que ses propres sociétés
    if (c && isSuperAdmin && !isOwn(c)) {
      toast.error('Vous ne pouvez pas modifier la société d\'un autre utilisateur.')
      return
    }
    setForm(c?{...c}:{raison_sociale:'',rccm:'',adresse:'',tel:'',email:'',logo_url:'',type_activite:'industrielle'})
    setModal(c?'edit':'add')
  }
  const close = () => setModal(null)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const pay = { raison_sociale:form.raison_sociale, rccm:form.rccm, adresse:form.adresse, tel:form.tel, email:form.email, logo_url:form.logo_url||null, type_activite:form.type_activite||'industrielle' }
    const { error } = modal==='add'
      ? await supabase.from('compta_companies').insert({...pay,user_id:uid})
      : await supabase.from('compta_companies').update(pay).eq('id',form.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(modal==='add'?'Société ajoutée !':'Société mise à jour !'); close(); refresh()
  }

  const del = async c => {
    if (!isOwn(c)) { toast.error('Vous ne pouvez pas supprimer la société d\'un autre utilisateur.'); return }
    if (!confirm('Supprimer cette société ?')) return
    const { error } = await supabase.from('compta_companies').delete().eq('id',c.id)
    if (error) { toast.error(error.message); return }
    toast.success('Société supprimée.'); refresh()
  }

  return (
    <div>
      <PageHeader title="Sociétés" subtitle={`${companies.length} société(s)`}
        actions={<Btn onClick={()=>open()}>+ Nouvelle Société</Btn>} />
      {companies.length===0 ? (
        <Card style={{textAlign:'center',padding:'48px 24px'}}>
          <div style={{fontSize:48,marginBottom:12}}>🏢</div>
          <p style={{color:'#64748b'}}>Aucune société enregistrée.</p>
          <Btn onClick={()=>open()}>+ Créer ma première société</Btn>
        </Card>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns: companies.length===0?'1fr':`repeat(${Math.min(companies.length,3)},1fr)`, gap:16 }}>
          {companies.map(c=>(
            <Card key={c.id}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <div style={{ width:48, height:48, background: isOwn(c)?'#dbeafe':'#f1f5f9', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color: isOwn(c)?ACCENT:'#94a3b8', fontWeight:800, fontSize:20, overflow:'hidden' }}>
                  {c.logo_url ? <img src={c.logo_url} alt="logo" style={{width:'100%',height:'100%',objectFit:'contain',borderRadius:12}} /> : c.raison_sociale[0]}
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{c.raison_sociale}</div>
                  {c.rccm&&<div style={{fontSize:12,color:'#64748b'}}>{c.rccm}</div>}
                  {isSuperAdmin && <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:10,background: isOwn(c)?'#dbeafe':'#f1f5f9', color: isOwn(c)?'#2563eb':'#64748b'}}>{isOwn(c)?'✅ Votre société':'👁️ Autre utilisateur'}</span>}
                </div>
              </div>
              {c.adresse && <div style={{fontSize:12.5,color:'#64748b',marginBottom:4}}>📍 {c.adresse}</div>}
              {c.tel     && <div style={{fontSize:12.5,color:'#64748b',marginBottom:4}}>📞 {c.tel}</div>}
              {c.email   && <div style={{fontSize:12.5,color:'#64748b',marginBottom:12}}>✉️ {c.email}</div>}
              <div style={{display:'flex',gap:8,marginTop:12}}>
                {isOwn(c) && <Btn sm variant="secondary" onClick={()=>open(c)}>Modifier</Btn>}
                {isOwn(c) && <Btn sm variant="danger" onClick={()=>del(c)}>🗑️</Btn>}
                {!isOwn(c) && <span style={{fontSize:11,color:'#94a3b8',fontStyle:'italic'}}>Lecture seule</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!modal} onClose={close} title={modal==='add'?'Nouvelle Société':'Modifier la Société'}>
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Span2><Input label="Raison sociale" name="raison_sociale" value={form.raison_sociale} onChange={set} required /></Span2>
            <Input label="RCCM" name="rccm" value={form.rccm} onChange={set} />
            <Input label="Téléphone" name="tel" value={form.tel} onChange={set} />
            <Span2><Input label="Adresse" name="adresse" value={form.adresse} onChange={set} /></Span2>
            <Input label="Email" name="email" type="email" value={form.email} onChange={set} />
            <Sel label="Type d'activité (pour l'IS)" name="type_activite" value={form.type_activite||'industrielle'} onChange={set}
              options={[{value:'industrielle',label:'Industrielle (IS 25%)'},{value:'commerciale',label:'Commerciale (IS 30%)'}]} />
            <Span2>
              <div style={{marginBottom:4}}>
                <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:6}}>Logo de l'entreprise</label>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  {form.logo_url && <img src={form.logo_url} alt="logo" style={{width:60,height:60,objectFit:'contain',borderRadius:8,border:'1px solid #e2e8f0'}} />}
                  <div>
                    <input type="file" accept="image/*" id="logo-upload" style={{display:'none'}}
                      onChange={e=>{
                        const file=e.target.files[0]; if(!file) return
                        if(file.size>500000){alert("Image trop lourde. Max 500 Ko."); return}
                        const reader=new FileReader()
                        reader.onload=ev=>setForm(f=>({...f,logo_url:ev.target.result}))
                        reader.readAsDataURL(file)
                      }}
                    />
                    <label htmlFor="logo-upload" style={{cursor:'pointer',padding:'8px 16px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,fontWeight:500,display:'inline-block'}}>
                      📷 {form.logo_url ? 'Changer le logo' : 'Importer un logo'}
                    </label>
                    {form.logo_url && <button type="button" onClick={()=>setForm(f=>({...f,logo_url:''}))} style={{marginLeft:8,background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:12}}>✕ Supprimer</button>}
                    <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>PNG, JPG — max 500 Ko. Le logo apparaîtra sur tous les documents imprimés.</div>
                  </div>
                </div>
              </div>
            </Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── TIERS GENERIQUE (Clients + Fournisseurs partagent la même logique) ───────
// ── FICHE FOURNISSEUR (PDF) ──────────────────────────────────────────────────
function printFicheTiers(it, kind='fournisseur') {
  const isFourn = kind==='fournisseur'
  const titreFiche = isFourn ? 'FICHE FOURNISSEUR' : 'FICHE CLIENT'
  const labelTiers = isFourn ? 'fournisseur' : 'client'
  const v = x => (x===null || x===undefined || x==='') ? '—' : x
  const isMorale = it.type==='morale'
  const nomAffiche = isMorale ? (it.nom_societe||'—') : (it.nom||'—')
  const societe = it.compta_companies?.raison_sociale || 'Compta Pro'
  const superficie = it.superficie_bas_fonds ? `${it.superficie_bas_fonds} ha` : '—'
  const fname = `fiche_${labelTiers}_${(nomAffiche||'').replace(/\s+/g,'_')}`

  const rows = arr => arr.map(([k,val])=>`<tr><td style="font-weight:600;width:42%">${k}</td><td class="r" style="text-align:left">${v(val)}</td></tr>`).join('')

  // Libellés lisibles pour les colonnes connues
  const LABELS = {
    type:'Type de personne', nom:'Nom et prénom(s)', prenom:'Prénom', nom_societe:'Raison sociale',
    telephone:'Téléphone', email:'Email', adresse:'Adresse', provenance:'Provenance',
    cooperative_affiliee:'Coopérative affiliée', numero_contrat:'N° Contrat', ifu:'N° IFU', cip:'N° CIP',
    mentor_nom:'Mentor — Nom', mentor_telephone:'Mentor — Téléphone', mentor_cip:'Mentor — CIP',
    departement:'Département', commune:'Commune', arrondissement:'Arrondissement', village:'Village',
    nom_bas_fonds:'Nom du bas-fonds', superficie_bas_fonds:'Superficie (ha)',
  }
  // Colonnes déjà affichées dans les sections ci-dessus + colonnes techniques à ne pas montrer
  const SKIP = new Set([
    'id','user_id','company_id','actif','archive','created_at','updated_at','compta_companies',
    'type','nom','prenom','nom_societe','telephone','email','adresse','provenance',
    'cooperative_affiliee','numero_contrat','ifu','cip',
    'mentor_nom','mentor_telephone','mentor_cip',
    'departement','commune','arrondissement','village','nom_bas_fonds','superficie_bas_fonds',
  ])
  const prettify = k => (LABELS[k] || k.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()))

  // Bloc dynamique : toute autre colonne de la table non listée ci-dessus
  const autres = Object.keys(it)
    .filter(k => !SKIP.has(k))
    .map(k => [prettify(k), typeof it[k]==='object' ? JSON.stringify(it[k]) : it[k]])
  const autresBloc = autres.length ? `
    <h3 style="margin:18px 0 6px;font-size:11pt;color:#075E54">🗂️ Autres informations</h3>
    <table><tbody>${rows(autres)}</tbody></table>` : ''

  const mentorBloc = (isFourn && !isMorale) ? `
    <h3 style="margin:18px 0 6px;font-size:11pt;color:#075E54">👤 Informations du mentor</h3>
    <table><tbody>${rows([
      ['Nom et prénom(s)', it.mentor_nom],
      ['Téléphone', it.mentor_telephone],
      ['N° CIP', it.mentor_cip],
    ])}</tbody></table>` : ''

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${fname}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">${titreFiche}</div>
        <div class="doc-numero" style="margin-top:4px">${societe}</div>
      </div>
      <div class="doc-title">
        <div class="doc-date">Édité le : ${today()}</div>
      </div>
    </div>

    <h3 style="margin:6px 0 6px;font-size:11pt;color:#075E54">${isFourn?'🚚':'👥'} Identité</h3>
    <table><tbody>${rows([
      ['Type de personne', isMorale ? 'Personne morale' : 'Personne physique'],
      [isMorale ? 'Raison sociale' : 'Nom et prénom(s)', nomAffiche],
      ...(isMorale ? [['Représentant', it.nom]] : []),
      ['Téléphone', it.telephone],
      ['Email', it.email],
      ['Adresse', it.adresse],
      ['Provenance', it.provenance],
      ...(isFourn ? [['Coopérative affiliée', it.cooperative_affiliee], ['N° Contrat', it.numero_contrat]] : []),
      ['N° IFU', it.ifu],
      ['N° CIP', it.cip],
    ])}</tbody></table>

    ${mentorBloc}

    ${isFourn ? `
    <h3 style="margin:18px 0 6px;font-size:11pt;color:#075E54">📍 Localisation & bas-fonds</h3>
    <table><tbody>${rows([
      ['Département', it.departement],
      ['Commune', it.commune],
      ['Arrondissement', it.arrondissement],
      ['Village', it.village],
      ['Nom du bas-fonds', it.nom_bas_fonds],
      ['Superficie', superficie],
    ])}</tbody></table>` : ''}

    ${autresBloc}

    <div class="signatures" style="margin-top:50px">
      <div class="sig-box">Signature du ${labelTiers}</div>
      <div class="sig-box">Cachet & visa<br><small>${societe}</small></div>
    </div>
  </body></html>`

  openPrintWindow(html, fname)
}

// ── PLAN COMPTABLE ───────────────────────────────────────────────────────────
const COLLECTIF_FOURNISSEUR = '4011'
const COLLECTIF_CLIENT      = '4111'

// Numéros déjà présents sous un compte collectif (depuis le plan comptable)
async function numerosSousCompte(collectif, cid) {
  const { data:ad } = await supabase.auth.getUser()
  const uid = ad?.user?.id; const isAdmin = ad?.user?.email===SUPER_ADMIN_EMAIL
  let q = supabase.from('compta_plan_comptable').select('numero').like('numero', collectif+'%')
  if (isAdmin) { if (cid) q = q.eq('company_id', cid) }
  else { q = q.eq('user_id', uid); if (cid) q = q.eq('company_id', cid) }
  const { data } = await q
  return (data||[]).map(r=>String(r.numero))
}

// Prochain sous-compte = collectif + (plus grande séquence existante + 1)
function prochainSousCompte(collectif, numeros) {
  const seqs = (numeros||[])
    .filter(n => n.startsWith(collectif) && n.length > collectif.length)
    .map(n => parseInt(n.slice(collectif.length),10))
    .filter(n => !isNaN(n))
  const max = seqs.length ? Math.max(...seqs) : 0
  return collectif + (max + 1)
}

// S'assure que le compte collectif existe dans le plan comptable
async function assurerCollectif(collectif, libelle, cid, uid) {
  let q = supabase.from('compta_plan_comptable').select('id').eq('numero', collectif)
  if (cid) q = q.eq('company_id', cid)
  const { data } = await q
  if (!data || data.length===0)
    await supabase.from('compta_plan_comptable').insert({ company_id:cid, user_id:uid, numero:collectif, libelle, est_collectif:true })
}

// Attribue un sous-compte à un tiers : crée le collectif au besoin, génère le numéro,
// l'inscrit au plan comptable, le pose sur la fiche, et le renvoie.
async function attribuerCompteTiers({ tableTiers, tiersId, collectif, libelleCollectif, libelleCompte, cid, uid }) {
  await assurerCollectif(collectif, libelleCollectif, cid, uid)
  const nums = await numerosSousCompte(collectif, cid)
  const numero = prochainSousCompte(collectif, nums)
  await supabase.from('compta_plan_comptable').insert({ company_id:cid, user_id:uid, numero, libelle:libelleCompte||'', est_collectif:false })
  if (tableTiers && tiersId) await supabase.from(tableTiers).update({ numero_compte:numero }).eq('id', tiersId)
  return numero
}

function TiersPage({ table, title, titleSingle, icon, companies, companyId, toast, extraFields, readOnly=false }) {
  const [items,      setItems]     = useState([])
  const [modal,      setModal]     = useState(null)
  const [form,       setForm]      = useState({})
  const [saving,     setSaving]    = useState(false)
  const [search,     setSearch]    = useState('')
  const [filterType, setFilterType]= useState('')   // clients: physique|morale
  const [filterProv, setFilterProv]= useState('')   // provenance

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from(table).select('*,compta_companies(raison_sociale)').eq('actif',true).order('created_at',{ascending:false})
    // Fix: quand une société est sélectionnée (super admin ou user), filtrer par company_id
    // sinon fallback sur user_id
    if (companyId) q = q.eq('company_id', companyId)
    else q = q.eq('user_id', uid)
    const { data } = await q; setItems(data||[])
  },[table,companyId])

  useEffect(()=>{ load() },[load])

  // Supprimer toute la liste (fournisseurs uniquement)
  const deleteAll = async()=>{
    const cid = companyId || companies[0]?.id
    if(!cid){ toast.error('Aucune société sélectionnée.'); return }
    if(items.length===0){ toast.error('La liste est déjà vide.'); return }
    if(!confirm(`⚠️ Supprimer DÉFINITIVEMENT les ${items.length} fournisseur(s) de la liste ? Cette action est irréversible.`)) return
    if(!confirm('Confirmez-vous une dernière fois la suppression totale ?')) return
    const { error } = await supabase.from(table).delete().eq('company_id', cid)
    if(error){ toast.error(error.message); return }
    toast.success('Liste supprimée.'); load()
  }

  const provenances = [...new Set(items.map(i=>i.provenance).filter(Boolean))]

  const filtered = items.filter(it => {
    if (search) {
      const s = (it.nom||'')+' '+(it.prenom||'')+' '+(it.nom_societe||'')
      if (!s.toLowerCase().includes(search.toLowerCase())) return false
    }
    if (filterType && it.type !== filterType) return false
    if (filterProv && it.provenance !== filterProv) return false
    return true
  })

  const set = e => setForm(f=>({...f,[e.target.name]:e.target.value}))

  const baseDefaults = { company_id:companyId||companies[0]?.id||'', nom:'', prenom:'', nom_societe:'', telephone:'', provenance:'', cip:'', ifu:'', email:'', adresse:'', mentor_nom:'', mentor_telephone:'', mentor_cip:'', departement:'', commune:'', arrondissement:'', village:'', nom_bas_fonds:'', superficie_bas_fonds:'', cooperative_affiliee:'', numero_contrat:'' }
  const open = (it=null) => {
    const defaults = extraFields ? extraFields.defaults : {}
    setForm(it?{...it}:{...baseDefaults,...defaults}); setModal(it?'edit':'add')
  }
  const close = ()=>setModal(null)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const isPhysique = (form.type||'physique')!=='morale'
    const mentorFields = table==='compta_fournisseurs' && isPhysique ? ['mentor_nom','mentor_telephone','mentor_cip'] : []
    const locFields = table==='compta_fournisseurs' ? ['departement','commune','arrondissement','village','nom_bas_fonds','superficie_bas_fonds','cooperative_affiliee','numero_contrat'] : []
    const fields = ['company_id','nom','telephone','provenance','cip','ifu','email','adresse', ...mentorFields, ...locFields, ...(extraFields?.names||[])]
    const pay = {}; fields.forEach(k=>{ if(form[k]!==undefined) pay[k]=form[k] })
    // Fix: ensure company_id is a valid non-empty value
    if (!pay.company_id) {
      const prof = (await supabase.from('compta_profiles').select('company_id').eq('id', uid).single()).data
      const cid = companyId || prof?.company_id || companies[0]?.id
      if (!cid) { toast.error('Veuillez sélectionner une société avant d\'enregistrer.'); setSaving(false); return }
      pay.company_id = cid
    }
    if (table==='compta_clients' || table==='compta_fournisseurs') {
      pay.type = form.type||'physique'
      if (form.type==='morale') pay.nom_societe = form.nom_societe||''
    }
    if (modal==='add') {
      const { data:ins, error } = await supabase.from(table).insert({...pay,user_id:uid}).select('id').single()
      if (error) { setSaving(false); toast.error(error.message); return }
      // Attribution automatique du numéro de compte (fournisseur 4011… / client 4111…)
      if (table==='compta_fournisseurs' || table==='compta_clients') {
        const isFourn = table==='compta_fournisseurs'
        const libelleCompte = form.type==='morale' ? (form.nom_societe||'') : (form.nom||'')
        try {
          await attribuerCompteTiers({
            tableTiers:table, tiersId:ins.id,
            collectif: isFourn?COLLECTIF_FOURNISSEUR:COLLECTIF_CLIENT,
            libelleCollectif: isFourn?'Fournisseurs':'Clients',
            libelleCompte, cid:pay.company_id, uid,
          })
        } catch(_) {}
      }
      setSaving(false)
      toast.success(`${titleSingle} enregistré(e) !`); close(); load(); return
    }
    const { error } = await supabase.from(table).update(pay).eq('id',form.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(`${titleSingle} enregistré(e) !`); close(); load()
  }

  const archive = async id => {
    if (!confirm(`Archiver ce(tte) ${titleSingle} ?`)) return
    await supabase.from(table).update({actif:false}).eq('id',id)
    toast.success('Archivé.'); load()
  }

  const displayName = it => (table==='compta_clients' || table==='compta_fournisseurs')
    ? (it.type==='morale' ? it.nom_societe : (it.nom||''))
    : (it.nom||'')

  // ── IMPORT / EXPORT CSV (fournisseurs & clients) ──────────────────────────
  const [importing, setImporting] = useState(false)
  const canImport = table==='compta_fournisseurs' || table==='compta_clients'

  const downloadTemplate = () => {
    const headers = ['type','nom','nom_societe','telephone','provenance','cooperative_affiliee','numero_contrat','cip','ifu','email','adresse','mentor_nom','mentor_telephone','mentor_cip','departement','commune','arrondissement','village','nom_bas_fonds','superficie_bas_fonds']
    const ex1 = ['physique','HAYA Martin','','22997000000','Tanguiéta','Coop PINGOU','CTR-2026-001','','3202012190967','martin@exemple.com','BP 707','KOUDORO Jean','22995000000','CIP9988','Atacora','Tanguiéta','Cotiakou','Pingou','Bas-fonds Pingou','2.5']
    const ex2 = ['morale','','SARL EXEMPLE','22996000000','Natitingou','','','','3201998877665','contact@exemple.com','Cotonou','','','','','','','','','']
    const csv = [headers.join(';'), ex1.join(';'), ex2.join(';')].join('\n')
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `modele_import_${titleSingle.toLowerCase()}s.csv`
    a.click(); URL.revokeObjectURL(url)
    toast.success('Modèle téléchargé !')
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if(!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.replace(/^\ufeff/,'').split(/\r?\n/).filter(l=>l.trim())
      if(lines.length<2){ toast.error('Fichier vide ou sans données'); setImporting(false); return }
      const delim = lines[0].includes(';') ? ';' : ','
      const headers = lines[0].split(delim).map(h=>h.trim().toLowerCase())
      const uid = (await supabase.auth.getUser()).data?.user?.id
      const prof = (await supabase.from('compta_profiles').select('company_id').eq('id',uid).single()).data
      const cid = companyId || prof?.company_id || companies[0]?.id
      if(!cid){ toast.error('Aucune société active'); setImporting(false); return }

      const rows = []
      for(let i=1;i<lines.length;i++){
        const vals = lines[i].split(delim).map(v=>v.trim())
        const obj = {}
        headers.forEach((h,idx)=>{ obj[h]=vals[idx]||'' })
        // Validation minimale
        const t = (obj.type||'physique').toLowerCase()
        if(t==='morale' && !obj.nom_societe){ continue }
        if(t!=='morale' && !obj.nom){ continue }
        rows.push({
          company_id: cid, user_id: uid,
          type: t==='morale'?'morale':'physique',
          nom: obj.nom||null,
          nom_societe: obj.nom_societe||null,
          telephone: obj.telephone||null, provenance: obj.provenance||null,
          cip: obj.cip||null, ifu: obj.ifu||null,
          email: obj.email||null, adresse: obj.adresse||null,
          mentor_nom: obj.mentor_nom||null,
          mentor_telephone: obj.mentor_telephone||null,
          mentor_cip: obj.mentor_cip||null,
          ...(table==='compta_fournisseurs' ? {
            cooperative_affiliee: obj.cooperative_affiliee||null,
            numero_contrat: obj.numero_contrat||null,
            departement: obj.departement||null,
            commune: obj.commune||null,
            arrondissement: obj.arrondissement||null,
            village: obj.village||null,
            nom_bas_fonds: obj.nom_bas_fonds||null,
            superficie_bas_fonds: obj.superficie_bas_fonds ? parseFloat(obj.superficie_bas_fonds.replace(',','.'))||null : null,
          } : {})
        })
      }
      if(rows.length===0){ toast.error('Aucune ligne valide trouvée'); setImporting(false); return }
      const { data:insRows, error } = await supabase.from(table).insert(rows).select('id,type,nom,nom_societe')
      if(error){ toast.error('Erreur import : '+error.message); setImporting(false); return }
      // Attribution automatique des numéros de compte (séquentiel)
      if (table==='compta_fournisseurs' || table==='compta_clients') {
        const isFourn = table==='compta_fournisseurs'
        const collectif = isFourn?COLLECTIF_FOURNISSEUR:COLLECTIF_CLIENT
        await assurerCollectif(collectif, isFourn?'Fournisseurs':'Clients', cid, uid)
        let nums = await numerosSousCompte(collectif, cid)
        for (const r of (insRows||[])) {
          const numero = prochainSousCompte(collectif, nums)
          const lib = r.type==='morale' ? (r.nom_societe||'') : (r.nom||'')
          await supabase.from('compta_plan_comptable').insert({ company_id:cid, user_id:uid, numero, libelle:lib, est_collectif:false })
          await supabase.from(table).update({ numero_compte:numero }).eq('id', r.id)
          nums.push(numero)
        }
      }
      toast.success(`${rows.length} ${titleSingle.toLowerCase()}(s) importé(s) !`)
      load()
    } catch(err) {
      toast.error('Erreur lecture fichier : '+err.message)
    }
    setImporting(false)
    e.target.value = ''
  }

  // Export Excel + PDF de la liste (clients & fournisseurs) — dispo aussi en lecture seule (super admin)
  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale || ''
  const isFourn = table==='compta_fournisseurs'

  const tiersVal = (it,c) => ({
    'Type': it.type==='morale'?'Société':'Physique',
    'Nom': displayName(it),
    'Téléphone': it.telephone||'',
    'Provenance': it.provenance||'',
    'Coopérative': it.cooperative_affiliee||'',
    'N° Contrat': it.numero_contrat||'',
    'N° IFU': it.ifu||'',
    'N° CIP': it.cip||'',
    'Email': it.email||'',
    'Adresse': it.adresse||'',
    'Département': it.departement||'',
    'Commune': it.commune||'',
    'Arrondissement': it.arrondissement||'',
    'Village': it.village||'',
    'Bas-fonds': it.nom_bas_fonds||'',
    'Superficie (ha)': it.superficie_bas_fonds||'',
  }[c] ?? '')

  const exportExcelTiers = () => {
    const cols = [
      'Type','Nom','Téléphone','Provenance',
      ...(isFourn?['Coopérative','N° Contrat']:[]),
      'N° IFU','N° CIP','Email','Adresse',
      ...(isFourn?['Département','Commune','Arrondissement','Village','Bas-fonds','Superficie (ha)']:[]),
    ]
    const thead = cols.map(c=>`<th style="background:#0f2044;color:white;padding:6px 10px;white-space:nowrap">${c}</th>`).join('')
    const tbody = filtered.map((it,i)=>`<tr style="background:${i%2===0?'#f8fafc':'white'}">${cols.map(c=>`<td>${tiersVal(it,c)}</td>`).join('')}</tr>`).join('')
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"><style>
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #d1d5db;padding:5px 8px;font-size:10pt}
        h2{font-family:Arial;color:#0f2044}p{font-family:Arial;font-size:9pt;color:#555}
      </style></head><body>
      <h2>${title}</h2>
      <p>${companyName} — ${filtered.length} enregistrement(s) — Exporté le ${new Date().toLocaleDateString('fr-FR')}</p>
      <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
      </body></html>`
    const blob = new Blob(['\uFEFF'+html], {type:'application/vnd.ms-excel;charset=utf-8'})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href=url; a.download=`${title.toLowerCase().replace(/\s/g,'_')}.xls`; a.click()
    URL.revokeObjectURL(url)
  }

  const printListeTiers = () => {
    const headers = [
      {label:'Type'},{label:'Nom'},{label:'Téléphone'},{label:'Provenance'},
      ...(isFourn?[{label:'Coopérative'},{label:'N° Contrat'}]:[]),
      {label:'IFU'},{label:'CIP'},
    ]
    const rows = filtered.map(it=>[
      it.type==='morale'?'Société':'Physique',
      displayName(it),
      it.telephone||'—',
      it.provenance||'—',
      ...(isFourn?[it.cooperative_affiliee||'—', it.numero_contrat||'—']:[]),
      it.ifu||'—',
      it.cip||'—',
    ])
    printFilteredList({ title, companyName, headers, rows })
  }

  return (
    <div>
      <PageHeader title={title} subtitle={`${filtered.length} enregistrement(s)`}
        actions={(
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {items.length>0 && (
              <>
                <Btn sm variant="info" onClick={printListeTiers}>🖨️ PDF liste</Btn>
                <Btn sm variant="success" onClick={exportExcelTiers}>📊 Excel</Btn>
              </>
            )}
            {!readOnly && (
              <>
            {canImport && (
              <>
                <button onClick={downloadTemplate} title="Télécharger le modèle CSV"
                  style={{padding:'9px 14px',background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:600,color:'#475569',display:'flex',alignItems:'center',gap:6}}>
                  📥 Modèle
                </button>
                <label style={{padding:'9px 14px',background:'#dcfce7',border:'1px solid #86efac',borderRadius:8,cursor:importing?'wait':'pointer',fontSize:13,fontWeight:600,color:'#15803d',display:'flex',alignItems:'center',gap:6}}>
                  {importing?'⏳ Import…':'📤 Importer CSV'}
                  <input type="file" accept=".csv" onChange={handleImport} disabled={importing} style={{display:'none'}} />
                </label>
              </>
            )}
            {table==='compta_fournisseurs' && items.length>0 && (
              <button onClick={deleteAll} title="Supprimer toute la liste"
                style={{padding:'9px 14px',background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:600,color:'#dc2626',display:'flex',alignItems:'center',gap:6}}>
                🗑️ Vider la liste
              </button>
            )}
            <Btn onClick={()=>open()}>+ Nouveau(elle)</Btn>
              </>
            )}
          </div>
        )} />
      <Card style={{marginBottom:16,padding:'12px 20px'}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher par nom..."
            style={{padding:'8px 14px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13,flex:1,minWidth:180}} />
          {(table==='compta_clients'||table==='compta_fournisseurs') && (
            <select value={filterType} onChange={e=>setFilterType(e.target.value)}
              style={{padding:'8px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13,background:'white'}}>
              <option value=''>Tous types</option>
              <option value='physique'>Personne physique</option>
              <option value='morale'>Personne morale</option>
            </select>
          )}
          {provenances.length > 0 && (
            <select value={filterProv} onChange={e=>setFilterProv(e.target.value)}
              style={{padding:'8px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13,background:'white'}}>
              <option value=''>Toutes provenances</option>
              {provenances.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {(search||filterType||filterProv) && (
            <button onClick={()=>{setSearch('');setFilterType('');setFilterProv('')}}
              style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,cursor:'pointer',background:'#f8fafc',color:'#64748b'}}>
              ✕ Réinitialiser
            </button>
          )}
          <span style={{fontSize:12,color:'#94a3b8',marginLeft:'auto'}}>{filtered.length} / {items.length}</span>
        </div>
      </Card>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
            <div style={{fontSize:40,marginBottom:8}}>{icon}</div>
            <p>Aucun(e) {titleSingle}</p>
            {!readOnly && <Btn onClick={()=>open()}>+ Ajouter</Btn>}
          </div>
        ) : (
          <TableWrap>
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              {(table==='compta_clients'||table==='compta_fournisseurs') && <TH>Type</TH>}
              <TH>Nom</TH><TH>Téléphone</TH><TH>Provenance</TH>
              {extraFields?.headers?.map((h,i)=><TH key={i}>{h}</TH>)}
              <TH>IFU</TH><TH>CIP</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {filtered.map(it=>(
                <TR key={it.id}>
                  {(table==='compta_clients'||table==='compta_fournisseurs') && <TD><Badge type={it.type==='morale'?'info':'success'}>{it.type==='morale'?'Société':'Physique'}</Badge></TD>}
                  <TD bold>{displayName(it)}</TD>
                  <TD>{it.telephone||'—'}</TD>
                  <TD>{it.provenance||'—'}</TD>
                  {extraFields?.names?.map(k=><TD key={k}>{it[k]||'—'}</TD>)}
                  <TD sm>{it.ifu||'—'}</TD>
                  <TD sm>{it.cip||'—'}</TD>
                  <TD>
                    <div style={{display:'flex',gap:6}}>
                      <Btn sm variant="info" onClick={()=>printFicheTiers(it, isFourn?'fournisseur':'client')}>📥 PDF</Btn>
                      {!readOnly && <Btn sm variant="secondary" onClick={()=>open(it)}>Edit</Btn>}
                      {!readOnly && <Btn sm variant="danger" onClick={()=>archive(it.id)}>🗑️</Btn>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
          </TableWrap>
        )}
      </div>
      <Modal open={!!modal} onClose={close} title={modal==='add'?`Nouveau(elle) ${titleSingle}`:`Modifier ${titleSingle}`} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            {(table==='compta_clients'||table==='compta_fournisseurs') && (
              <Sel label="Type de personne" name="type" value={form.type||'physique'} onChange={set}
                options={[{value:'physique',label:'👤 Personne physique'},{value:'morale',label:'🏢 Personne morale'}]} />
            )}
            {(table==='compta_clients'||table==='compta_fournisseurs') && (form.type||'physique')==='morale' ? (
              <Span2><Input label="Raison sociale *" name="nom_societe" value={form.nom_societe||''} onChange={set} required /></Span2>
            ) : (
              <Span2><Input label="Nom et Prénom(s) *" name="nom" value={form.nom||''} onChange={set} required /></Span2>
            )}
            {(table==='compta_fournisseurs') && (form.type||'physique')==='morale' && (
              <Span2><Input label="Nom et Prénom(s) du représentant" name="nom" value={form.nom||''} onChange={set} /></Span2>
            )}
            <Input label="Téléphone" name="telephone" value={form.telephone} onChange={set} />
            <Input label="Provenance" name="provenance" value={form.provenance} onChange={set} />
            {table==='compta_fournisseurs' && <Input label="Coopérative affiliée" name="cooperative_affiliee" value={form.cooperative_affiliee||''} onChange={set} />}
            {table==='compta_fournisseurs' && <Input label="N° Contrat" name="numero_contrat" value={form.numero_contrat||''} onChange={set} />}
            {extraFields?.fields?.map(f=>(
              <Input key={f.name} label={f.label} name={f.name} value={form[f.name]} onChange={set} />
            ))}
            <Input label="N° IFU" name="ifu" value={form.ifu} onChange={set} />
            <Input label="N° CIP" name="cip" value={form.cip} onChange={set} />
            {(table==='compta_clients'||table==='compta_fournisseurs') && (
              <div>
                <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>N° Compte</label>
                <div style={{padding:'9px 12px',background:'#f8fafc',borderRadius:8,border:'1px solid #d1d5db',fontSize:13.5,minHeight:38,display:'flex',alignItems:'center',color:form.numero_compte?'#0f2044':'#94a3b8',fontWeight:form.numero_compte?700:400}}>
                  {form.numero_compte || 'Attribué automatiquement à l\u2019enregistrement'}
                </div>
              </div>
            )}
            <Input label="Email" name="email" type="email" value={form.email} onChange={set} />
            <Input label="Adresse" name="adresse" value={form.adresse} onChange={set} />
            {table==='compta_fournisseurs' && (form.type||'physique')!=='morale' && (
              <>
                <Span2><div style={{borderTop:'1px solid #e2e8f0',paddingTop:10,marginTop:4,fontSize:12,fontWeight:700,color:'#64748b'}}>👤 INFORMATIONS DU MENTOR (facultatif)</div></Span2>
                <Span2><Input label="Nom et Prénom(s) du mentor" name="mentor_nom" value={form.mentor_nom||''} onChange={set} /></Span2>
                <Input label="Téléphone du mentor" name="mentor_telephone" value={form.mentor_telephone||''} onChange={set} />
                <Input label="CIP du mentor" name="mentor_cip" value={form.mentor_cip||''} onChange={set} />
              </>
            )}
            {table==='compta_fournisseurs' && (
              <>
                <Span2><div style={{borderTop:'1px solid #e2e8f0',paddingTop:10,marginTop:4,fontSize:12,fontWeight:700,color:'#64748b'}}>📍 LOCALISATION & BAS-FONDS</div></Span2>
                <Input label="Département" name="departement" value={form.departement||''} onChange={set} />
                <Input label="Commune" name="commune" value={form.commune||''} onChange={set} />
                <Input label="Arrondissement" name="arrondissement" value={form.arrondissement||''} onChange={set} />
                <Input label="Village" name="village" value={form.village||''} onChange={set} />
                <Input label="Nom du bas-fonds" name="nom_bas_fonds" value={form.nom_bas_fonds||''} onChange={set} />
                <Input label="Superficie bas-fonds (ha)" name="superficie_bas_fonds" type="number" value={form.superficie_bas_fonds||''} onChange={set} />
              </>
            )}
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── STOCK — ARTICLES ─────────────────────────────────────────────────────────
function StockPage({ companies, companyId, setPage, toast, readOnly=false }) {
  const [articles, setArticles] = useState([])
  const [modal,   setModal]    = useState(null)
  const [form,    setForm]     = useState({})
  const [saving,  setSaving]   = useState(false)
  const [catFilter,setCat]     = useState('')

  const load = useCallback(async()=>{
    const { data:ad } = await supabase.auth.getUser()
    const uid = ad?.user?.id; const isAdmin = ad?.user?.email === SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_articles').select('*,compta_companies(raison_sociale)').eq('actif',true).order('designation')
    if (isAdmin && companyId) q = q.eq('company_id', companyId)
    else if (companyId) q = q.eq('user_id', uid).eq('company_id', companyId)
    else q = q.eq('user_id', uid)
    if (catFilter) q=q.eq('categorie',catFilter)
    const { data } = await q; setArticles(data||[])
  },[companyId,catFilter])

  useEffect(()=>{ load() },[load])

  const valeur = articles.reduce((s,a)=>s+(a.stock_actuel||0)*(a.prix_achat||0),0)
  const set = e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',code:'',designation:'',categorie:'riz_paddy',unite:'kg',prix_achat:0,prix_vente:0,stock_min:0,stock_actuel:0}); setModal('add') }
  const openEdit = a=>{ setForm({...a, company_id: a.company_id||companyId||companies[0]?.id||''}); setModal('edit') }
  const close = ()=>setModal(null)

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { company_id,code,designation,categorie,unite,prix_achat,prix_vente,stock_min,stock_actuel } = form
    const pay = { company_id,code,designation,categorie,unite,prix_achat:+prix_achat,prix_vente:+prix_vente,stock_min:+stock_min }
    const { error } = modal==='add'
      ? await supabase.from('compta_articles').insert({...pay,stock_actuel:+stock_actuel,user_id:uid})
      : await supabase.from('compta_articles').update(pay).eq('id',form.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Article enregistré !'); close(); load()
  }

  const archive = async id=>{ if(!confirm('Supprimer cet article ?')) return; await supabase.from('compta_articles').update({actif:false}).eq('id',id); toast.success('Article supprimé.'); load() }

  return (
    <div>
      <PageHeader title="Articles & Stock" subtitle={`Valeur totale : ${fcfa(valeur)}`}
        actions={<>
          <Btn sm variant="success" onClick={()=>setPage('stock-entree')}>↓ Entrée</Btn>
          <Btn sm variant="warning" onClick={()=>setPage('stock-sortie')}>↑ Sortie</Btn>
          <Btn sm variant="secondary" onClick={()=>setPage('mouvements')}>↕ Mouvements</Btn>
          <Btn sm variant="info" onClick={()=>setPage('inventaire')}>📋 Inventaire</Btn>
          {!readOnly && <Btn onClick={openAdd}>+ Nouvel Article</Btn>}
        </>}
      />
      <Card style={{marginBottom:16,padding:'12px 20px'}}>
        <select value={catFilter} onChange={e=>setCat(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13}}>
          <option value="">Toutes catégories</option>
          {Object.entries(CAT_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
      </Card>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {articles.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
            <div style={{fontSize:40,marginBottom:8}}>📦</div><p>Aucun article</p>
            {!readOnly && <Btn onClick={openAdd}>+ Créer un article</Btn>}
          </div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>Code</TH><TH>Désignation</TH><TH>Catégorie</TH><TH>Unité</TH>
              <TH right>Stock actuel</TH><TH right>Stock min</TH>
              <TH right>Prix achat</TH><TH right>Valeur stock</TH>
              <TH>Statut</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {articles.map(a=>{
                const alerte = (a.stock_actuel||0)<=(a.stock_min||0)
                return (
                  <TR key={a.id}>
                    <TD sm>{a.code||'—'}</TD>
                    <TD bold>{a.designation}</TD>
                    <TD sm>{CAT_LABELS[a.categorie]||a.categorie}</TD>
                    <TD>{a.unite}</TD>
                    <TD right color={alerte?'#dc2626':'inherit'}><strong style={{fontWeight:alerte?700:400}}>{(a.stock_actuel||0).toFixed(2)}</strong></TD>
                    <TD right sm>{(a.stock_min||0).toFixed(2)}</TD>
                    <TD right>{fcfa(a.prix_achat)}</TD>
                    <TD right bold>{fcfa((a.stock_actuel||0)*(a.prix_achat||0))}</TD>
                    <TD><Badge type={alerte?'warning':'success'}>{alerte?'⚠ Alerte':'✓ OK'}</Badge></TD>
                    <TD>
                      <div style={{display:'flex',gap:6}}>
                        {!readOnly && <Btn sm variant="secondary" onClick={()=>openEdit(a)}>✏️ Modifier</Btn>}
                        {!readOnly && <Btn sm variant="danger" onClick={()=>archive(a.id)}>🗑️ Supprimer</Btn>}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <Modal open={!!modal} onClose={close} title={modal==='add'?'Nouvel Article':'Modifier Article'} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="Code article" name="code" value={form.code||''} onChange={set} placeholder="RIZ-PAD-001" />
            <Sel label="Catégorie" name="categorie" value={form.categorie||''} onChange={set}
              options={Object.entries(CAT_LABELS).map(([v,l])=>({value:v,label:l}))} />
            <Span2><Input label="Désignation *" name="designation" value={form.designation||''} onChange={set} required /></Span2>
            <Sel label="Unité" name="unite" value={form.unite||''} onChange={set}
              options={['kg','tonne','sac','carton','litre','unité','m²'].map(u=>({value:u,label:u}))} />
            <Input label="Prix achat (FCFA)" name="prix_achat" type="number" value={form.prix_achat||0} onChange={set} min="0" />
            <Input label="Prix vente (FCFA)" name="prix_vente" type="number" value={form.prix_vente||0} onChange={set} min="0" />
            <Input label="Stock minimum (alerte)" name="stock_min" type="number" value={form.stock_min||0} onChange={set} min="0" step="0.01" />
            {modal==='add' && <Input label="Stock initial" name="stock_actuel" type="number" value={form.stock_actuel||0} onChange={set} min="0" step="0.01" />}
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── STOCK ENTRÉE ─────────────────────────────────────────────────────────────
function StockEntreePage({ companies, companyId, setPage, toast }) {
  const [articles, setArticles] = useState([])
  const [form, setForm] = useState({ company_id:companyId||'', article_id:'', quantite:'', prix_unitaire:'', motif:'achat', reference:'' })
  const [saving, setSaving] = useState(false)

  const loadArts = useCallback(async cid=>{
    if (!cid) return
    const { data } = await supabase.from('compta_articles').select('*').eq('company_id',cid).eq('actif',true).order('designation')
    setArticles(data||[])
  },[])

  useEffect(()=>{ if(form.company_id) loadArts(form.company_id) },[form.company_id,loadArts])

  const set = e=>{
    const { name,value } = e.target
    setForm(f=>{
      const nf = {...f,[name]:value}
      if (name==='article_id') {
        const a = articles.find(x=>x.id===value)
        if (a) nf.prix_unitaire = a.prix_achat||0
      }
      if (name==='company_id') { setArticles([]); nf.article_id=''; nf.prix_unitaire='' }
      return nf
    })
  }

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const qte = parseFloat(form.quantite), pu = parseFloat(form.prix_unitaire)||0
    const { error } = await supabase.from('compta_mouvements_stock').insert({
      article_id:form.article_id, company_id:form.company_id, user_id:uid,
      type:'entree', motif:form.motif, quantite:qte, prix_unitaire:pu, montant:Math.round(qte*pu),
      reference:form.reference, date_mvt:today(),
    })
    if (error) { setSaving(false); toast.error(error.message); return }
    const art = articles.find(a=>a.id===form.article_id)
    if (art) await supabase.from('compta_articles').update({stock_actuel:(art.stock_actuel||0)+qte}).eq('id',form.article_id)
    setSaving(false)
    toast.success(`Entrée de ${qte} ${art?.unite||''} enregistrée !`)
    setPage('stock')
  }

  return (
    <div>
      <PageHeader title="Entrée de stock" actions={<Btn variant="secondary" onClick={()=>setPage('stock')}>← Retour</Btn>} />
      <div style={{maxWidth:600,margin:'0 auto'}}>
        <Card accent="#16a34a">
          <SectionTitle color="#16a34a">Enregistrer une entrée</SectionTitle>
          <form onSubmit={save}>
            <Grid cols={2} gap={14} style={{marginBottom:16}}>
              <Span2>
                <Sel label="Article *" name="article_id" value={form.article_id} onChange={set}
                  options={[{value:'',label:'— Choisir un article —'},...articles.map(a=>({value:a.id,label:`${a.designation} (stock: ${(a.stock_actuel||0).toFixed(2)} ${a.unite})`}))]} required />
              </Span2>
              <Input label="Quantité *" name="quantite" type="number" value={form.quantite} onChange={set} required min="0.001" step="0.001" />
              <Input label="Prix unitaire (FCFA)" name="prix_unitaire" type="number" value={form.prix_unitaire} onChange={set} min="0" />
              <Sel label="Motif" name="motif" value={form.motif} onChange={set}
                options={['achat','production','retour','ajustement'].map(m=>({value:m,label:m.charAt(0).toUpperCase()+m.slice(1)}))} />
              <Input label="Référence document" name="reference" value={form.reference} onChange={set} placeholder="N° BC, facture..." />
            </Grid>
            <div style={{display:'flex',gap:8}}>
              <Btn type="submit" variant="success" disabled={saving}>{saving?'...':'↓ Enregistrer l\'entrée'}</Btn>
              <Btn variant="secondary" onClick={()=>setPage('stock')}>Annuler</Btn>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}

// ── STOCK SORTIE ─────────────────────────────────────────────────────────────
function StockSortiePage({ companies, companyId, setPage, toast }) {
  const [articles, setArticles] = useState([])
  const [form, setForm] = useState({ company_id:companyId||'', article_id:'', quantite:'', prix_unitaire:'', motif:'vente', reference:'' })
  const [saving, setSaving] = useState(false)

  const loadArts = useCallback(async cid=>{
    if (!cid) return
    const { data } = await supabase.from('compta_articles').select('*').eq('company_id',cid).eq('actif',true).order('designation')
    setArticles(data||[])
  },[])

  useEffect(()=>{ if(form.company_id) loadArts(form.company_id) },[form.company_id,loadArts])

  const set = e=>{
    const { name,value } = e.target
    setForm(f=>{
      const nf = {...f,[name]:value}
      if (name==='article_id') { const a=articles.find(x=>x.id===value); if(a) nf.prix_unitaire=a.prix_vente||0 }
      if (name==='company_id') { setArticles([]); nf.article_id=''; nf.prix_unitaire='' }
      return nf
    })
  }

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const qte = parseFloat(form.quantite)
    const art = articles.find(a=>a.id===form.article_id)
    if (art && qte>(art.stock_actuel||0)) {
      toast.error(`Stock insuffisant. Disponible : ${(art.stock_actuel||0).toFixed(2)} ${art.unite}`)
      setSaving(false); return
    }
    const pu = parseFloat(form.prix_unitaire)||0
    await supabase.from('compta_mouvements_stock').insert({
      article_id:form.article_id, company_id:form.company_id, user_id:uid,
      type:'sortie', motif:form.motif, quantite:qte, prix_unitaire:pu, montant:Math.round(qte*pu),
      reference:form.reference, date_mvt:today(),
    })
    if (art) await supabase.from('compta_articles').update({stock_actuel:(art.stock_actuel||0)-qte}).eq('id',form.article_id)
    setSaving(false)
    toast.success(`Sortie de ${qte} ${art?.unite||''} enregistrée !`)
    setPage('stock')
  }

  return (
    <div>
      <PageHeader title="Sortie de stock" actions={<Btn variant="secondary" onClick={()=>setPage('stock')}>← Retour</Btn>} />
      <div style={{maxWidth:600,margin:'0 auto'}}>
        <Card accent="#f59e0b">
          <SectionTitle color="#f59e0b">Enregistrer une sortie</SectionTitle>
          <form onSubmit={save}>
            <Grid cols={2} gap={14} style={{marginBottom:16}}>
              <Span2>
                <Sel label="Article *" name="article_id" value={form.article_id} onChange={set}
                  options={[{value:'',label:'— Choisir un article —'},...articles.map(a=>({value:a.id,label:`${a.designation} (stock: ${(a.stock_actuel||0).toFixed(2)} ${a.unite})`}))]} required />
              </Span2>
              <Input label="Quantité *" name="quantite" type="number" value={form.quantite} onChange={set} required min="0.001" step="0.001" />
              <Input label="Prix unitaire (FCFA)" name="prix_unitaire" type="number" value={form.prix_unitaire} onChange={set} min="0" />
              <Sel label="Motif" name="motif" value={form.motif} onChange={set}
                options={['vente','production','ajustement','perte'].map(m=>({value:m,label:m.charAt(0).toUpperCase()+m.slice(1)}))} />
              <Input label="Référence document" name="reference" value={form.reference} onChange={set} placeholder="N° facture..." />
            </Grid>
            <div style={{display:'flex',gap:8}}>
              <Btn type="submit" variant="warning" disabled={saving}>{saving?'...':'↑ Enregistrer la sortie'}</Btn>
              <Btn variant="secondary" onClick={()=>setPage('stock')}>Annuler</Btn>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}

// ── MOUVEMENTS ────────────────────────────────────────────────────────────────
function MouvementsPage({ companies, companyId, setPage, readOnly=false }) {
  const [items, setItems] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { data:adock } = await supabase.auth.getUser(); const uidock=adock?.user?.id; const isAdmock=adock?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_mouvements_stock').select('*,compta_articles(designation,unite)').order('date_mvt',{ascending:false}).limit(500)
    q = isAdmock&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uidock); if(companyId&&!isAdmock) q=q.eq('company_id',companyId)
    if (dateFrom)  q=q.gte('date_mvt',dateFrom)
    if (dateTo)    q=q.lte('date_mvt',dateTo)
    const { data } = await q; setItems(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const exportCSV = () => {
    const header = ['Date','Article','Unité','Type','Motif','Quantité','Prix Unitaire','Montant','Référence']
    const rows = items.map(m=>[
      m.date_mvt||'',
      m.compta_articles?.designation||'',
      m.compta_articles?.unite||'',
      m.type==='entree'?'Entrée':'Sortie',
      m.motif||'',
      (m.quantite||0).toFixed(3),
      (m.prix_unitaire||0).toFixed(0),
      (m.montant||0).toFixed(0),
      m.reference||'',
    ])
    const csvContent = [header,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n')
    const BOM = '\uFEFF'
    const blob = new Blob([BOM+csvContent],{type:'text/csv;charset=utf-8;'})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const period = dateFrom||dateTo ? `_${dateFrom||'debut'}_${dateTo||'fin'}` : ''
    a.href=url; a.download=`mouvements_stock${period}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader title="Mouvements de stock" subtitle={`${items.length} mouvement(s)`}
        actions={<>
          {!readOnly && <Btn sm variant="success" onClick={()=>setPage('stock-entree')}>↓ Entrée</Btn>}
          {!readOnly && <Btn sm variant="warning" onClick={()=>setPage('stock-sortie')}>↑ Sortie</Btn>}
          <Btn sm variant="info" onClick={exportCSV}>📊 Exporter Excel</Btn>
        </>}
      />
      {/* Filtre période */}
      <Card style={{marginBottom:16,padding:'12px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <span style={{fontSize:13,fontWeight:600,color:'#374151'}}>📅 Période :</span>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <label style={{fontSize:12,color:'#64748b'}}>Du</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:13}} />
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <label style={{fontSize:12,color:'#64748b'}}>Au</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:13}} />
          </div>
          {(dateFrom||dateTo) && (
            <Btn sm variant="secondary" onClick={()=>{setDateFrom('');setDateTo('')}}>✕ Réinitialiser</Btn>
          )}
        </div>
      </Card>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>↕️ Aucun mouvement sur cette période</div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>Date</TH><TH>Article</TH><TH>Type</TH><TH>Motif</TH>
              <TH right>Quantité</TH><TH right>P.U</TH><TH right>Montant</TH><TH>Référence</TH>
            </tr></thead>
            <tbody>
              {items.map(m=>(
                <TR key={m.id}>
                  <TD sm>{m.date_mvt}</TD>
                  <TD bold>{m.compta_articles?.designation||'—'}</TD>
                  <TD><Badge type={m.type==='entree'?'success':'warning'}>{m.type==='entree'?'↓ Entrée':'↑ Sortie'}</Badge></TD>
                  <TD sm>{m.motif||'—'}</TD>
                  <TD right color={m.type==='entree'?'#16a34a':'#dc2626'}>{m.type==='entree'?'+':'−'}{(m.quantite||0).toFixed(2)} {m.compta_articles?.unite||''}</TD>
                  <TD right sm>{fcfa(m.prix_unitaire)}</TD>
                  <TD right bold>{fcfa(m.montant)}</TD>
                  <TD sm>{m.reference||'—'}</TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── INVENTAIRE ────────────────────────────────────────────────────────────────
function InventairePage({ companies, companyId, setCompanyId }) {
  const [articles, setArticles] = useState([])

  const load = useCallback(async()=>{
    if (!companyId) { setArticles([]); return }
    const { data:ad } = await supabase.auth.getUser()
    const uid = ad?.user?.id; const isAdmin = ad?.user?.email === SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_articles').select('*').eq('company_id',companyId).eq('actif',true).order('categorie,designation')
    if (!isAdmin) q = q.eq('user_id', uid)
    const { data } = await q
    setArticles(data||[])
  },[companyId])

  useEffect(()=>{ load() },[load])

  const valeur = articles.reduce((s,a)=>s+(a.stock_actuel||0)*(a.prix_achat||0),0)
  const alertes = articles.filter(a=>(a.stock_actuel||0)<=(a.stock_min||0)).length
  const cats = [...new Set(articles.map(a=>a.categorie))]

  return (
    <div>
      <PageHeader title="Inventaire des stocks"
        subtitle={companyId?`Édité le ${new Date().toLocaleDateString('fr-FR')}`:'Sélectionnez une société'}
        actions={
          <div style={{display:'flex',gap:8}}>
            <CompanySelector companies={companies} companyId={companyId} setCompanyId={setCompanyId} />
            <Btn sm variant="secondary" onClick={()=>window.print()}>Imprimer</Btn>
          </div>
        }
      />
      {!companyId ? (
        <Card style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
          <div style={{fontSize:40,marginBottom:8}}>📋</div>
          <p>Sélectionnez une société pour afficher l'inventaire</p>
        </Card>
      ) : (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:24}}>
            {[
              {l:'Valeur totale du stock',v:fcfa(valeur),c:ACCENT},
              {l:'Nombre d\'articles',v:articles.length,c:'#0f172a'},
              {l:'Articles en alerte',v:alertes,c:'#dc2626'},
            ].map(s=>(
              <Card key={s.l}>
                <div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{s.l}</div>
                <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
              </Card>
            ))}
          </div>
          {cats.map(cat=>{
            const artsCat = articles.filter(a=>a.categorie===cat)
            return (
              <div key={cat} style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden',marginBottom:16}}>
                <div style={{padding:'12px 20px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',fontWeight:700}}>
                  {CAT_LABELS[cat]||cat} <span style={{color:'#94a3b8',fontWeight:400,fontSize:12}}>— {artsCat.length} article(s)</span>
                </div>
                <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                  <thead><tr>
                    <TH>Code</TH><TH>Désignation</TH><TH>Unité</TH>
                    <TH right>Stock actuel</TH><TH right>Stock min</TH>
                    <TH right>Prix achat</TH><TH right>Prix vente</TH>
                    <TH right>Valeur stock</TH><TH>État</TH>
                  </tr></thead>
                  <tbody>
                    {artsCat.map(a=>{
                      const al=(a.stock_actuel||0)<=(a.stock_min||0)
                      return (
                        <TR key={a.id}>
                          <TD sm>{a.code||'—'}</TD><TD bold>{a.designation}</TD><TD>{a.unite}</TD>
                          <TD right color={al?'#dc2626':'inherit'}><strong style={{fontWeight:al?700:400}}>{(a.stock_actuel||0).toFixed(3)}</strong></TD>
                          <TD right sm>{(a.stock_min||0).toFixed(2)}</TD>
                          <TD right>{fcfa(a.prix_achat)}</TD><TD right>{fcfa(a.prix_vente)}</TD>
                          <TD right bold>{fcfa((a.stock_actuel||0)*(a.prix_achat||0))}</TD>
                          <TD><Badge type={al?'warning':'success'}>{al?'⚠ Alerte':'✓ OK'}</Badge></TD>
                        </TR>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── COMMERCIAL — LISTE ────────────────────────────────────────────────────────
function CommercialPage({ companies, companyId, setPage, setDocId, toast, readOnly=false }) {
  const [docs, setDocs] = useState([])
  const [typeF, setTypeF]   = useState('')
  const [statF, setStatF]   = useState('')
  const [preview, setPreview] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const { data:ad } = await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_documents').select('*,compta_clients(nom,prenom,nom_societe,type),compta_fournisseurs(nom,nom_societe,type),compta_companies(raison_sociale)').order('date_doc',{ascending:false})
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if (companyId&&!isAdmin) q=q.eq('company_id',companyId)
    if (typeF)     q=q.eq('type_doc',typeF)
    if (statF)     q=q.eq('statut',statF)
    if (dateFrom)  q=q.gte('date_doc',dateFrom)
    if (dateTo)    q=q.lte('date_doc',dateTo)
    const { data } = await q; setDocs(data||[])
  },[companyId,typeF,statF,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const del = async id=>{
    if (!confirm('Supprimer ce document ?')) return
    await supabase.from('compta_lignes_document').delete().eq('document_id',id)
    await supabase.from('compta_documents').delete().eq('id',id)
    toast.success('Document supprimé.'); load()
  }

  const ttc = docs.reduce((s,d)=>s+(d.montant_ttc||0),0)
  const pay = docs.reduce((s,d)=>s+(d.montant_paye||0),0)
  const cliName = d => { const c = d.type_doc==='bon_commande' ? d.compta_fournisseurs : d.compta_clients; return c?(c.type==='morale'?c.nom_societe:(c.nom||'')):null }
  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''
  const companyLogo = companies.find(c=>c.id===companyId)?.logo_url||''

  const printFiltered = () => {
    const headers = [{label:'N° Doc'},{label:'Type'},{label:'Client'},{label:'Date'},{label:'Statut'},{label:'Montant TTC',r:true},{label:'Payé',r:true},{label:'Reste dû',r:true}]
    const rows = docs.map(d=>[
      d.numero, TYPE_DOC_LABELS[d.type_doc]||d.type_doc, cliName(d)||'—',
      d.date_doc, d.statut,
      Math.round(d.montant_ttc||0).toLocaleString('fr-FR')+' FCFA',
      Math.round(d.montant_paye||0).toLocaleString('fr-FR')+' FCFA',
      Math.round((d.montant_ttc||0)-(d.montant_paye||0)).toLocaleString('fr-FR')+' FCFA',
    ])
    printFilteredList({ title:'Documents Commerciaux', companyName, headers, rows, dateFrom, dateTo,
      totals:[
        {label:'Total TTC', value:Math.round(ttc).toLocaleString('fr-FR')+' FCFA'},
        {label:'Total Payé', value:Math.round(pay).toLocaleString('fr-FR')+' FCFA'},
        {label:'Reste dû',  value:Math.round(ttc-pay).toLocaleString('fr-FR')+' FCFA'},
      ]})
  }

  return (
    <div>
      <PageHeader title="Documents commerciaux" subtitle={`${docs.length} document(s)`}
        actions={<>
          <Btn sm variant="danger" onClick={printFiltered}>🖨️ PDF liste</Btn>
          {Object.entries(TYPE_DOC_LABELS).map(([t,l])=>(
            <Btn key={t} sm onClick={()=>{ setDocId(null); setPage('commercial-new-'+t) }}>+ {l}</Btn>
          ))}
        </>}
      />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[{l:'Total TTC',v:fcfa(ttc),c:ACCENT},{l:'Payé',v:fcfa(pay),c:'#16a34a'},{l:'Reste dû',v:fcfa(ttc-pay),c:'#dc2626'}].map(s=>(
          <Card key={s.l}><div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{s.l}</div><div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div></Card>
        ))}
      </div>
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <Card style={{marginBottom:16,padding:'12px 20px'}}>
        <div style={{display:'flex',gap:12}}>
          <select value={typeF} onChange={e=>setTypeF(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13}}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_DOC_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <select value={statF} onChange={e=>setStatF(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13}}>
            <option value="">Tous statuts</option>
            {['brouillon','validé','livré','payé','annulé'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Card>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {docs.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📄 Aucun document commercial</div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N° Document</TH><TH>Type</TH><TH>Client</TH><TH>Date</TH>
              <TH right>Montant TTC</TH><TH right>Payé</TH><TH right>Reste</TH>
              <TH>Statut</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {docs.map(d=>{
                const reste = (d.montant_ttc||0)-(d.montant_paye||0)
                return (
                  <TR key={d.id}>
                    <TD bold>{d.numero}</TD>
                    <TD><Badge type="info">{TYPE_DOC_LABELS[d.type_doc]||d.type_doc}</Badge></TD>
                    <TD>{cliName(d)||'—'}</TD>
                    <TD sm>{d.date_doc}</TD>
                    <TD right bold>{fcfa(d.montant_ttc)}</TD>
                    <TD right color="#16a34a">{fcfa(d.montant_paye)}</TD>
                    <TD right color={reste>0?'#dc2626':'#16a34a'}>{fcfa(reste)}</TD>
                    <TD><Badge type={STATUT_COLORS[d.statut]||'secondary'}>{d.statut}</Badge></TD>
                    <TD>
                      <div style={{display:'flex',gap:6}}>
                        <Btn sm variant="secondary" onClick={()=>{ setDocId(d.id); setPage('commercial-view') }}>Voir</Btn>
                        <Btn sm variant="info" onClick={async()=>{
                          const r1=await supabase.from('compta_documents').select('*,compta_clients(*),compta_companies(*)').eq('id',d.id).single()
                          const r2=await supabase.from('compta_lignes_document').select('*').eq('document_id',d.id)
                          if(r1.data) setPreview({doc:r1.data,lignes:r2.data||[]})
                        }}>👁️</Btn>
                        <Btn sm variant="danger" onClick={async()=>{
                          const r1=await supabase.from('compta_documents').select('*,compta_clients(*),compta_companies(*)').eq('id',d.id).single()
                          const r2=await supabase.from('compta_lignes_document').select('*').eq('document_id',d.id)
                          if(r1.data) printCommercialDoc(r1.data,r2.data||[])
                        }}>PDF</Btn>
                        <Btn sm variant="danger" onClick={()=>del(d.id)}>Sup</Btn>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <DocPreviewModal open={!!preview} onClose={()=>setPreview(null)} doc={preview?.doc} lignes={preview?.lignes||[]} />
    </div>
  )
}

// ── COMMERCIAL — NOUVEAU DOCUMENT ─────────────────────────────────────────────
function CommercialNewPage({ companies, companyId, typeDoc, setPage, toast }) {
  const [form, setForm]     = useState({ company_id:companyId||'', type_doc:typeDoc||'facture', date_doc:today(), date_echeance:'', client_id:'', fournisseur_id:'', tva_pct:0, notes:'' })
  const [clients, setClients]   = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [articles, setArticles] = useState([])
  const [lignes, setLignes]     = useState([{ designation:'', unite:'kg', quantite:0, prix_unitaire:0, montant_ligne:0 }])
  const [saving, setSaving]     = useState(false)
  const [fournType, setFournType] = useState('physique')   // Bon de commande : recherche par CIP (physique) ou IFU (morale)
  const [fournNum, setFournNum]   = useState('')            // Numéro CIP/IFU saisi
  const [cliType, setCliType]     = useState('physique')   // Proforma : recherche client par CIP (physique) ou IFU (morale)
  const [cliNum, setCliNum]       = useState('')           // Numéro CIP/IFU client saisi

  const loadCli = useCallback(async cid=>{ if(!cid) return; const {data}=await supabase.from('compta_clients').select('*').eq('company_id',cid).eq('actif',true); setClients(data||[]) },[])
  const loadArt = useCallback(async cid=>{ if(!cid) return; const {data}=await supabase.from('compta_articles').select('*').eq('company_id',cid).eq('actif',true); setArticles(data||[]) },[])
  const loadFourn = useCallback(async cid=>{ if(!cid) return; const {data}=await supabase.from('compta_fournisseurs').select('*').eq('company_id',cid); setFournisseurs(data||[]) },[])

  useEffect(()=>{ if(form.company_id){ loadCli(form.company_id); loadArt(form.company_id); loadFourn(form.company_id) } },[form.company_id,loadCli,loadArt,loadFourn])

  const setF = e => setForm(f=>({...f,[e.target.name]:e.target.value}))

  const updateLigne = (i,field,val) => {
    const nl = [...lignes]; nl[i]={...nl[i],[field]:val}
    if (field==='quantite'||field==='prix_unitaire') {
      const q=parseFloat(field==='quantite'?val:nl[i].quantite)||0
      const p=parseFloat(field==='prix_unitaire'?val:nl[i].prix_unitaire)||0
      nl[i].montant_ligne = Math.round(q*p)
    }
    setLignes(nl)
  }
  const addLigne = ()=>setLignes(l=>[...l,{designation:'',unite:'kg',quantite:0,prix_unitaire:0,montant_ligne:0}])
  const delLigne = i=>{ if(lignes.length>1) setLignes(l=>l.filter((_,j)=>j!==i)) }

  const ht  = lignes.reduce((s,l)=>s+(l.montant_ligne||0),0)
  const tva = Math.round(ht*(parseFloat(form.tva_pct)||0)/100)
  const ttc = ht+tva

  // ── Bon de commande : recherche du fournisseur par CIP (physique) / IFU (morale) ──
  const fournNumField = fournType==='morale' ? 'ifu' : 'cip'
  const normNum = s => String(s||'').trim().toUpperCase()
  const matchedFourn = normNum(fournNum)
    ? (fournisseurs.find(f => (f.type||'physique')===fournType && normNum(f[fournNumField])===normNum(fournNum)) || null)
    : null

  // ── Proforma : recherche du client par CIP (physique) / IFU (morale) ──
  const cliNumField = cliType==='morale' ? 'ifu' : 'cip'
  const matchedCli = normNum(cliNum)
    ? (clients.find(c => (c.type||'physique')===cliType && normNum(c[cliNumField])===normNum(cliNum)) || null)
    : null

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const year = new Date().getFullYear()
    const prefix = TYPE_DOC_PREFIX[form.type_doc]||'DOC'
    const { count } = await supabase.from('compta_documents').select('id',{count:'exact',head:true}).eq('user_id',uid).eq('type_doc',form.type_doc)
    const numero = `${prefix}-${year}-${String((count||0)+1).padStart(4,'0')}`
    const { data:docData, error:docErr } = await supabase.from('compta_documents').insert({
      company_id:form.company_id, user_id:uid, type_doc:form.type_doc, numero,
      date_doc:form.date_doc, date_echeance:form.date_echeance||null,
      client_id:(form.type_doc!=='bon_commande' ? (matchedCli?.id||null) : (form.client_id||null)), fournisseur_id:(form.type_doc==='bon_commande' ? (matchedFourn?.id||null) : (form.fournisseur_id||null)), statut:'brouillon',
      montant_ht:ht, tva_pct:parseFloat(form.tva_pct)||0, montant_tva:tva, montant_ttc:ttc,
      notes:form.notes,
    }).select().single()
    if (docErr) { toast.error(docErr.message); setSaving(false); return }
    const linesPayload = lignes.filter(l=>l.designation).map(l=>({
      document_id:docData.id, designation:l.designation, unite:l.unite,
      quantite:parseFloat(l.quantite)||0, prix_unitaire:parseFloat(l.prix_unitaire)||0, montant_ligne:l.montant_ligne||0,
    }))
    if (linesPayload.length>0) await supabase.from('compta_lignes_document').insert(linesPayload)
    setSaving(false)
    toast.success(`${TYPE_DOC_LABELS[form.type_doc]} ${numero} créé(e) !`)
    setPage('commercial')
  }

  const { isMobile } = useResponsive()
  const cliName = c => c.type==='morale'?c.nom_societe:(c.nom||'')
  const fourName = f => f.type==='morale'?f.nom_societe:(f.nom||'')

  return (
    <div>
      <PageHeader title={`Nouveau ${TYPE_DOC_LABELS[form.type_doc]||'Document'}`}
        actions={<Btn variant="secondary" onClick={()=>setPage('commercial')}>← Retour</Btn>} />
      <form onSubmit={save}>
        <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr':'2fr 1fr', gap:24 }}>
          <div>
            <Card style={{marginBottom:16}}>
              <SectionTitle>Informations du document</SectionTitle>
              <Grid cols={3} gap={14}>
                <Sel label="Type *" name="type_doc" value={form.type_doc} onChange={setF}
                  options={Object.entries(TYPE_DOC_LABELS).map(([v,l])=>({value:v,label:l}))} />
                <Input label="Date *" name="date_doc" type="date" value={form.date_doc} onChange={setF} required />
                {form.type_doc==='bon_commande' ? (
                  <>
                    <Sel label="Type fournisseur" name="__fournType" value={fournType}
                      onChange={e=>{ setFournType(e.target.value); setFournNum('') }}
                      options={[{value:'physique',label:'Personne physique'},{value:'morale',label:'Personne morale'}]} />
                    <div>
                      <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#374151', marginBottom:5 }}>
                        {fournType==='morale' ? 'N° IFU' : 'N° CIP'}
                      </label>
                      <input list="fourn-num-list" value={fournNum}
                        onChange={e=>setFournNum(toUpperNoAccent(e.target.value))}
                        placeholder={fournType==='morale' ? 'Saisir / choisir un IFU' : 'Saisir / choisir un CIP'}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #d1d5db',
                          fontSize:13.5, boxSizing:'border-box', background:'white' }} />
                      <datalist id="fourn-num-list">
                        {fournisseurs
                          .filter(f => (f.type||'physique')===fournType && normNum(f[fournNumField])!=='')
                          .map(f => <option key={f.id} value={f[fournNumField]}>{fourName(f)}</option>)}
                      </datalist>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#374151', marginBottom:5 }}>
                        Fournisseur
                      </label>
                      <div style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #d1d5db',
                        fontSize:13.5, boxSizing:'border-box', background:'#f8fafc', minHeight:38, display:'flex', alignItems:'center' }}>
                        {matchedFourn
                          ? <span style={{fontWeight:600,color:'#0f2044'}}>{fourName(matchedFourn)}</span>
                          : normNum(fournNum)
                            ? <span style={{color:'#dc2626',fontWeight:600}}>⚠️ Fournisseur introuvable</span>
                            : <span style={{color:'#94a3b8'}}>—</span>}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Sel label="Type client" name="__cliType" value={cliType}
                      onChange={e=>{ setCliType(e.target.value); setCliNum('') }}
                      options={[{value:'physique',label:'Personne physique'},{value:'morale',label:'Personne morale'}]} />
                    <div>
                      <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#374151', marginBottom:5 }}>
                        {cliType==='morale' ? 'N° IFU' : 'N° CIP'}
                      </label>
                      <input list="cli-num-list" value={cliNum}
                        onChange={e=>setCliNum(toUpperNoAccent(e.target.value))}
                        placeholder={cliType==='morale' ? 'Saisir / choisir un IFU' : 'Saisir / choisir un CIP'}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #d1d5db',
                          fontSize:13.5, boxSizing:'border-box', background:'white' }} />
                      <datalist id="cli-num-list">
                        {clients
                          .filter(c => (c.type||'physique')===cliType && normNum(c[cliNumField])!=='')
                          .map(c => <option key={c.id} value={c[cliNumField]}>{cliName(c)}</option>)}
                      </datalist>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#374151', marginBottom:5 }}>
                        Client
                      </label>
                      <div style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #d1d5db',
                        fontSize:13.5, boxSizing:'border-box', background:'#f8fafc', minHeight:38, display:'flex', alignItems:'center' }}>
                        {matchedCli
                          ? <span style={{fontWeight:600,color:'#0f2044'}}>{cliName(matchedCli)}</span>
                          : normNum(cliNum)
                            ? <span style={{color:'#dc2626',fontWeight:600}}>⚠️ Client introuvable</span>
                            : <span style={{color:'#94a3b8'}}>—</span>}
                      </div>
                    </div>
                  </>
                )}
                <Input label="Date échéance" name="date_echeance" type="date" value={form.date_echeance} onChange={setF} />
                <Input label="TVA (%)" name="tva_pct" type="number" value={form.tva_pct} onChange={setF} min="0" max="100" step="0.01" />
                <div style={{gridColumn:'1 / -1'}}>
                  <Input label="Notes / Conditions" name="notes" value={form.notes} onChange={setF} />
                </div>
              </Grid>
            </Card>
            <Card style={{marginBottom:16}}>
              <SectionTitle>Lignes du document</SectionTitle>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                  <thead>
                    <tr style={{background:'#f8fafc'}}>
                      {['Désignation *','Unité','Quantité','Prix unitaire (FCFA)','Montant',''].map((h,i)=>(
                        <th key={i} style={{padding:'8px 10px',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',borderBottom:'1px solid #e2e8f0',textAlign:i>=2?'right':'left',width:i===5?30:'auto'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                        <td style={{padding:'6px 8px'}}>
                          <select
                            value=""
                            onChange={e=>{
                              const a=articles.find(x=>x.id===e.target.value)
                              if(a){
                                setLignes(prev=>{
                                  const nl=[...prev]
                                  const q=parseFloat(nl[i].quantite)||0
                                  const p=a.prix_vente||0
                                  nl[i]={...nl[i], designation:a.designation, prix_unitaire:p, unite:a.unite, montant_ligne:Math.round(q*p)}
                                  return nl
                                })
                              }
                            }}
                            style={{width:'100%',marginBottom:4,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12}}>
                            <option value="">Sélectionner un article...</option>
                            {articles.map(a=><option key={a.id} value={a.id}>{a.designation}</option>)}
                          </select>
                          <input value={l.designation} onChange={e=>updateLigne(i,'designation',e.target.value)} placeholder="Désignation..." required
                            style={{width:'100%',padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}} />
                        </td>
                        <td style={{padding:'6px 8px'}}><input value={l.unite} onChange={e=>updateLigne(i,'unite',e.target.value)} style={{width:55,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12}} /></td>
                        <td style={{padding:'6px 8px'}}><input type="number" value={l.quantite} onChange={e=>updateLigne(i,'quantite',e.target.value)} min="0" step="0.001" style={{width:90,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,textAlign:'right'}} /></td>
                        <td style={{padding:'6px 8px'}}><input type="number" value={l.prix_unitaire} onChange={e=>updateLigne(i,'prix_unitaire',e.target.value)} min="0" style={{width:120,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,textAlign:'right'}} /></td>
                        <td style={{padding:'6px 8px',textAlign:'right',fontWeight:600,whiteSpace:'nowrap'}}>{Math.round(l.montant_ligne||0).toLocaleString('fr-FR')}</td>
                        <td style={{padding:'6px 8px'}}><button type="button" onClick={()=>delLigne(i)} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:16}}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{marginTop:12}}><Btn sm variant="outline" onClick={addLigne}>+ Ajouter une ligne</Btn></div>
            </Card>
            <Btn type="submit" disabled={saving} sx={{width:'100%',padding:12,justifyContent:'center',fontSize:15}}>{saving?'Enregistrement...':'💾 Enregistrer le document'}</Btn>
          </div>
          <div style={{position:'sticky',top:80}}>
            <Card accent={ACCENT}>
              <h6 style={{margin:'0 0 16px',fontWeight:700,color:ACCENT}}>🧮 Récapitulatif</h6>
              {[['Montant HT',fcfa(ht),null],[`TVA (${form.tva_pct}%)`,fcfa(tva),null],['Total TTC',fcfa(ttc),ACCENT]].map(([l,v,c])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:13}}>
                  <span style={{color:'#64748b'}}>{l}</span>
                  <strong style={{color:c||'inherit'}}>{v}</strong>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',background:'#eff6ff',padding:'10px 12px',borderRadius:8,marginTop:8}}>
                <span style={{fontWeight:700,fontSize:15}}>Total TTC</span>
                <span style={{fontWeight:800,fontSize:15,color:ACCENT}}>{fcfa(ttc)}</span>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── COMMERCIAL — VUE DOCUMENT ─────────────────────────────────────────────────
function CommercialViewPage({ docId, setPage, toast }) {
  const [doc, setDoc]       = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [statutForm, setStatutForm] = useState({ statut:'brouillon', montant_paye:0 })
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(()=>{
    const load = async ()=>{
      if (!docId) return
      const { data:d } = await supabase.from('compta_documents').select('*,compta_clients(*),compta_fournisseurs(*),compta_companies(*)').eq('id',docId).single()
      const { data:l } = await supabase.from('compta_lignes_document').select('*').eq('document_id',docId)
      setDoc(d); setLignes(l||[]); setLoading(false)
    }
    load()
  },[docId])

  useEffect(()=>{ if(doc) setStatutForm({statut:doc.statut, montant_paye:doc.montant_paye||0}) },[doc])

  const { isMobile } = useResponsive()

  const updateStatut = async ()=>{
    await supabase.from('compta_documents').update({ statut:statutForm.statut, montant_paye:parseFloat(statutForm.montant_paye)||0 }).eq('id',docId)
    toast.success('Statut mis à jour !')
    setDoc(d=>({...d,...statutForm}))
  }

  if (loading) return <div style={{padding:24}}>Chargement...</div>
  if (!doc) return <div style={{padding:24}}>Document introuvable.</div>

  const cli = doc.compta_clients
  const four = doc.compta_fournisseurs
  const estBC = doc.type_doc==='bon_commande'
  const partenaire = estBC ? four : cli
  const partenaireNom = partenaire ? (partenaire.type==='morale'?partenaire.nom_societe:(partenaire.nom||'')) : null
  const partenaireLabel = estBC ? 'Fournisseur' : 'Client'
  const cliNom = partenaireNom
  const reste = (doc.montant_ttc||0)-(doc.montant_paye||0)

  return (
    <div>
      <PageHeader title={TYPE_DOC_LABELS[doc.type_doc]||doc.type_doc}
        subtitle={`N° ${doc.numero} — ${doc.date_doc}`}
        actions={<>
          <Btn variant="secondary" onClick={()=>setPage('commercial')}>← Retour liste</Btn>
          <Btn variant="info" onClick={()=>setPreviewOpen(true)}>👁️ Aperçu</Btn>
          <Btn variant="danger" onClick={()=>printCommercialDoc(doc, lignes)}>🖨️ PDF</Btn>
        </>}
      />
      <DocPreviewModal open={previewOpen} onClose={()=>setPreviewOpen(false)} doc={doc} lignes={lignes} />
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'2fr 1fr',gap:24}}>
        <Card>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:24}}>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:'#0f2044'}}>{doc.compta_companies?.raison_sociale}</div>
              {doc.compta_companies?.rccm  && <div style={{fontSize:12,color:'#555'}}>RCCM : {doc.compta_companies.rccm}</div>}
              {doc.compta_companies?.adresse && <div style={{fontSize:12,color:'#555'}}>{doc.compta_companies.adresse}</div>}
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:18,fontWeight:800,textTransform:'uppercase',letterSpacing:1}}>{TYPE_DOC_LABELS[doc.type_doc]}</div>
              <div style={{fontSize:13,color:'#555',marginTop:4}}>N° {doc.numero}</div>
              <div style={{fontSize:12,color:'#555'}}>Date : {doc.date_doc}</div>
              {doc.date_echeance && <div style={{fontSize:12,color:'#dc2626'}}>Échéance : {doc.date_echeance}</div>}
            </div>
          </div>
          {partenaireNom && (
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13}}>
              <strong>{partenaireLabel} :</strong> {partenaireNom}
              {partenaire?.telephone && ` — Tél : ${partenaire.telephone}`}
              {partenaire?.ifu       && ` — IFU : ${partenaire.ifu}`}
            </div>
          )}
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12,fontSize:13,minWidth:600}}>
            <thead style={{background:'#d6d6d6'}}>
              <tr>{['Désignation','Unité','Quantité','Prix U.','Montant'].map((h,i)=>(
                <th key={i} style={{padding:'8px 10px',textAlign:i>=2?'right':'left',fontWeight:700,border:'1px solid #ccc',whiteSpace:'nowrap'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {lignes.map((l,i)=>(
                <tr key={l.id} style={{background:i%2===0?'white':'#f9f9f9'}}>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0'}}>{l.designation}</td>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'center'}}>{l.unite}</td>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right'}}>{(l.quantite||0).toFixed(3)}</td>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right'}}>{fcfa(l.prix_unitaire)}</td>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:600}}>{fcfa(l.montant_ligne)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan="4" style={{textAlign:'right',padding:'8px 10px',fontWeight:700,borderTop:'1px solid #ccc'}}>MONTANT HT</td><td style={{textAlign:'right',padding:'8px 10px',fontWeight:700,borderTop:'1px solid #ccc'}}>{fcfa(doc.montant_ht)}</td></tr>
              {(doc.tva_pct||0)>0 && <tr><td colSpan="4" style={{textAlign:'right',padding:'6px 10px'}}>TVA ({doc.tva_pct}%)</td><td style={{textAlign:'right',padding:'6px 10px'}}>{fcfa(doc.montant_tva)}</td></tr>}
              <tr style={{background:'#d6d6d6'}}>
                <td colSpan="4" style={{textAlign:'right',padding:10,fontWeight:800,fontSize:14}}>TOTAL TTC</td>
                <td style={{textAlign:'right',padding:10,fontWeight:800,fontSize:14}}>{fcfa(doc.montant_ttc)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
          {doc.notes && <div style={{background:'#fffde7',borderLeft:'3px solid #f9a825',padding:'8px 12px',borderRadius:'0 6px 6px 0',fontSize:12}}><strong>Notes :</strong> {doc.notes}</div>}
        </Card>
        <div>
          <Card accent={ACCENT} style={{marginBottom:16}}>
            <SectionTitle>Mettre à jour le statut</SectionTitle>
            <div style={{marginBottom:12}}>
              <Sel label="Nouveau statut" name="statut" value={statutForm.statut} onChange={e=>setStatutForm(f=>({...f,statut:e.target.value}))}
                options={['brouillon','validé','livré','payé','annulé'].map(s=>({value:s,label:s.charAt(0).toUpperCase()+s.slice(1)}))} />
            </div>
            {doc.type_doc==='facture' && (
              <div style={{marginBottom:12}}>
                <Input label="Montant payé (FCFA)" name="montant_paye" type="number" value={statutForm.montant_paye} onChange={e=>setStatutForm(f=>({...f,montant_paye:e.target.value}))} min="0" />
              </div>
            )}
            <Btn sx={{width:'100%',justifyContent:'center'}} onClick={updateStatut}>💾 Mettre à jour</Btn>
          </Card>
          <Card accent="#16a34a">
            <SectionTitle>Résumé financier</SectionTitle>
            {[['Montant HT',fcfa(doc.montant_ht),null],['Total TTC',fcfa(doc.montant_ttc),ACCENT],['Payé',fcfa(doc.montant_paye),'#16a34a'],['Reste dû',fcfa(reste),reste>0?'#dc2626':'#16a34a']].map(([l,v,c])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:13}}>
                <span style={{color:'#64748b'}}>{l}</span>
                <strong style={{color:c||'inherit'}}>{v}</strong>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── LOTS PRODUCTION ───────────────────────────────────────────────────────────
function LotsProductionPage({ companies, companyId, toast, readOnly=false }) {
  const [lots, setLots]     = useState([])
  const [modal, setModal]   = useState(null)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [rowPreview, setRowPreview] = useState(null)

  const load = useCallback(async()=>{
    const { data:adion } = await supabase.auth.getUser(); const uidion=adion?.user?.id; const isAdmion=adion?.user?.email===SUPER_ADMIN_EMAIL
    if (!uidion) return
    let q = supabase.from('compta_lots_production').select('*,compta_companies(raison_sociale)').order('date_debut',{ascending:false})
    q = isAdmion&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uidion); if(companyId&&!isAdmion) q=q.eq('company_id',companyId)
    if (dateFrom)  q=q.gte('date_debut',dateFrom)
    if (dateTo)    q=q.lte('date_debut',dateTo)
    const { data } = await q; setLots(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const set = e=>setForm(f=>({...f,[e.target.name]:e.target.value}))
  const open = (l=null)=>{ setForm(l?{...l}:{company_id:companyId||companies[0]?.id||'',numero_lot:`LOT-${Date.now().toString().slice(-6)}`,date_debut:today(),qte_paddy_entree:0,statut:'en_cours',notes:''}); setModal(l?'edit':'add') }
  const close = ()=>setModal(null)

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { numero_lot,date_debut,date_fin,statut,qte_paddy_entree,notes } = form
    let company_id = form.company_id || companyId || companies[0]?.id
    if (!company_id) company_id = await getEffectiveCompanyId(companyId, companies)
    if (!company_id) { toast.error('Veuillez sélectionner une société.'); setSaving(false); return }
    const pay = { company_id,numero_lot,date_debut,date_fin:date_fin||null,statut,qte_paddy_entree:+qte_paddy_entree,notes }
    const { error } = modal==='add' ? await supabase.from('compta_lots_production').insert({...pay,user_id:uid}) : await supabase.from('compta_lots_production').update(pay).eq('id',form.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Lot enregistré !'); close(); load()
  }

  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''
  const companyLogo = companies.find(c=>c.id===companyId)?.logo_url||''

  const printFiltered = () => {
    const headers = [{label:'N° Lot'},{label:'Date début'},{label:'Date fin'},{label:'Qté paddy (kg)',r:true},{label:'Statut'},{label:'Notes'}]
    const rows = lots.map(l=>[l.numero_lot,l.date_debut,l.date_fin||'—',(l.qte_paddy_entree||0).toFixed(2)+' kg',l.statut,l.notes||'—'])
    printFilteredList({ title:'Lots de Production', companyName, headers, rows, dateFrom, dateTo })
  }

  return (
    <div>
      <PageHeader title="Lots de Production" subtitle={`${lots.length} lot(s)`}
        actions={<>
          <Btn sm variant="danger" onClick={printFiltered}>🖨️ PDF</Btn>
          {!readOnly && <Btn onClick={()=>open()}>+ Nouveau Lot</Btn>}
        </>}
      />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {lots.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>🏭 Aucun lot de production</div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>N° Lot</TH><TH>Date début</TH><TH>Date fin</TH><TH right>Qté paddy (kg)</TH><TH>Statut</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {lots.map(l=>{
                const lotHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Lot ${l.numero_lot}</title><style>${CSS_PRINT}</style></head><body>
                  <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
                  <div class="header"><div>${companyLogo?`<img src="${companyLogo}" class="company-logo" alt="logo" />`:''}<div class="company-name">${companyName}</div><div class="company-info">Lot de Production</div></div>
                  <div class="doc-title"><h1>LOT DE PRODUCTION</h1><div class="doc-numero">${l.numero_lot}</div><div class="doc-date">Début : ${l.date_debut||'—'}</div></div></div>
                  <table><thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead><tbody>
                    <tr><td>N° Lot</td><td class="r">${l.numero_lot}</td></tr>
                    <tr><td>Date début</td><td class="r">${l.date_debut||'—'}</td></tr>
                    <tr><td>Date fin</td><td class="r">${l.date_fin||'—'}</td></tr>
                    <tr><td>Qté paddy entrée (kg)</td><td class="r">${(l.qte_paddy_entree||0).toFixed(2)} kg</td></tr>
                    <tr><td>Statut</td><td class="r">${l.statut||'—'}</td></tr>
                    ${l.notes?`<tr><td>Notes</td><td class="r">${l.notes}</td></tr>`:''}
                  </tbody></table>
                  <div class="signatures"><div class="sig-box">Responsable production</div><div class="sig-box">Visa direction</div></div>
                </body></html>`
                return (
                <TR key={l.id}>
                  <TD bold>{l.numero_lot}</TD><TD>{l.date_debut}</TD><TD>{l.date_fin||'—'}</TD>
                  <TD right>{(l.qte_paddy_entree||0).toFixed(2)}</TD>
                  <TD><Badge type={{en_cours:'warning',termine:'success',annule:'danger'}[l.statut]||'secondary'}>{l.statut}</Badge></TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <Btn sm variant="info" onClick={()=>setRowPreview({html:lotHtml,label:l.numero_lot})}>👁️</Btn>
                      <Btn sm variant="danger" onClick={()=>{ openPrintWindow(lotHtml) }}>🖨️</Btn>
                      {!readOnly && <Btn sm variant="secondary" onClick={()=>open(l)}>✏️</Btn>}
                    </div>
                  </TD>
                </TR>
              )})}
            </tbody>
          </table>
          </div>
        )}
      </div>
      {/* Aperçu lot */}
      {rowPreview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:3000,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'white', borderRadius:12, width:'100%', maxWidth:860,
            maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 30px 80px rgba(0,0,0,.4)' }}>
            <div style={{ padding:'12px 20px', background:'#0f2044', borderRadius:'12px 12px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ color:'white', fontWeight:700 }}>👁️ Aperçu — {rowPreview.label}</span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{ openPrintWindow(rowPreview.html) }}
                  style={{ background:'#2563eb', color:'white', border:'none', padding:'7px 18px', borderRadius:7, fontWeight:700, cursor:'pointer' }}>🖨️ Imprimer</button>
                <button onClick={()=>setRowPreview(null)}
                  style={{ background:'rgba(255,255,255,.15)', color:'white', border:'none', padding:'7px 14px', borderRadius:7, fontWeight:700, cursor:'pointer' }}>✕</button>
              </div>
            </div>
            <iframe srcDoc={rowPreview.html} style={{ flex:1, border:'none', borderRadius:'0 0 12px 12px' }} title="Aperçu lot" />
          </div>
        </div>
      )}
      <Modal open={!!modal} onClose={close} title={modal==='add'?'Nouveau Lot':'Modifier Lot'}>
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="N° Lot *" name="numero_lot" value={form.numero_lot} onChange={set} required />
            <Input label="Date début" name="date_debut" type="date" value={form.date_debut} onChange={set} />
            <Input label="Date fin" name="date_fin" type="date" value={form.date_fin} onChange={set} />
            <Input label="Qté paddy entrée (kg)" name="qte_paddy_entree" type="number" value={form.qte_paddy_entree} onChange={set} min="0" step="0.001" />
            <Sel label="Statut" name="statut" value={form.statut} onChange={set}
              options={['en_cours','termine','annule'].map(s=>({value:s,label:s.replace('_',' ')}))} />
            <Span2><Input label="Notes" name="notes" value={form.notes} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── PRODUCTION ROW — PDF + APERÇU ────────────────────────────────────────────
function buildProductionRowHtml(it, title, fields, companyName) {
  const date = it.date_etape || it.date_reception || it.date_debut || '—'
  const lot   = it.compta_lots_production?.numero_lot || it.numero_lot || '—'
  const rowsHtml = fields
    .filter(f => f.name !== 'responsable_section')
    .map(f => {
      let val = it[f.name]
      if (val === null || val === undefined || val === '') val = '—'
      else if (f.type === 'number') val = (+(val)||0).toFixed(f.dec||2) + (f.unit ? ` ${f.unit}` : '')
      return `<tr><td style="font-weight:600;width:50%;padding:7px 10px;border-bottom:1px solid #e2e8f0">${f.label}</td><td style="text-align:right;padding:7px 10px;border-bottom:1px solid #e2e8f0">${val}</td></tr>`
    }).join('')
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">${companyName||''}</div>
        <div class="company-info">${title}</div>
      </div>
      <div class="doc-title">
        <h1>${title.toUpperCase()}</h1>
        <div class="doc-numero">N° Lot : ${lot}</div>
        <div class="doc-date">Date : ${date}</div>
      </div>
    </div>
    ${it.responsable_section ? `<div class="client-box"><strong>Responsable :</strong> ${it.responsable_section}</div>` : ''}
    <table>
      <thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="signatures" style="margin-top:40px">
      <div class="sig-box">Signature du responsable<br><small>${it.responsable_section||''}</small></div>
      <div class="sig-box">Visa superviseur</div>
    </div>
  </body></html>`
}

function ProductionRowPreviewModal({ open, onClose, it, title, fields, companyName }) {
  if (!open || !it) return null
  const html = buildProductionRowHtml(it, title, fields, companyName)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:3000,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:12, width:'100%', maxWidth:860,
        maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 30px 80px rgba(0,0,0,.4)' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #e2e8f0', display:'flex',
          alignItems:'center', justifyContent:'space-between', background:'#0f2044', borderRadius:'12px 12px 0 0' }}>
          <span style={{ color:'white', fontWeight:700, fontSize:15 }}>👁️ Aperçu — {title}</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ openPrintWindow(html) }}
              style={{ background:'#2563eb', color:'white', border:'none', padding:'7px 18px', borderRadius:7, fontWeight:700, fontSize:13, cursor:'pointer' }}>
              🖨️ Imprimer / PDF
            </button>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,.15)', color:'white', border:'none', padding:'7px 14px', borderRadius:7, fontWeight:700, fontSize:14, cursor:'pointer' }}>
              ✕ Fermer
            </button>
          </div>
        </div>
        <iframe srcDoc={html} style={{ flex:1, border:'none', borderRadius:'0 0 12px 12px', minHeight:0 }} title="Aperçu" />
      </div>
    </div>
  )
}

// ── PRODUCTION STAGE — GÉNÉRIQUE ──────────────────────────────────────────────
function ProductionStagePage({ tableName, title, accentColor, companies, companyId, lots, toast, fields, readOnly=false }) {
  const [items,      setItems]    = useState([])
  const [modal,      setModal]    = useState(false)
  const [form,       setForm]     = useState({})
  const [editItem,   setEditItem] = useState(null)   // null = ajout, objet = modification
  const [saving,     setSaving]   = useState(false)
  const [dateFrom,   setDateFrom] = useState('')
  const [dateTo,     setDateTo]   = useState('')
  const [rowPreview, setRowPreview] = useState(null)
  const [localLots,  setLocalLots]  = useState([])  // lots chargés selon companyId effectif

  // Chargement local des lots — synchronisé avec le companyId reçu (evite le décalage effectiveCompanyId)
  useEffect(()=>{
    const fetchLots = async () => {
      const { data:ad } = await supabase.auth.getUser()
      const uid=ad?.user?.id; if (!uid) return
      const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
      let q = supabase.from('compta_lots_production').select('id,numero_lot,statut').order('created_at',{ascending:false})
      if (isAdmin && companyId) q=q.eq('company_id',companyId)
      else if (companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
      else q=q.eq('user_id',uid)
      const { data }=await q; setLocalLots(data||[])
    }
    fetchLots()
  },[companyId])

  const load = useCallback(async()=>{
    const { data:authD } = await supabase.auth.getUser()
    const uid = authD?.user?.id; const isAdm = authD?.user?.email === SUPER_ADMIN_EMAIL
    if (!uid) return
    let q = supabase.from(tableName).select('*,compta_lots_production(numero_lot)').order('date_etape',{ascending:false})
    q = isAdm && companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if (companyId && !isAdm) q=q.eq('company_id',companyId)
    if (dateFrom)  q=q.gte('date_etape',dateFrom)
    if (dateTo)    q=q.lte('date_etape',dateTo)
    const { data } = await q; setItems(data||[])
  },[tableName,companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  // ── Calcul conditionnement ────────────────────────────────────────────────
  // Valeurs calculées en direct à chaque rendu (pas de state, pas d'effet)
  let condTotal = 0
  let condEcart = 0
  if (tableName === 'compta_conditionnement') {
    const s5   = parseFloat(form.nb_sac_5kg)   || 0
    const s25  = parseFloat(form.nb_sac_25kg)  || 0
    const s50  = parseFloat(form.nb_sac_50kg)  || 0
    const s5x5 = parseFloat(form.nb_sac_5x5kg) || 0
    const recu = parseFloat(form.poids_recu)   || 0
    const rest = parseFloat(form.reste)        || 0
    condTotal = (s5*5) + (s25*25) + (s50*50) + (s5x5*25)
    condEcart = recu - condTotal - rest
  }

  const getCalcValue = (fname) => {
    // Conditionnement
    if (fname === 'poids_total_conditionne') return Math.round(condTotal * 1000) / 1000
    if (tableName === 'compta_conditionnement' && fname === 'ecart') return Math.round(condEcart * 1000) / 1000

    // Étuvage
    if (tableName === 'compta_etuvage') {
      const paddy = parseFloat(form.paddy_envoye_kg)    || 0
      const recu  = parseFloat(form.riz_etuve_recu_kg)  || 0
      if (fname === 'ecart_kg')       return Math.round((paddy - recu) * 1000) / 1000
      if (fname === 'taux_rendement') return paddy > 0 ? Math.round((recu / paddy * 100) * 100) / 100 : 0
    }

    // Décorticage
    if (tableName === 'compta_decorticage' && fname === 'ecart') {
      const avant = parseFloat(form.poids_avant) || 0
      const apres = parseFloat(form.poids_apres) || 0
      return Math.round((avant - apres) * 1000) / 1000
    }

    // Calibrage
    if (tableName === 'compta_calibrage' && fname === 'ecart') {
      const avant  = parseFloat(form.poids_avant)      || 0
      const long   = parseFloat(form.poids_long_grain) || 0
      const casse  = parseFloat(form.poids_casses)     || 0
      const dechet = parseFloat(form.dechets)          || 0
      return Math.round((avant - long - casse - dechet) * 1000) / 1000
    }

    // Tri optique
    if (tableName === 'compta_tri_optique' && fname === 'ecart') {
      const avant  = parseFloat(form.poids_avant)     || 0
      const apres  = parseFloat(form.poids_apres_tri) || 0
      const hors   = parseFloat(form.hors_normes)     || 0
      const rouge  = parseFloat(form.rouge_a_polir)   || 0
      return Math.round((avant - apres - hors - rouge) * 1000) / 1000
    }

    return 0
  }

  const set = e => {
    const { name, value } = e.target
    // Auto-remplir numero_lot quand un lot est sélectionné
    if (name === 'lot_id' && value) {
      const lot = localLots.find(l => l.id === value)
      if (lot) { setForm(f=>({...f, lot_id:value, numero_lot: lot.numero_lot||''})); return }
    }
    setForm(f => ({ ...f, [name]: value }))
  }

  const openAdd = async () => {
    const cid = await getEffectiveCompanyId(companyId, companies)
    if (!cid) { toast.error('Veuillez sélectionner une société.'); return }
    const df = { company_id:cid, lot_id:'', date_etape:today() }
    fields.forEach(f => { df[f.name] = '' })
    setEditItem(null); setForm(df); setModal(true)
  }
  const openEdit = it => {
    setEditItem(it)
    const df = { ...it, company_id: it.company_id||companyId||companies[0]?.id||'', lot_id: it.lot_id||'' }
    setForm(df); setModal(true)
  }
  const close = () => { setModal(false); setEditItem(null) }

  const save = async e => {
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const cid = form.company_id || companyId || companies[0]?.id
    if (!cid) { toast.error('Société introuvable. Veuillez en sélectionner une.'); setSaving(false); return }
    const pay = { company_id:cid, lot_id:form.lot_id||null, date_etape:form.date_etape }
    fields.forEach(f => {
      if (f.calc) {
        pay[f.name] = getCalcValue(f.name)
      } else {
        pay[f.name] = f.type==='number' ? (parseFloat(form[f.name])||0) : (form[f.name]||'')
      }
    })
    const { error } = editItem
      ? await supabase.from(tableName).update(pay).eq('id', editItem.id)
      : await supabase.from(tableName).insert({...pay, user_id:uid})
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editItem ? 'Modification enregistrée !' : 'Enregistrement réussi !'); close(); load()
  }

  const exportExcel = () => {
    const period = dateFrom||dateTo ? `_${dateFrom||'debut'}_${dateTo||'fin'}` : ''
    const allFields = [{label:'Date'},{label:'N° Lot'},...fields.map(f=>({label:f.label,name:f.name,type:f.type,dec:f.dec,unit:f.unit}))]
    const thead = allFields.map(f=>`<th style="background:#0f2044;color:white;padding:6px 10px;white-space:nowrap">${f.label}</th>`).join('')
    const tbody = items.map((it,i)=>{
      const dateVal = it.date_etape||it.date_reception||''
      const lotVal  = it.compta_lots_production?.numero_lot||it.numero_lot||'—'
      const cells = [
        `<td>${dateVal}</td>`,
        `<td>${lotVal}</td>`,
        ...fields.map(f=>{
          const v = it[f.name]
          if (f.type==='number') return `<td style="text-align:right">${(+(v||0)).toFixed(f.dec||2)}${f.unit?' '+f.unit:''}</td>`
          return `<td>${v||'—'}</td>`
        })
      ].join('')
      return `<tr style="background:${i%2===0?'#f8fafc':'white'}">${cells}</tr>`
    }).join('')

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"><style>
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #d1d5db;padding:5px 8px;font-size:10pt}
        h2{font-family:Arial;color:#0f2044}p{font-family:Arial;font-size:9pt;color:#555}
      </style></head><body>
      <h2>${title}</h2>
      <p>${companyName}${dateFrom||dateTo?` — Période : ${dateFrom||'—'} → ${dateTo||'—'}`:''} — ${items.length} enregistrement(s) — Exporté le ${new Date().toLocaleDateString('fr-FR')}</p>
      <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
      </body></html>`

    const blob = new Blob(['\uFEFF'+html], {type:'application/vnd.ms-excel;charset=utf-8'})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href=url; a.download=`${title.toLowerCase().replace(/\s/g,'_')}${period}.xls`; a.click()
    URL.revokeObjectURL(url)
  }

  const del = async id => {
    if (!confirm('Supprimer cet enregistrement ?')) return
    await supabase.from(tableName).delete().eq('id', id)
    toast.success('Supprimé !'); load()
  }

  const summaryFields = fields.filter(f=>f.summary).slice(0,4)
  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''

  const printFiltered = () => {
    const headers = [
      {label:'Date'},{label:'N° Lot'},
      ...summaryFields.map(f=>({label:f.label,r:f.type==='number'})),
      {label:'Responsable'}
    ]
    const rows = items.map(it=>[
      it.date_etape||it.date_reception||'—',
      it.compta_lots_production?.numero_lot||it.numero_lot||'—',
      ...summaryFields.map(f=>f.type==='number'?(+(it[f.name]||0)).toFixed(f.dec||2)+(f.unit?` ${f.unit}`:''):(it[f.name]||'—')),
      it.responsable_section||'—',
    ])
    printFilteredList({ title, companyName, headers, rows, dateFrom, dateTo })
  }

  return (
    <div>
      <PageHeader title={title} subtitle={`${items.length} enregistrement(s)`}
        actions={<>
          <Btn sm variant="success" onClick={exportExcel}>📊 Excel</Btn>
          <Btn sm variant="danger" onClick={printFiltered}>🖨️ PDF</Btn>
          {!readOnly && <Btn onClick={openAdd}>+ Nouveau</Btn>}
        </>}
      />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>{title} — Aucun enregistrement</div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>Date</TH><TH>N° Lot</TH>
              {summaryFields.map(f=><TH key={f.name} right={f.type==='number'}>{f.label}</TH>)}
              <TH>Responsable</TH><TH>Action</TH>
            </tr></thead>
            <tbody>
              {items.map(it=>(
                <TR key={it.id}>
                  <TD sm>{it.date_etape||it.date_reception}</TD>
                  <TD>{it.compta_lots_production?.numero_lot||it.numero_lot||'—'}</TD>
                  {summaryFields.map(f=>(
                    <TD key={f.name} right={f.type==='number'}>
                      {f.type==='number'?(+(it[f.name]||0)).toFixed(f.dec||2)+(f.unit?` ${f.unit}`:''):(it[f.name]||'—')}
                    </TD>
                  ))}
                  <TD sm>{it.responsable_section||'—'}</TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <Btn sm variant="info" onClick={()=>setRowPreview(it)}>👁️</Btn>
                      <Btn sm variant="danger" onClick={()=>{ const html=buildProductionRowHtml(it,title,fields,companyName); openPrintWindow(html) }}>🖨️</Btn>
                      {!readOnly && <Btn sm variant="secondary" onClick={()=>openEdit(it)}>✏️</Btn>}
                      {!readOnly && <Btn sm variant="danger" onClick={()=>del(it.id)}>🗑️</Btn>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <Modal open={modal} onClose={close} title={editItem ? `Modifier — ${title}` : `Nouveau — ${title}`} size="lg">
        <form onSubmit={save}>
          {/* Bandeau résultats calculés — toujours visible en haut du formulaire */}
          {fields.some(f=>f.calc) && (
            <div style={{display:'grid',gridTemplateColumns:`repeat(${fields.filter(f=>f.calc).length},1fr)`,gap:10,marginBottom:16,padding:'12px 16px',background:'#0f2044',borderRadius:10}}>
              {fields.filter(f=>f.calc).map(f=>{
                const val = getCalcValue(f.name)
                const isNeg = val < 0
                const isZero = val === 0
                return (
                  <div key={f.name} style={{textAlign:'center'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.6)',textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>{f.label}</div>
                    <div style={{fontSize:20,fontWeight:800,color:isZero?'#4ade80':isNeg?'#f87171':'#60a5fa'}}>
                      {val.toFixed(f.dec||2)}<span style={{fontSize:12,marginLeft:3}}>{f.unit||''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Lot de production" name="lot_id" value={form.lot_id||''} onChange={set}
              options={[{value:'',label:localLots.length===0?'— Aucun lot disponible —':'— Choisir un lot —'},...localLots.map(l=>({value:l.id,label:`${l.numero_lot}${l.statut?' ('+l.statut+')':''}`}))]} />
            <Input label="Date" name="date_etape" type="date" value={form.date_etape||''} onChange={set} />
            {fields.filter(f => !f.calc).map(f=> f.type==='select'
              ? <Sel key={f.name} label={f.label} name={f.name} value={form[f.name]||''} onChange={set} options={f.options||[]} />
              : <Input key={f.name} label={f.label} name={f.name} type={f.type||'text'} value={form[f.name]??''} onChange={set} min={f.type==='number'?'0':undefined} step={f.type==='number'?'0.001':undefined} placeholder={f.placeholder} />
            )}
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':(editItem?'Modifier':'Enregistrer')}</Btn></Row>
        </form>
      </Modal>
      <ProductionRowPreviewModal open={!!rowPreview} onClose={()=>setRowPreview(null)} it={rowPreview} title={title} fields={fields} companyName={companyName} />
    </div>
  )
}

// ── PRESTATIONS ──────────────────────────────────────────────────────────────
function buildPrestationHtml(row, companyName) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Facture Prestation ${row.numero_facture||''}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">${companyName||''}</div>
        <div class="company-info">Prestation de service</div>
      </div>
      <div class="doc-title">
        <h1>FACTURE PRESTATION</h1>
        <div class="doc-numero">N° ${row.numero_facture||'—'}</div>
        <div class="doc-date">Date : ${row.date_prestation||'—'}</div>
      </div>
    </div>
    <div class="client-box"><strong>Client :</strong> ${row.nom_client||'—'}</div>
    <table>
      <thead><tr>
        <th>Description du produit / service</th>
        <th class="r" style="width:80px">Quantité</th>
        <th class="r" style="width:130px">Prix unitaire (FCFA)</th>
        <th class="r" style="width:140px">Montant (FCFA)</th>
      </tr></thead>
      <tbody>
        <tr>
          <td>${row.description||'—'}</td>
          <td class="r">${(+(row.quantite)||0).toFixed(2)}</td>
          <td class="r">${Math.round(+(row.prix)||0).toLocaleString('fr-FR')}</td>
          <td class="r"><strong>${Math.round(+(row.montant)||0).toLocaleString('fr-FR')}</strong></td>
        </tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="ttc"><span>MONTANT TOTAL</span><span>${Math.round(+(row.montant)||0).toLocaleString('fr-FR')} FCFA</span></div>
    </div>
    <div class="signatures">
      <div class="sig-box">Signature du prestataire</div>
      <div class="sig-box">Signature du client<br><small>${row.nom_client||''}</small></div>
    </div>
  </body></html>`
}

function PrestationPreviewModal({ open, onClose, row, companyName }) {
  if (!open || !row) return null
  const html = buildPrestationHtml(row, companyName)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:3000,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:12, width:'100%', maxWidth:900,
        maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 30px 80px rgba(0,0,0,.4)' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #e2e8f0', display:'flex',
          alignItems:'center', justifyContent:'space-between', background:'#0f2044', borderRadius:'12px 12px 0 0' }}>
          <span style={{ color:'white', fontWeight:700, fontSize:15 }}>
            👁️ Aperçu — {row.numero_facture||'Prestation'}
          </span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ openPrintWindow(html) }}
              style={{ background:'#2563eb', color:'white', border:'none', padding:'7px 18px',
                borderRadius:7, fontWeight:700, fontSize:13, cursor:'pointer' }}>
              🖨️ Imprimer / PDF
            </button>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,.15)', color:'white', border:'none',
                padding:'7px 14px', borderRadius:7, fontWeight:700, fontSize:14, cursor:'pointer' }}>
              ✕ Fermer
            </button>
          </div>
        </div>
        <iframe srcDoc={html} style={{ flex:1, border:'none', borderRadius:'0 0 12px 12px', minHeight:0 }} title="Aperçu prestation" />
      </div>
    </div>
  )
}

function PrestationPage({ companies, companyId, toast, readOnly=false }) {
  const [items,  setItems]  = useState([])
  const [modal,  setModal]  = useState(false)
  const [form,   setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { data:adons } = await supabase.auth.getUser(); const uidons=adons?.user?.id; const isAdmons=adons?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_prestations').select('*,compta_companies(raison_sociale)').order('date_prestation',{ascending:false})
    q = isAdmons&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uidons); if(companyId&&!isAdmons) q=q.eq('company_id',companyId)
    if (dateFrom)  q=q.gte('date_prestation',dateFrom)
    if (dateTo)    q=q.lte('date_prestation',dateTo)
    const { data } = await q; setItems(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const set = e => {
    const { name, value } = e.target
    setForm(f=>{
      const nf = {...f,[name]:value}
      if (name==='quantite'||name==='prix') nf.montant = Math.round((parseFloat(name==='quantite'?value:nf.quantite)||0)*(parseFloat(name==='prix'?value:nf.prix)||0))
      return nf
    })
  }

  const openAdd = async ()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { count } = await supabase.from('compta_prestations').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero = `PREST-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`
    setForm({ company_id:companyId||companies[0]?.id||'', numero_facture:numero, date_prestation:today(), nom_client:'', description:'', quantite:1, prix:0, montant:0 })
    setModal(true)
  }
  const close = ()=>setModal(false)

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { company_id,numero_facture,date_prestation,nom_client,description,quantite,prix } = form
    const montant = Math.round((parseFloat(quantite)||0)*(parseFloat(prix)||0))
    const { error } = await supabase.from('compta_prestations').insert({ company_id,user_id:uid,numero_facture,date_prestation,nom_client,description,quantite:+quantite,prix:+prix,montant })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Prestation enregistrée !'); close(); load()
  }

  const del = async id=>{
    if (!confirm('Supprimer cette prestation ?')) return
    await supabase.from('compta_prestations').delete().eq('id',id)
    toast.success('Supprimée.'); load()
  }

  const total = items.reduce((s,r)=>s+(r.montant||0),0)
  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''

  const printFilteredP = () => {
    const headers = [{label:'N° Facture'},{label:'Date'},{label:'Client'},{label:'Description'},{label:'Qté',r:true},{label:'Prix U.',r:true},{label:'Montant',r:true}]
    const rows = items.map(r=>[r.numero_facture||'—',r.date_prestation,r.nom_client||'—',r.description||'—',(r.quantite||0).toFixed(2),Math.round(r.prix||0).toLocaleString('fr-FR')+' FCFA',Math.round(r.montant||0).toLocaleString('fr-FR')+' FCFA'])
    printFilteredList({ title:'Prestations', companyName, headers, rows, dateFrom, dateTo,
      totals:[{label:'Total', value:Math.round(total).toLocaleString('fr-FR')+' FCFA'}]})
  }

  return (
    <div>
      <PageHeader title="Prestations" subtitle={`${items.length} prestation(s) — Total : ${fcfa(total)}`}
        actions={<>
          <Btn sm variant="danger" onClick={printFilteredP}>🖨️ PDF liste</Btn>
          {!readOnly && <Btn onClick={openAdd}>+ Nouvelle Prestation</Btn>}
        </>}
      />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
            <div style={{fontSize:40,marginBottom:8}}>🛠️</div>
            <p>Aucune prestation enregistrée</p>
            <Btn onClick={openAdd}>+ Créer une prestation</Btn>
          </div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N° Facture</TH><TH>Date</TH><TH>Client</TH>
              <TH>Description</TH><TH right>Qté</TH><TH right>Prix U.</TH>
              <TH right>Montant</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero_facture||'—'}</TD>
                  <TD sm>{r.date_prestation}</TD>
                  <TD bold>{r.nom_client||'—'}</TD>
                  <TD sm>{r.description||'—'}</TD>
                  <TD right>{(r.quantite||0).toFixed(2)}</TD>
                  <TD right sm>{fcfa(r.prix)}</TD>
                  <TD right bold color={ACCENT}>{fcfa(r.montant)}</TD>
                  <TD>
                    <div style={{display:'flex',gap:6}}>
                      <Btn sm variant="info" onClick={()=>setPreview(r)}>👁️ Aperçu</Btn>
                      <Btn sm variant="danger" onClick={()=>{ const html=buildPrestationHtml(r,companyName); openPrintWindow(html) }}>🖨️ PDF</Btn>
                      <Btn sm variant="danger" onClick={()=>del(r.id)}>🗑️ Sup</Btn>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <PrestationPreviewModal open={!!preview} onClose={()=>setPreview(null)} row={preview} companyName={companyName} />

      <Modal open={modal} onClose={close} title="Nouvelle Prestation" size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="N° Facture" name="numero_facture" value={form.numero_facture} onChange={set} />
            <Input label="Date *" name="date_prestation" type="date" value={form.date_prestation} onChange={set} required />
            <Input label="Nom du client *" name="nom_client" value={form.nom_client} onChange={set} required />
            <Span2>
              <Input label="Description du produit / service *" name="description" value={form.description} onChange={set} required placeholder="Ex: Réparation moteur, Consultation, Formation..." />
            </Span2>
            <Input label="Quantité *" name="quantite" type="number" value={form.quantite} onChange={set} required min="0" step="0.01" />
            <Input label="Prix unitaire (FCFA) *" name="prix" type="number" value={form.prix} onChange={set} required min="0" />
            <Span2>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Montant <span style={{color:ACCENT,fontSize:10,fontWeight:700}}>calculé</span></label>
              <div style={{padding:'9px 12px',background:'#eff6ff',borderRadius:8,border:'1px solid #bfdbfe',fontSize:15,fontWeight:800,color:ACCENT}}>{fcfa(form.montant||0)}</div>
            </Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'💾 Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── ACHATS SEMI-FINIS ─────────────────────────────────────────────────────────
function AchatsSemisPage({ companies, companyId, toast, readOnly=false }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [viewItem, setViewItem] = useState(null)
  const [fournsRaw, setFournsRaw] = useState([])
  const [fournModal, setFournModal] = useState(false)
  const [fournForm, setFournForm]   = useState({})
  const [fournSaving, setFournSaving] = useState(false)

  const loadFourns = useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_fournisseurs').select('id,type,nom,nom_societe')
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    const { data }=await q; setFournsRaw(data||[])
  },[companyId])
  useEffect(()=>{ loadFourns() },[loadFourns])

  const fournsNames = [...new Set((fournsRaw||[]).map(f=> f.type==='morale' ? (f.nom_societe||'') : (f.nom||'')).filter(n=>n.trim()!==''))].sort((a,b)=>a.localeCompare(b))

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { data:adnis } = await supabase.auth.getUser(); const uidnis=adnis?.user?.id; const isAdmnis=adnis?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_achats_semi_finis').select('*,compta_companies(raison_sociale)').order('date_achat',{ascending:false})
    q = isAdmnis&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uidnis); if(companyId&&!isAdmnis) q=q.eq('company_id',companyId)
    if (dateFrom)  q=q.gte('date_achat',dateFrom)
    if (dateTo)    q=q.lte('date_achat',dateTo)
    const { data } = await q; setItems(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const total = items.reduce((s,r)=>s+(r.montant||0),0)
  const set = e=>{
    setForm(f=>{
      const nf={...f,[e.target.name]:e.target.value}
      if (e.target.name==='quantite'||e.target.name==='prix_unitaire') nf.montant=Math.round((parseFloat(nf.quantite)||0)*(parseFloat(nf.prix_unitaire)||0))
      return nf
    })
  }
  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',numero_fact:'',date_achat:today(),entite:'',nom_fournisseur:'',provenance:'',nom_acheteur:'',id_produit:'',nature_produit:'',quantite:0,prix_unitaire:0,montant:0,statut:'en_cours',compte_paiement:'caisse'}); setModal(true) }
  const close = ()=>setModal(false)

  // Ouvre le formulaire d'ajout fournisseur (pré-rempli avec le nom tapé)
  const openFournModal = () => {
    const nom = (form.nom_fournisseur||'').trim()
    if (nom && fournsNames.some(n=>n.toLowerCase()===nom.toLowerCase())) { toast.error('Ce fournisseur existe déjà.'); return }
    setFournForm({ type:'physique', nom, nom_societe:'', telephone:'', provenance:form.provenance||'', cooperative_affiliee:'', numero_contrat:'', cip:'', ifu:'', email:'', adresse:'' })
    setFournModal(true)
  }
  const setFourn = e => setFournForm(f=>({...f,[e.target.name]:e.target.value}))

  // Enregistre le fournisseur dans la table (avec sécurité anti-doublon)
  const saveFourn = async e => {
    e.preventDefault()
    const isMorale = fournForm.type==='morale'
    const nomAff = (isMorale ? fournForm.nom_societe : fournForm.nom || '').trim()
    if (!nomAff) { toast.error(isMorale?'Saisissez la raison sociale.':'Saisissez le nom du fournisseur.'); return }
    if (fournsNames.some(n=>n.toLowerCase()===nomAff.toLowerCase())) { toast.error('Ce fournisseur existe déjà.'); return }
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const cid = form.company_id||companyId||companies[0]?.id
    if (!cid) { toast.error('Veuillez sélectionner une société.'); return }
    setFournSaving(true)
    const { data:ins, error } = await supabase.from('compta_fournisseurs').insert({
      company_id:cid, user_id:uid, type:fournForm.type,
      nom: isMorale ? '' : nomAff, nom_societe: isMorale ? nomAff : '',
      telephone:fournForm.telephone||null, provenance:fournForm.provenance||null,
      cooperative_affiliee:fournForm.cooperative_affiliee||null, numero_contrat:fournForm.numero_contrat||null,
      cip:fournForm.cip||null, ifu:fournForm.ifu||null, email:fournForm.email||null, adresse:fournForm.adresse||null,
    }).select('id').single()
    if (error) { setFournSaving(false); toast.error(error.message); return }
    try {
      await attribuerCompteTiers({ tableTiers:'compta_fournisseurs', tiersId:ins.id,
        collectif:COLLECTIF_FOURNISSEUR, libelleCollectif:'Fournisseurs', libelleCompte:nomAff, cid, uid })
    } catch(_) {}
    setFournSaving(false)
    toast.success(`Fournisseur « ${nomAff} » enregistré.`)
    setFournModal(false)
    setForm(f=>({...f, nom_fournisseur:nomAff}))
    loadFourns()
  }

  const deleteAchat = async (id) => {
    if (!window.confirm('Supprimer cet achat ?')) return
    const { error } = await supabase.from('compta_achats_semi_finis').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    await supprimerSortiesJournal('achat_semi_fini', id)
    toast.success('Achat supprimé !'); load()
  }

  const save = async e=>{
    e.preventDefault()
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { company_id,numero_fact,date_achat,entite,nom_fournisseur,provenance,nom_acheteur,id_produit,nature_produit,quantite,prix_unitaire,statut,compte_paiement } = form
    const compte = compte_paiement
    if (!JOURNAL_TABLE[compte]) { toast.error('Veuillez choisir un compte de paiement.'); return }
    const montant = Math.round((parseFloat(quantite)||0)*(parseFloat(prix_unitaire)||0))
    if (montant <= 0) { toast.error('Le montant de l\u2019achat doit être supérieur à 0.'); return }
    const cid = company_id||companyId||companies[0]?.id
    setSaving(true)
    const soldeCompte = await getSoldeCompte(compte, cid)
    if (montant > soldeCompte) {
      setSaving(false)
      toast.error(`Vous ne pouvez pas régler par ce compte : solde insuffisant (${JOURNAL_LABEL[compte]} : ${fcfa(soldeCompte)}).`)
      return
    }
    const { data:ins, error } = await supabase.from('compta_achats_semi_finis').insert({ company_id:cid,user_id:uid,numero_fact,date_achat,entite,nom_fournisseur,provenance,nom_acheteur,id_produit,nature_produit,quantite:+quantite,prix_unitaire:+prix_unitaire,montant,statut,compte_paiement:compte }).select('id').single()
    if (error) { setSaving(false); toast.error(error.message); return }
    const { error:errJ } = await creerSortieJournal({
      compte, cid, uid, date:date_achat, montant,
      libelle:`Achat semi-fini ${nom_fournisseur||''}${numero_fact?(' — '+numero_fact):''}`.trim(),
      tiers:nom_fournisseur, reference:numero_fact,
      sourceType:'achat_semi_fini', sourceId:ins.id,
    })
    setSaving(false)
    if (errJ) toast.error('Achat enregistré, mais erreur sur le journal : '+errJ.message)
    else toast.success(`Achat enregistré — sortie ${JOURNAL_LABEL[compte]} : ${fcfa(montant)}`)
    close(); load()
  }

  const companyNameA = companies.find(c=>c.id===companyId)?.raison_sociale||''
  const printFilteredA = () => {
    const headers = [{label:'N° Fact.'},{label:'Date'},{label:'Entité'},{label:'Fournisseur'},{label:'Provenance'},{label:'Produit'},{label:'Qté (kg)',r:true},{label:'P.U.',r:true},{label:'Montant',r:true},{label:'Statut'}]
    const rows = items.map(r=>[r.numero_fact||'—',r.date_achat,r.entite||'—',r.nom_fournisseur||'—',r.provenance||'—',r.nature_produit||'—',(r.quantite||0).toFixed(2),Math.round(r.prix_unitaire||0).toLocaleString('fr-FR')+' FCFA',Math.round(r.montant||0).toLocaleString('fr-FR')+' FCFA',r.statut||'—'])
    printFilteredList({ title:'Achats Semi-finis', companyName:companyNameA, headers, rows, dateFrom, dateTo,
      totals:[{label:'Total', value:Math.round(total).toLocaleString('fr-FR')+' FCFA'}]})
  }

  return (
    <div>
      <PageHeader title="Achats Semi-finis" subtitle={`${items.length} achat(s) — Total : ${fcfa(total)}`}
        actions={<>
          <Btn sm variant="danger" onClick={printFilteredA}>🖨️ PDF liste</Btn>
          {!readOnly && <Btn onClick={openAdd}>+ Nouvel Achat</Btn>}
        </>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>🛒 Aucun achat semi-fini</div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N° Fact.</TH><TH>Date</TH><TH>Entité</TH><TH>Fournisseur</TH><TH>Provenance</TH>
              <TH>Produit</TH><TH right>Qté (kg)</TH><TH right>P.U</TH><TH right>Montant</TH><TH>Statut</TH><TH>Action</TH>
            </tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero_fact||'—'}</TD><TD sm>{r.date_achat}</TD>
                  <TD sm>{r.entite||'—'}</TD><TD sm>{r.nom_fournisseur||'—'}</TD>
                  <TD sm>{r.provenance||'—'}</TD><TD sm>{r.nature_produit||'—'}</TD>
                  <TD right>{(r.quantite||0).toFixed(2)}</TD>
                  <TD right sm>{fcfa(r.prix_unitaire)}</TD>
                  <TD right bold>{fcfa(r.montant)}</TD>
                  <TD><Badge type={{en_cours:'warning',receptionne:'success',annule:'danger'}[r.statut]||'secondary'}>{r.statut}</Badge></TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <button title="Voir" onClick={()=>setViewItem(r)} style={{background:'#0ea5e9',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>👁️</button>
                      <button title="Imprimer" onClick={()=>printAchatSemiFini(r)} style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🖨️</button>
                      {!readOnly && <button title="Supprimer" onClick={()=>deleteAchat(r.id)} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🗑️</button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      {viewItem && (
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={"Détail Achat — "+( viewItem.numero_fact||'—')} size="lg">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14}}>
            {[
              ['N° Facture', viewItem.numero_fact||'—'],
              ['Date', viewItem.date_achat||'—'],
              ['Entité', viewItem.entite||'—'],
              ['Fournisseur', viewItem.nom_fournisseur||'—'],
              ['Provenance', viewItem.provenance||'—'],
              ['Acheteur', viewItem.nom_acheteur||'—'],
              ['ID Produit', viewItem.id_produit||'—'],
              ['Nature produit', viewItem.nature_produit||'—'],
              ['Quantité', (viewItem.quantite||0).toFixed(2)+' kg'],
              ['Prix unitaire', fcfa(viewItem.prix_unitaire)],
              ['Statut', viewItem.statut||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600,color:'#1e293b'}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:20,padding:'14px 18px',background:'#eff6ff',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:'#475569',fontWeight:600}}>MONTANT TOTAL</span>
            <span style={{fontSize:20,fontWeight:800,color:'#1d4ed8'}}>{fcfa(viewItem.montant)}</span>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printAchatSemiFini(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouvel Achat Semi-fini" size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="N° Facture" name="numero_fact" value={form.numero_fact} onChange={set} />
            <Input label="Date *" name="date_achat" type="date" value={form.date_achat} onChange={set} required />
            <Input label="Entité" name="entite" value={form.entite} onChange={set} />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Nom fournisseur</label>
              <input name="nom_fournisseur" value={form.nom_fournisseur||''} onChange={set} list="achat-fourn-list"
                placeholder="Saisir / choisir un fournisseur"
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13.5,boxSizing:'border-box',background:'white'}} />
              <datalist id="achat-fourn-list">
                {fournsNames.map((n,i)=><option key={i} value={n} />)}
              </datalist>
              {(form.nom_fournisseur||'').trim()!=='' && !fournsNames.some(n=>n.toLowerCase()===(form.nom_fournisseur||'').trim().toLowerCase()) && (
                <button type="button" onClick={openFournModal}
                  style={{marginTop:6,padding:'6px 10px',background:'#ecfdf5',border:'1px solid #86efac',borderRadius:8,cursor:'pointer',fontSize:12.5,fontWeight:600,color:'#16a34a'}}>
                  ➕ Ce fournisseur n'existe pas — l'ajouter
                </button>
              )}
            </div>
            <Input label="Provenance" name="provenance" value={form.provenance} onChange={set} />
            <Input label="Nom acheteur" name="nom_acheteur" value={form.nom_acheteur} onChange={set} />
            <Input label="ID Produit" name="id_produit" value={form.id_produit} onChange={set} />
            <Input label="Nature du produit *" name="nature_produit" value={form.nature_produit} onChange={set} required />
            <Input label="Quantité (kg) *" name="quantite" type="number" value={form.quantite} onChange={set} required min="0" step="0.001" />
            <Input label="Prix unitaire (FCFA/kg)" name="prix_unitaire" type="number" value={form.prix_unitaire} onChange={set} min="0" />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Montant calculé</label>
              <div style={{padding:'9px 12px',background:'#eff6ff',borderRadius:8,border:'1px solid #bfdbfe',fontSize:14,fontWeight:700,color:ACCENT}}>{fcfa(form.montant||0)}</div>
            </div>
            <Sel label="Compte de paiement *" name="compte_paiement" value={form.compte_paiement||'caisse'} onChange={set} options={COMPTE_OPTIONS} />
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>

      <Modal open={fournModal} onClose={()=>setFournModal(false)} title="Nouveau Fournisseur" size="lg">
        <form onSubmit={saveFourn}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Type de personne" name="type" value={fournForm.type||'physique'} onChange={setFourn}
              options={[{value:'physique',label:'Personne physique'},{value:'morale',label:'Personne morale'}]} />
            {fournForm.type==='morale'
              ? <Input label="Raison sociale *" name="nom_societe" value={fournForm.nom_societe||''} onChange={setFourn} required />
              : <Input label="Nom et prénom(s) *" name="nom" value={fournForm.nom||''} onChange={setFourn} required />}
            <Input label="Téléphone" name="telephone" value={fournForm.telephone||''} onChange={setFourn} />
            <Input label="Provenance" name="provenance" value={fournForm.provenance||''} onChange={setFourn} />
            <Input label="Coopérative affiliée" name="cooperative_affiliee" value={fournForm.cooperative_affiliee||''} onChange={setFourn} />
            <Input label="N° Contrat" name="numero_contrat" value={fournForm.numero_contrat||''} onChange={setFourn} />
            <Input label="N° CIP" name="cip" value={fournForm.cip||''} onChange={setFourn} />
            <Input label="N° IFU" name="ifu" value={fournForm.ifu||''} onChange={setFourn} />
            <Input label="Email" name="email" value={fournForm.email||''} onChange={setFourn} />
            <Input label="Adresse" name="adresse" value={fournForm.adresse||''} onChange={setFourn} />
          </Grid>
          <Row><Btn variant="secondary" onClick={()=>setFournModal(false)}>Annuler</Btn><Btn type="submit" disabled={fournSaving}>{fournSaving?'...':'Enregistrer le fournisseur'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── RÈGLEMENTS ────────────────────────────────────────────────────────────────


// ── LOTS SEMI-FINIS ───────────────────────────────────────────────────────────
function LotsSemiFinisPage({ companies, companyId, toast, readOnly=false }) {
  const [lots,       setLots]      = useState([])
  const [modal,      setModal]     = useState(null) // null | 'add' | 'edit'
  const [form,       setForm]      = useState({})
  const [saving,     setSaving]    = useState(false)
  const [dateFrom,   setDateFrom]  = useState('')
  const [dateTo,     setDateTo]    = useState('')
  const [rowPreview, setRowPreview]= useState(null)

  const load = useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    if (!uid) return
    let q=supabase.from('compta_lots_semi_finis').select('*,compta_companies(raison_sociale)').order('date_reception',{ascending:false})
    if(isAdmin&&companyId) q=q.eq('company_id',companyId)
    else q=q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    if(dateFrom) q=q.gte('date_reception',dateFrom)
    if(dateTo)   q=q.lte('date_reception',dateTo)
    const { data }=await q; setLots(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const open=(l=null)=>{
    setForm(l?{...l}:{
      company_id:companyId||companies[0]?.id||'',
      numero_lot:`LSF-${Date.now().toString().slice(-6)}`,
      date_reception:today(), fournisseur:'', provenance:'',
      nature_produit:'', quantite_recue:0, unite:'kg',
      statut:'en_stock', notes:''
    })
    setModal(l?'edit':'add')
  }
  const close=()=>setModal(null)

  const deleteLot=async(id)=>{
    if(!window.confirm('Supprimer ce lot ?')) return
    const { error }=await supabase.from('compta_lots_semi_finis').delete().eq('id',id)
    if(error){ toast.error(error.message); return }
    toast.success('Lot supprimé !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    let company_id=form.company_id||companyId||companies[0]?.id
    if(!company_id) company_id = await getEffectiveCompanyId(companyId, companies)
    if(!company_id){ toast.error('Veuillez sélectionner une société.'); setSaving(false); return }
    const pay={
      company_id, numero_lot:form.numero_lot, date_reception:form.date_reception,
      fournisseur:form.fournisseur, provenance:form.provenance,
      nature_produit:form.nature_produit,
      quantite_recue:parseFloat(form.quantite_recue)||0, unite:form.unite,
      statut:form.statut, notes:form.notes
    }
    const { error }=modal==='add'
      ? await supabase.from('compta_lots_semi_finis').insert({...pay,user_id:uid})
      : await supabase.from('compta_lots_semi_finis').update(pay).eq('id',form.id)
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Lot enregistré !'); close(); load()
  }

  const companyName=companies.find(c=>c.id===companyId)?.raison_sociale||''

  const buildHtml=(l)=>`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Lot Semi-fini ${l.numero_lot}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header">
      <div><div class="company-name">${companyName}</div><div class="company-info">Lot de Produit Semi-fini</div></div>
      <div class="doc-title"><h1>LOT SEMI-FINI</h1>
        <div class="doc-numero">${l.numero_lot}</div>
        <div class="doc-date">Date réception : ${l.date_reception||'—'}</div>
      </div>
    </div>
    <table><thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead><tbody>
      <tr><td>N° Lot</td><td class="r">${l.numero_lot}</td></tr>
      <tr><td>Date de réception</td><td class="r">${l.date_reception||'—'}</td></tr>
      <tr><td>Fournisseur</td><td class="r">${l.fournisseur||'—'}</td></tr>
      <tr><td>Provenance</td><td class="r">${l.provenance||'—'}</td></tr>
      <tr><td>Nature du produit</td><td class="r">${l.nature_produit||'—'}</td></tr>
      <tr><td>Quantité reçue</td><td class="r">${(l.quantite_recue||0).toFixed(2)} ${l.unite||'kg'}</td></tr>
      <tr><td>Statut</td><td class="r">${l.statut||'—'}</td></tr>
      ${l.notes?`<tr><td>Notes</td><td class="r">${l.notes}</td></tr>`:''}
    </tbody></table>
    <div class="signatures">
      <div class="sig-box">Responsable réception</div>
      <div class="sig-box">Visa direction</div>
    </div>
  </body></html>`

  const printFiltered=()=>{
    const headers=[{label:'N° Lot'},{label:'Date réception'},{label:'Fournisseur'},{label:'Provenance'},{label:'Produit'},{label:'Qté reçue',r:true},{label:'Unité'},{label:'Statut'}]
    const rows=lots.map(l=>[l.numero_lot,l.date_reception,l.fournisseur||'—',l.provenance||'—',l.nature_produit||'—',(l.quantite_recue||0).toFixed(2),l.unite||'kg',l.statut||'—'])
    printFilteredList({ title:'Lots Semi-finis', companyName, headers, rows, dateFrom, dateTo })
  }

  const totalQte=lots.reduce((s,l)=>s+(l.quantite_recue||0),0)

  return (
    <div>
      <PageHeader title="Lots de Produits Semi-finis" subtitle={`${lots.length} lot(s) — Total : ${totalQte.toFixed(2)} kg`}
        actions={<>
          <Btn sm variant="danger" onClick={printFiltered}>🖨️ PDF liste</Btn>
          {!readOnly&&<Btn onClick={()=>open()}>+ Nouveau Lot</Btn>}
        </>}
      />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {lots.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📦 Aucun lot semi-fini</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N° Lot</TH><TH>Date récep.</TH><TH>Fournisseur</TH><TH>Provenance</TH>
              <TH>Produit</TH><TH right>Qté reçue</TH><TH>Statut</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {lots.map(l=>(
                <TR key={l.id}>
                  <TD bold>{l.numero_lot}</TD>
                  <TD>{l.date_reception}</TD>
                  <TD sm>{l.fournisseur||'—'}</TD>
                  <TD sm>{l.provenance||'—'}</TD>
                  <TD sm>{l.nature_produit||'—'}</TD>
                  <TD right>{(l.quantite_recue||0).toFixed(2)} {l.unite||'kg'}</TD>
                  <TD><Badge type={{en_stock:'success',epuise:'danger',en_cours:'warning'}[l.statut]||'secondary'}>{l.statut}</Badge></TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <Btn sm variant="info"    onClick={()=>setRowPreview({html:buildHtml(l),label:l.numero_lot})}>👁️</Btn>
                      <Btn sm variant="danger"  onClick={()=>{ openPrintWindow(buildHtml(l)) }}>🖨️</Btn>
                      {!readOnly&&<Btn sm variant="secondary" onClick={()=>open(l)}>✏️</Btn>}
                      {!readOnly&&<Btn sm variant="danger"    onClick={()=>deleteLot(l.id)}>🗑️</Btn>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Aperçu lot */}
      {rowPreview&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:3000,
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'white',borderRadius:12,width:'100%',maxWidth:860,
            maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 30px 80px rgba(0,0,0,.4)'}}>
            <div style={{padding:'12px 20px',background:'#0f2044',borderRadius:'12px 12px 0 0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{color:'white',fontWeight:700}}>👁️ Aperçu — {rowPreview.label}</span>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{ openPrintWindow(rowPreview.html) }}
                  style={{background:'#2563eb',color:'white',border:'none',padding:'7px 18px',borderRadius:7,fontWeight:700,cursor:'pointer'}}>🖨️ Imprimer</button>
                <button onClick={()=>setRowPreview(null)}
                  style={{background:'rgba(255,255,255,.15)',color:'white',border:'none',padding:'7px 14px',borderRadius:7,fontWeight:700,cursor:'pointer'}}>✕</button>
              </div>
            </div>
            <iframe srcDoc={rowPreview.html} style={{flex:1,border:'none',borderRadius:'0 0 12px 12px'}} title="Aperçu lot" />
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={close} title={modal==='add'?'Nouveau Lot Semi-fini':'Modifier Lot Semi-fini'} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="N° Lot *" name="numero_lot" value={form.numero_lot||''} onChange={set} required />
            <Input label="Date de réception *" name="date_reception" type="date" value={form.date_reception||''} onChange={set} required />
            <Input label="Fournisseur" name="fournisseur" value={form.fournisseur||''} onChange={set} />
            <Input label="Provenance" name="provenance" value={form.provenance||''} onChange={set} />
            <Input label="Nature du produit *" name="nature_produit" value={form.nature_produit||''} onChange={set} required />
            <Input label="Quantité reçue *" name="quantite_recue" type="number" value={form.quantite_recue||0} onChange={set} required min="0" step="0.001" />
            <Sel label="Unité" name="unite" value={form.unite||'kg'} onChange={set}
              options={['kg','tonne','sac','carton','unité'].map(u=>({value:u,label:u}))} />
            <Sel label="Statut" name="statut" value={form.statut||'en_stock'} onChange={set}
              options={[{value:'en_stock',label:'En stock'},{value:'en_cours',label:'En cours'},{value:'epuise',label:'Épuisé'}]} />
            <Span2><Input label="Notes" name="notes" value={form.notes||''} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── CONSTANTES SECTIONS ───────────────────────────────────────────────────────
const ALL_SECTIONS = [
  ['dashboard','Tableau de bord'],['companies','Sociétés'],['clients','Clients'],
  ['fournisseurs','Fournisseurs'],['stock','Articles & Stock'],['mouvements','Mouvements'],
  ['inventaire','Inventaire'],['commercial','Documents commerciaux'],['reglements_clients','Règlements Clients'],['reglements_fourn','Règlements Fournisseurs'],
  ['prestations','Prestations'],['suivi_lot','Suivi de lot'],['lots','Lots Production'],
  ['etuvage','Étuvage'],['decorticage','Décorticage'],['calibrage','Calibrage'],
  ['tri_optique','Tri optique'],['conditionnement','Conditionnement'],
  ['etv_repertoire','Répertoire Étuveuses'],['etv_avances','Avances'],
  ['etv_bc','Bons de Commande'],['etv_br','Bons de Réception'],
  ['etv_entrees','Entrées Magasin'],['etv_sorties','Sorties Magasin'],['etv_inventaire','Inventaire'],['etv_tresorerie','Trésorerie'],
  ['achats','Achats semi-finis'],['lots_semi_finis','Lots Semi-finis'],
  ['epierrage','Épierrage'],['etuvage_paiements','Paiements étuvage'],
  ['docs_admin','Documents administratifs'],
  ['journal_caisse','Journal Caisse'],['journal_banque','Journal Banque'],
  ['journal_mobile','Journal Mobile Money'],['plan_comptable','Plan Comptable'],['grand_livre','Grand-Livre'],
]

const SECTION_GROUPS = [
  {group:'Référentiel', ids:['companies','clients','fournisseurs']},
  {group:'Stock', ids:['stock','mouvements','inventaire']},
  {group:'Commercial', ids:['commercial','reglements_clients','reglements_fourn','prestations']},
  {group:'Production', ids:['suivi_lot','lots','etuvage','decorticage','calibrage','tri_optique','conditionnement']},
  {group:'Étuveuses', ids:['etv_repertoire','etv_avances','etv_bc','etv_br','etv_entrees','etv_sorties','etv_inventaire','etv_tresorerie']},
  {group:'Achats', ids:['achats','lots_semi_finis','epierrage','etuvage_paiements']},
  {group:'Documents', ids:['docs_admin']},
  {group:'Comptabilité', ids:['journal_caisse','journal_banque','journal_mobile','plan_comptable','grand_livre']},
]

// ── MES UTILISATEURS (Admin Société) ─────────────────────────────────────────
function MesUtilisateursPage({ toast, companies, companyId, profile }) {
  const [users,    setUsers]   = useState([])
  const [modal,    setModal]   = useState(false)
  const [form,     setForm]    = useState({})
  const [perms,    setPerms]   = useState({})
  const [saving,   setSaving]  = useState(false)
  const [editItem, setEditItem]= useState(null)
  const [signataires,setSignataires]=useState([])

  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''

  const load=useCallback(async()=>{
    const {data:ad}=await supabase.auth.getUser(); const uid=ad?.user?.id
    const {data}=await supabase.from('compta_profiles')
      .select('*').eq('created_by',uid).eq('role','utilisateur_simple')
      .order('created_at',{ascending:false})
    setUsers(data||[])
  },[])

  const loadSigs=useCallback(async()=>{
    const {data:ad}=await supabase.auth.getUser(); const uid=ad?.user?.id
    const {data}=await supabase.from('compta_signataires').select('*').eq('user_id',uid)
    setSignataires(data||[])
  },[])

  useEffect(()=>{ load(); loadSigs() },[load,loadSigs])

  const defaultPerms=()=>Object.fromEntries(ALL_SECTIONS.map(([id])=>[id,'none']))

  const openAdd=()=>{
    setEditItem(null)
    setForm({nom:'',email:'',whatsapp:'',mot_de_passe:'',signataire_id:''})
    setPerms(defaultPerms()); setModal(true)
  }

  const openEdit=(u)=>{
    setEditItem(u)
    setForm({nom:u.nom||'',email:u.email||'',whatsapp:u.whatsapp||'',mot_de_passe:'',signataire_id:u.signataire_id||''})
    setPerms({...defaultPerms(),...(u.permissions||{})}); setModal(true)
  }

  const close=()=>setModal(false)
  const setPerm=(id,val)=>setPerms(p=>({...p,[id]:val}))
  const setGroupPerm=(ids,val)=>setPerms(p=>{ const n={...p}; ids.forEach(id=>n[id]=val); return n })

  const deleteUser=async(u)=>{
    if(!window.confirm('Supprimer cet utilisateur ?')) return
    await supabase.from('compta_profiles').delete().eq('id',u.id)
    toast.success('Utilisateur supprimé !'); load()
  }

  const toggleStatut=async(u)=>{
    const ns=u.statut==='active'?'suspended':'active'
    await supabase.from('compta_profiles').update({statut:ns}).eq('id',u.id)
    toast.success(ns==='active'?'Compte activé !':'Compte suspendu !'); load()
  }

  const sendWelcomeWA=(nom,wa,email,mdp)=>{
    if(!wa) return
    const num=wa.replace(/\D/g,'')
    const intl=num.startsWith('229')?num:'229'+num
    const msg=encodeURIComponent(
      'Bonjour '+nom+' !\n\n'+
      'Votre compte ComptaPro a ete cree par '+companyName+'.\n\n'+
      'Email: '+email+'\n'+
      'Mot de passe: '+mdp+'\n\n'+
      'Connectez-vous sur: compta-pro-azure.vercel.app\n\n'+
      'Pensez a changer votre mot de passe apres connexion.'
    )
    window.open('https://wa.me/'+intl+'?text='+msg,'_blank')
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const {data:ad}=await supabase.auth.getUser(); const uid=ad?.user?.id

    if(!editItem){
      // Créer via Edge Function sécurisée (service_role côté serveur)
      const { data:{ session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          email: form.email,
          password: form.mot_de_passe,
          nom: form.nom,
          whatsapp: form.whatsapp,
          company_id: companyId,
          permissions: perms,
          signataire_id: form.signataire_id||null
        })
      })
      const resData = await res.json()
      if(!res.ok){ toast.error(resData.error||'Erreur création'); setSaving(false); return }
      toast.success('Utilisateur '+form.nom+' créé ! Il peut se connecter avec son mot de passe.')
      if(form.whatsapp) sendWelcomeWA(form.nom,form.whatsapp,form.email,form.mot_de_passe)
    } else {
      // Mettre à jour le profil
      await supabase.from('compta_profiles').update({
        nom:form.nom, whatsapp:form.whatsapp,
        permissions:perms, signataire_id:form.signataire_id||null,
      }).eq('id',editItem.id)

      // Mettre à jour le mot de passe si renseigné
      if (form.mot_de_passe && form.mot_de_passe.trim().length >= 6) {
        const { data:{ session } } = await supabase.auth.getSession()
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
          method:'PATCH',
          headers:{
            'Content-Type':'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({
            user_id: editItem.id,
            password: form.mot_de_passe
          })
        })
        const resData = await res.json()
        if(!res.ok) toast.error('Profil mis à jour mais erreur mot de passe : '+resData.error)
        else toast.success('Utilisateur et mot de passe mis à jour !')
      } else {
        toast.success('Utilisateur mis à jour !')
      }
    }
    setSaving(false); close(); load()
  }

  return (
    <div>
      <PageHeader title="Mes Utilisateurs" subtitle={users.length+' utilisateur(s)'}
        actions={<Btn onClick={openAdd}>+ Nouvel utilisateur</Btn>} />

      {users.length===0?(
        <div style={{textAlign:'center',padding:'64px 24px',background:'white',borderRadius:12,border:'1px solid #e2e8f0',color:'#64748b'}}>
          <div style={{fontSize:40,marginBottom:12}}>👥</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>Aucun utilisateur créé</div>
          <div style={{fontSize:13}}>Créez des utilisateurs pour votre équipe avec accès personnalisés.</div>
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>
          {users.map(u=>{
            const actif=u.statut==='active'
            const nbW=Object.values(u.permissions||{}).filter(v=>v==='write').length
            const nbR=Object.values(u.permissions||{}).filter(v=>v==='read').length
            const sig=signataires.find(s=>s.id===u.signataire_id)
            return (
              <div key={u.id} style={{background:'white',borderRadius:12,border:'1px solid '+(actif?'#e2e8f0':'#fecaca'),padding:20}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:'#0f2044'}}>{'👤 '}{u.nom||'—'}</div>
                    <div style={{fontSize:12,color:'#64748b',marginTop:2}}>{u.email}</div>
                    {u.whatsapp&&<div style={{fontSize:12,color:'#25d366',marginTop:1}}>{'📱 +229 '}{u.whatsapp.replace(/^229/,'')}</div>}
                  </div>
                  <span style={{padding:'4px 10px',borderRadius:20,background:actif?'#dcfce7':'#fee2e2',color:actif?'#16a34a':'#dc2626',fontSize:11,fontWeight:700}}>
                    {actif?'✅ Actif':'🚫 Suspendu'}
                  </span>
                </div>
                <div style={{fontSize:12,color:'#64748b',marginBottom:6}}>
                  {'✏️ '}<strong>{nbW}</strong>{' écriture · 👁️ '}<strong>{nbR}</strong>{' lecture'}
                </div>
                {sig&&<div style={{fontSize:12,color:'#7c3aed',marginBottom:6}}>{'✍️ Signataire: '}{sig.nom}</div>}
                <div style={{display:'flex',gap:6,marginTop:10}}>
                  <button onClick={()=>openEdit(u)} style={{flex:1,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'7px',cursor:'pointer',fontSize:12,fontWeight:600,color:'#2563eb'}}>✏️ Modifier</button>
                  <button onClick={()=>toggleStatut(u)} style={{flex:1,background:actif?'#fef3c7':'#f0fdf4',border:'none',borderRadius:8,padding:'7px',cursor:'pointer',fontSize:12,fontWeight:600,color:actif?'#92400e':'#16a34a'}}>
                    {actif?'🚫 Suspendre':'✅ Activer'}
                  </button>
                  <button onClick={()=>deleteUser(u)} style={{background:'#fee2e2',border:'none',borderRadius:8,padding:'7px 10px',cursor:'pointer',fontSize:13,color:'#dc2626'}}>🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={close} title={editItem?'Modifier utilisateur':'Nouvel utilisateur simple'} size="xl">
        <form onSubmit={save}>
          <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>Informations du compte</div>
          <Grid cols={3} gap={14} style={{marginBottom:20}}>
            <Input label="Nom complet *" name="nom" value={form.nom||''} onChange={e=>setForm(f=>({...f,nom:e.target.value}))} required />
            <Input label="Email *" name="email" type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} required={!editItem} disabled={!!editItem} />
            <Input label={editItem?'Nouveau mot de passe (laisser vide)':'Mot de passe temporaire *'} type="text" value={form.mot_de_passe||''} onChange={e=>setForm(f=>({...f,mot_de_passe:e.target.value}))} required={!editItem} placeholder="ex: MonPass123!" />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>WhatsApp (notification bienvenue)</label>
              <div style={{display:'flex',gap:6}}>
                <input type="tel" value={form.whatsapp||''} onChange={e=>setForm(f=>({...f,whatsapp:e.target.value}))} placeholder="0196078696"
                  style={{flex:1,padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:8,fontSize:14,outline:'none'}} />
                <button type="button" title="Importer depuis les contacts"
                  onClick={async()=>{
                    if(!('contacts' in navigator && 'ContactsManager' in window)){
                      toast.error("Acc\u00e8s aux contacts non support\u00e9 sur cet appareil. Utilisez Chrome sur Android.")
                      return
                    }
                    try{
                      const contacts=await navigator.contacts.select(['name','tel'],{multiple:false})
                      if(contacts && contacts.length>0){
                        const c=contacts[0]
                        const tel=(c.tel && c.tel[0])?c.tel[0].replace(/\s/g,''):''
                        const nom=(c.name && c.name[0])?c.name[0]:''
                        setForm(f=>({...f, whatsapp:tel||f.whatsapp, nom:f.nom||nom}))
                        if(tel) toast.success('Contact import\u00e9 : '+tel)
                      }
                    }catch(err){
                      toast.error("Import annul\u00e9 ou refus\u00e9")
                    }
                  }}
                  style={{padding:'9px 14px',background:'#dcfce7',border:'1.5px solid #86efac',borderRadius:8,cursor:'pointer',fontSize:16,whiteSpace:'nowrap'}}>
                  📇
                </button>
              </div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>📇 = importer un numéro depuis vos contacts (Chrome Android)</div>
            </div>
            <Sel label="Signataire assigné" value={form.signataire_id||''} onChange={e=>setForm(f=>({...f,signataire_id:e.target.value}))}
              options={[{value:'',label:'— Aucun signataire —'},...signataires.map(s=>({value:s.id,label:s.nom+' ('+(s.fonction||'—')+')'}) )]} />
          </Grid>

          <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:4,textTransform:'uppercase'}}>{"Droits d'accès par section"}</div>
          <div style={{fontSize:12,color:'#64748b',marginBottom:10}}>
            🚫 Aucun accès = section masquée &nbsp;·&nbsp; 👁️ Lecture = consultation &nbsp;·&nbsp; ✏️ Écriture = création et modification
          </div>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            <button type="button" onClick={()=>setPerms(Object.fromEntries(ALL_SECTIONS.map(([id])=>[id,'write'])))} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #bbf7d0',background:'#f0fdf4',color:'#16a34a',fontSize:12,fontWeight:600,cursor:'pointer'}}>✅ Tout autoriser</button>
            <button type="button" onClick={()=>setPerms(Object.fromEntries(ALL_SECTIONS.map(([id])=>[id,'read'])))} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #fde68a',background:'#fffbeb',color:'#92400e',fontSize:12,fontWeight:600,cursor:'pointer'}}>👁️ Tout en lecture</button>
            <button type="button" onClick={()=>setPerms(Object.fromEntries(ALL_SECTIONS.map(([id])=>[id,'none'])))} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',fontSize:12,fontWeight:600,cursor:'pointer'}}>🚫 Tout bloquer</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
            {SECTION_GROUPS.map(g=>{
              const gv=g.ids.map(id=>perms[id])
              return (
                <div key={g.group} style={{background:'#f8fafc',borderRadius:10,border:'1px solid #e2e8f0',padding:'12px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#0f2044'}}>{g.group}</span>
                    <div style={{display:'flex',gap:4}}>
                      <button type="button" onClick={()=>setGroupPerm(g.ids,'write')} style={{padding:'3px 8px',borderRadius:4,border:'none',background:'#dcfce7',color:'#16a34a',fontSize:11,cursor:'pointer',fontWeight:600}}>✏️ Tous</button>
                      <button type="button" onClick={()=>setGroupPerm(g.ids,'read')} style={{padding:'3px 8px',borderRadius:4,border:'none',background:'#fef3c7',color:'#92400e',fontSize:11,cursor:'pointer',fontWeight:600}}>👁️ Tous</button>
                      <button type="button" onClick={()=>setGroupPerm(g.ids,'none')} style={{padding:'3px 8px',borderRadius:4,border:'none',background:'#fee2e2',color:'#dc2626',fontSize:11,cursor:'pointer',fontWeight:600}}>🚫 Tous</button>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:6}}>
                    {g.ids.map(id=>{
                      const label=ALL_SECTIONS.find(([sid])=>sid===id)?.[1]||id
                      const val=perms[id]||'none'
                      return (
                        <div key={id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',background:'white',borderRadius:6,border:'1px solid #e2e8f0'}}>
                          <span style={{fontSize:12,color:'#374151'}}>{label}</span>
                          <select value={val} onChange={e=>setPerm(id,e.target.value)}
                            style={{padding:'3px 6px',borderRadius:4,border:'1px solid #e2e8f0',fontSize:11,
                              background:val==='write'?'#f0fdf4':val==='read'?'#fffbeb':'#fef2f2',
                              color:val==='write'?'#16a34a':val==='read'?'#92400e':'#dc2626',
                              fontWeight:700,cursor:'pointer'}}>
                            <option value="none">🚫 Aucun</option>
                            <option value="read">👁️ Lecture</option>
                            <option value="write">✏️ Écriture</option>
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <Row>
            <Btn variant="secondary" onClick={close}>Annuler</Btn>
            <Btn type="submit" disabled={saving}>{saving?'En cours...':(editItem?'Mettre à jour':'Créer & Notifier WhatsApp')}</Btn>
          </Row>
        </form>
      </Modal>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION ÉTUVEUSES — Répertoire, Avances, BC, BR, Entrées, Sorties, Inventaire
// ══════════════════════════════════════════════════════════════════════════════

// ── Helpers communs ───────────────────────────────────────────────────────────
const ETV_VARIETES = ['Orylux 6','Wassa','Sikasso','IR 841','NERICA','Adny 11','Autre']
const BTN_ACTION   = (icon,bg,onClick,title) => (
  <button title={title} onClick={onClick}
    style={{background:bg,border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>
    {icon}
  </button>
)

// ── RÉPERTOIRE ÉTUVEUSES ──────────────────────────────────────────────────────
function EtvRepertoirePage({ companies, companyId, toast, readOnly=false }) {
  const [items,    setItems]   = useState([])
  const [fournisseurs, setFourn] = useState([])
  const [modal,    setModal]   = useState(false)
  const [form,     setForm]    = useState({})
  const [viewItem, setViewItem]= useState(null)
  const [saving,   setSaving]  = useState(false)

  const load = useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_etuveuses').select('*').order('created_at',{ascending:false})
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setItems(data||[])
  },[companyId])

  const loadFourn = useCallback(async()=>{
    try {
      const sess = await supabase.auth.getSession()
      if(!sess.data?.session) return
      const uid = sess.data.session.user.id
      const email = sess.data.session.user.email
      const isAdmin = email===SUPER_ADMIN_EMAIL
      let ownerUid = uid
      if(isAdmin && companyId){
        const { data:comp }=await supabase.from('compta_companies').select('user_id').eq('id',companyId).single()
        if(comp?.user_id) ownerUid = comp.user_id
      }
      let qF=supabase.from('compta_fournisseurs').select('id,nom,prenom,nom_societe,type,telephone,ifu')
      qF = await buildQuery(qF, ownerUid||uid, companyId, isAdmin)
      const { data, error }=await qF
      if(error){ console.error('loadFourn:', error.message); return }
      setFourn((data||[]).sort((a,b)=>{
        const na=(a.type==='morale'?a.nom_societe:(a.nom||'')).trim().toLowerCase()
        const nb=(b.type==='morale'?b.nom_societe:(b.nom||'')).trim().toLowerCase()
        return na.localeCompare(nb)
      }))
    } catch(e){ console.error('loadFourn error:', e) }
  },[companyId])

  useEffect(()=>{ load(); loadFourn() },[load,loadFourn])

  const getFournName = (f) => {
    if(!f) return '—'
    return f.type==='morale'?(f.nom_societe||'—'):(f.nom||'')||'—'
  }

  const set = e=>setForm(f=>({...f,[e.target.name]:e.target.value}))
  const getEtvDisplayName = (r) => r?.nom_etuveuse || r?.code_etuveuse || '—'

  const openAdd = ()=>{
    setForm({company_id:companyId||companies[0]?.id||'',
      ifu:'', nom_etuveuse:'',
      code_etuveuse:'',date_contrat:today(),capacite_kg:0,
      zone:'',observations:''})
    setModal(true)
  }

  // Sélection IFU → auto-remplir nom
  const onSelectIFU = (ifu) => {
    const f = fournisseurs.find(x=>x.ifu===ifu)
    const nom = f ? (f.type==='morale'?(f.nom_societe||''):(f.nom||'')) : ''
    setForm(fv=>({...fv, ifu, nom_etuveuse:nom}))
  }
  const close=()=>setModal(false)

  const deleteItem=async(id)=>{
    if(!window.confirm('Supprimer cette étuveuse ?')) return
    const { error }=await supabase.from('compta_etuveuses').delete().eq('id',id)
    if(error){ toast.error(error.message); return }
    toast.success('Étuveuse supprimée !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const cid = form.company_id||companyId||companies[0]?.id
    const { error }=await supabase.from('compta_etuveuses').insert({
      company_id:cid, user_id:uid,
      ifu:form.ifu, nom_etuveuse:form.nom_etuveuse,
      code_etuveuse:form.code_etuveuse, date_contrat:form.date_contrat,
      capacite_kg:parseFloat(form.capacite_kg)||0,
      zone:form.zone, observations:form.observations
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Étuveuse enregistrée !'); close(); load()
  }

  const printFiche = (r) => {
    const fn=r.nom_etuveuse||r.code_etuveuse||'—'
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche Étuveuse ${r.code_etuveuse||''}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">FICHE ÉTUVEUSE</div></div>
    <div class="doc-title"><h1>${fn}</h1><div class="doc-numero">${r.code_etuveuse||'—'}</div>
    <div class="doc-date">Contrat : ${r.date_contrat||'—'}</div></div></div>
    <table><thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead><tbody>
    <tr><td>Code étuveuse</td><td class="r">${r.code_etuveuse||'—'}</td></tr>
    <tr><td>Fournisseur lié</td><td class="r">${fn}</td></tr>
    <tr><td>Date du contrat</td><td class="r">${r.date_contrat||'—'}</td></tr>
    <tr><td>Capacité de traitement</td><td class="r">${(r.capacite_kg||0).toLocaleString('fr-FR')} kg</td></tr>
    <tr><td>Zone / Localité</td><td class="r">${r.zone||'—'}</td></tr>
    ${r.observations?`<tr><td>Observations</td><td class="r">${r.observations}</td></tr>`:''}
    </tbody></table>
    <div class="signatures"><div class="sig-box">Signature étuveuse</div><div class="sig-box">Visa direction</div></div>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Répertoire Étuveuses" subtitle={`${items.length} étuveuse(s) enregistrée(s)`}
        actions={!readOnly&&<Btn onClick={openAdd}>+ Nouvelle Étuveuse</Btn>} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
            <div style={{fontSize:40,marginBottom:8}}>👩</div><p>Aucune étuveuse enregistrée</p>
          </div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>Code</TH><TH>Étuveuse</TH><TH>Date Contrat</TH><TH>Zone</TH><TH right>Capacité (kg)</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold>{r.code_etuveuse||'—'}</TD>
                  <TD>{getEtvDisplayName(r)}</TD>
                  <TD sm>{r.date_contrat||'—'}</TD>
                  <TD sm>{r.zone||'—'}</TD>
                  <TD right>{(r.capacite_kg||0).toLocaleString('fr-FR')} kg</TD>
                  <TD><div style={{display:'flex',gap:4}}>
                    {BTN_ACTION('👁️','#0ea5e9',()=>setViewItem(r),'Voir')}
                    {BTN_ACTION('🖨️','#f59e0b',()=>printFiche(r),'Imprimer')}
                    {!readOnly&&BTN_ACTION('🗑️','#ef4444',()=>deleteItem(r.id),'Supprimer')}
                  </div></TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'Fiche — '+getEtvDisplayName(viewItem)} size="md">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14}}>
            {[['Code',viewItem.code_etuveuse||'—'],['IFU',viewItem.ifu||'—'],['Nom étuveuse',viewItem.nom_etuveuse||'—'],
              ['Date contrat',viewItem.date_contrat||'—'],['Zone',viewItem.zone||'—'],
              ['Capacité',(viewItem.capacite_kg||0).toLocaleString('fr-FR')+' kg'],
              ['Observations',viewItem.observations||'—']
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printFiche(viewItem)}>🖨️ Imprimer fiche</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouvelle Étuveuse" size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="Code étuveuse *" name="code_etuveuse" value={form.code_etuveuse||''} onChange={set} required placeholder="ex: ETV-001" />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>
                IFU Fournisseur *
                {form.nom_etuveuse&&<span style={{marginLeft:6,fontSize:10,color:'#16a34a',fontWeight:700}}>✅ auto</span>}
              </label>
              <select value={form.ifu||''} onChange={e=>onSelectIFU(e.target.value)} required
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner par IFU —</option>
                {fournisseurs.filter(f=>f.ifu).map(f=>(
                  <option key={f.id} value={f.ifu}>
                    {f.ifu} — {f.type==='morale'?f.nom_societe:(f.nom||'')}
                  </option>
                ))}
              </select>
              {form.nom_etuveuse&&(
                <div style={{marginTop:6,padding:'8px 12px',background:'#f0fdf4',borderRadius:6,fontSize:13,fontWeight:600,color:'#16a34a'}}>
                  👤 {form.nom_etuveuse}
                </div>
              )}
              {!form.nom_etuveuse&&(
                <input value={form.nom_etuveuse||''} onChange={e=>setForm(f=>({...f,nom_etuveuse:e.target.value}))}
                  placeholder="Ou saisir le nom manuellement"
                  style={{marginTop:6,width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:13,boxSizing:'border-box'}} />
              )}
            </div>
            <Input label="Date du contrat *" name="date_contrat" type="date" value={form.date_contrat||''} onChange={set} required />
            <Input label="Capacité de traitement (kg)" name="capacite_kg" type="number" value={form.capacite_kg||0} onChange={set} min="0" step="0.001" />
            <Span2><Input label="Zone / Localité" name="zone" value={form.zone||''} onChange={set} placeholder="ex: Tanguiéta - Quartier Hamdallaye" /></Span2>
            <Span2><Input label="Observations / Notes contrat" name="observations" value={form.observations||''} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── AVANCES SUR COMMANDE ──────────────────────────────────────────────────────
function EtvAvancesPage({ companies, companyId, toast, readOnly=false }) {
  const [items,    setItems]   = useState([])
  const [etuveuses,setEtuveuses]=useState([])
  const [modal,    setModal]   = useState(false)
  const [form,     setForm]    = useState({})
  const [viewItem, setViewItem]= useState(null)
  const [saving,   setSaving]  = useState(false)

  const loadEtuveuses = useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_etuveuses').select('id,code_etuveuse,nom_etuveuse,ifu').order('code_etuveuse')
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setEtuveuses(data||[])
  },[companyId])

  const load = useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_avances_etuveuses').select('*,compta_etuveuses(code_etuveuse,fournisseur_id)').order('date_avance',{ascending:false})
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setItems(data||[])
  },[companyId])

  useEffect(()=>{ load(); loadEtuveuses() },[load,loadEtuveuses])

  const getEtvName = (e) => {
    if(!e) return '—'
    const f=e.compta_fournisseurs
    const nom=f?(f.type==='morale'?f.nom_societe:(f.nom||'')):''
    return `${e.code_etuveuse||''} — ${nom}`
  }

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const getSoldeEtuveuse = (etvId) => {
    const avances=items.filter(i=>i.etuveuse_id===etvId)
    return avances.reduce((s,a)=>s+(a.montant||0)-(a.montant_rembourse||0),0)
  }

  const openAdd=()=>{
    setForm({company_id:companyId||companies[0]?.id||'',etuveuse_id:'',
      numero:'',date_avance:today(),montant:0,montant_rembourse:0,
      mode_paiement:'espèce',reference:'',notes:''})
    setModal(true)
  }
  const close=()=>setModal(false)

  const deleteItem=async(id)=>{
    if(!window.confirm('Supprimer cette avance ?')) return
    await supabase.from('compta_avances_etuveuses').delete().eq('id',id)
    toast.success('Avance supprimée !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const year=new Date().getFullYear()
    const { count }=await supabase.from('compta_avances_etuveuses').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero=form.numero||`AVA-${year}-${String((count||0)+1).padStart(4,'0')}`
    const { error }=await supabase.from('compta_avances_etuveuses').insert({
      ...form, user_id:uid, company_id:form.company_id||companyId,
      numero, montant:parseFloat(form.montant)||0, montant_rembourse:parseFloat(form.montant_rembourse)||0
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Avance enregistrée !'); close(); load()
  }

  const totalAvances=items.reduce((s,r)=>s+(r.montant||0),0)
  const totalRembourse=items.reduce((s,r)=>s+(r.montant_rembourse||0),0)

  const printAvance=(r)=>{
    const en=r.compta_etuveuses
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Avance ${r.numero}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">BON D'AVANCE SUR COMMANDE</div></div>
    <div class="doc-title"><h1>${r.numero}</h1><div class="doc-date">Date : ${r.date_avance||'—'}</div></div></div>
    <table><thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead><tbody>
    <tr><td>Étuveuse</td><td class="r">${getEtvName(en)}</td></tr>
    <tr><td>Mode de paiement</td><td class="r">${r.mode_paiement||'—'}</td></tr>
    <tr><td>Référence</td><td class="r">${r.reference||'—'}</td></tr>
    ${r.notes?`<tr><td>Notes</td><td class="r">${r.notes}</td></tr>`:''}
    </tbody></table>
    <div class="totals">
      <div style="display:flex;justify-content:space-between;padding:10px 16px;background:#eff6ff;border-radius:8px;margin-top:8px">
        <span style="font-weight:700">MONTANT AVANCE</span><span style="font-weight:800;font-size:16pt">${Math.round(r.montant||0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 16px;background:#f0fdf4;border-radius:8px;margin-top:8px">
        <span style="font-weight:700">MONTANT REMBOURSÉ</span><span style="font-weight:800;font-size:16pt;color:#16a34a">${Math.round(r.montant_rembourse||0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div class="ttc" style="margin-top:8px"><span>SOLDE RESTANT</span><span>${Math.round((r.montant||0)-(r.montant_rembourse||0)).toLocaleString('fr-FR')} FCFA</span></div>
    </div>
    <div class="signatures"><div class="sig-box">Signature étuveuse<br><small>${getEtvName(en)}</small></div><div class="sig-box">Visa direction</div></div>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Avances sur Commande" subtitle={`${items.length} avance(s) — Total : ${fcfa(totalAvances)} | Remboursé : ${fcfa(totalRembourse)}`}
        actions={!readOnly&&<Btn onClick={openAdd}>+ Nouvelle Avance</Btn>} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>💰 Aucune avance enregistrée</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>N° Avance</TH><TH>Date</TH><TH>Étuveuse</TH><TH right>Montant</TH><TH right>Remboursé</TH><TH right>Solde</TH><TH>Mode</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {items.map(r=>{
                const solde=(r.montant||0)-(r.montant_rembourse||0)
                return (
                  <TR key={r.id}>
                    <TD bold sm>{r.numero}</TD>
                    <TD sm>{r.date_avance}</TD>
                    <TD sm>{getEtvName(r.compta_etuveuses)}</TD>
                    <TD right bold>{fcfa(r.montant)}</TD>
                    <TD right color="#16a34a">{fcfa(r.montant_rembourse)}</TD>
                    <TD right bold color={solde>0?'#dc2626':'#16a34a'}>{fcfa(solde)}</TD>
                    <TD sm>{r.mode_paiement||'—'}</TD>
                    <TD><div style={{display:'flex',gap:4}}>
                      {BTN_ACTION('👁️','#0ea5e9',()=>setViewItem(r),'Voir')}
                      {BTN_ACTION('🖨️','#f59e0b',()=>printAvance(r),'Imprimer')}
                      {!readOnly&&BTN_ACTION('🗑️','#ef4444',()=>deleteItem(r.id),'Supprimer')}
                    </div></TD>
                  </TR>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'Avance — '+viewItem.numero} size="md">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14,marginBottom:16}}>
            {[['N° Avance',viewItem.numero],['Date',viewItem.date_avance],
              ['Étuveuse',getEtvName(viewItem.compta_etuveuses)],['Mode',viewItem.mode_paiement||'—'],
              ['Référence',viewItem.reference||'—'],['Notes',viewItem.notes||'—']
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            <div style={{padding:'10px',background:'#eff6ff',borderRadius:8,textAlign:'center'}}>
              <div style={{fontSize:11,color:'#94a3b8'}}>Avance</div>
              <div style={{fontWeight:800,color:ACCENT,fontSize:15}}>{fcfa(viewItem.montant)}</div>
            </div>
            <div style={{padding:'10px',background:'#f0fdf4',borderRadius:8,textAlign:'center'}}>
              <div style={{fontSize:11,color:'#94a3b8'}}>Remboursé</div>
              <div style={{fontWeight:800,color:'#16a34a',fontSize:15}}>{fcfa(viewItem.montant_rembourse)}</div>
            </div>
            <div style={{padding:'10px',background:(viewItem.montant||0)-(viewItem.montant_rembourse||0)>0?'#fef2f2':'#f0fdf4',borderRadius:8,textAlign:'center'}}>
              <div style={{fontSize:11,color:'#94a3b8'}}>Solde</div>
              <div style={{fontWeight:800,color:(viewItem.montant||0)-(viewItem.montant_rembourse||0)>0?'#dc2626':'#16a34a',fontSize:15}}>{fcfa((viewItem.montant||0)-(viewItem.montant_rembourse||0))}</div>
            </div>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printAvance(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouvelle Avance sur Commande" size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="N° Avance (auto si vide)" name="numero" value={form.numero||''} onChange={set} placeholder="AVA-2026-0001" />
            <Input label="Date *" name="date_avance" type="date" value={form.date_avance||''} onChange={set} required />
            <div style={{gridColumn:'1/-1'}}>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Étuveuse *</label>
              <select name="etuveuse_id" value={form.etuveuse_id||''} onChange={set} required
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner une étuveuse —</option>
                {etuveuses.map(e=><option key={e.id} value={e.id}>{getEtvName(e)}</option>)}
              </select>
            </div>
            <Input label="Montant avance (FCFA) *" name="montant" type="number" value={form.montant||0} onChange={set} required min="0" />
            <Input label="Montant déjà remboursé (FCFA)" name="montant_rembourse" type="number" value={form.montant_rembourse||0} onChange={set} min="0" />
            <Sel label="Mode de paiement" name="mode_paiement" value={form.mode_paiement||'espèce'} onChange={set}
              options={['espèce','virement','mobile_money','chèque'].map(m=>({value:m,label:m.charAt(0).toUpperCase()+m.slice(1)}))} />
            <Input label="Référence paiement" name="reference" value={form.reference||''} onChange={set} />
            <Span2><Input label="Notes" name="notes" value={form.notes||''} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── BONS DE COMMANDE ÉTUVEUSES ────────────────────────────────────────────────
function EtvBCPage({ companies, companyId, toast, readOnly=false }) {
  const [items, setItems]=useState([])
  const [etuveuses, setEtuveuses]=useState([])
  const [modal, setModal]=useState(false)
  const [viewItem, setViewItem]=useState(null)
  const [form, setForm]=useState({})
  const [lignes, setLignes]=useState([])
  const [saving, setSaving]=useState(false)

  const loadEtuveuses=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_etuveuses').select('id,code_etuveuse,nom_etuveuse,ifu').order('code_etuveuse')
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setEtuveuses(data||[])
  },[companyId])

  const load=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_bc_etuveuses').select('*,compta_etuveuses(code_etuveuse,fournisseur_id)').order('date_bc',{ascending:false})
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setItems(data||[])
  },[companyId])

  useEffect(()=>{ load(); loadEtuveuses() },[load,loadEtuveuses])

  const getEtvName=(e)=>{
    if(!e) return '—'
    return e.nom_etuveuse ? `${e.code_etuveuse||''} — ${e.nom_etuveuse}` : (e.code_etuveuse||'—')
  }

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))
  const addLigne=()=>setLignes(l=>[...l,{id:Date.now(),variete:'',quantite_kg:0,prix_unitaire:0}])
  const removeLigne=id=>setLignes(l=>l.filter(x=>x.id!==id))
  const setLigne=(id,field,val)=>setLignes(l=>l.map(x=>x.id===id?{...x,[field]:val}:x))

  const totalBC=lignes.reduce((s,l)=>s+((parseFloat(l.quantite_kg)||0)*(parseFloat(l.prix_unitaire)||0)),0)

  const openAdd=()=>{
    setForm({company_id:companyId||companies[0]?.id||'',etuveuse_id:'',numero:'',date_bc:today(),statut:'en_attente',notes:''})
    setLignes([{id:1,variete:'',quantite_kg:0,prix_unitaire:0}])
    setModal(true)
  }
  const close=()=>setModal(false)

  const deleteItem=async(id)=>{
    if(!window.confirm('Supprimer ce bon de commande ?')) return
    await supabase.from('compta_bc_etuveuses').delete().eq('id',id)
    toast.success('BC supprimé !'); load()
  }

  const changeStatut=async(id, newStatut)=>{
    const { error }=await supabase.from('compta_bc_etuveuses').update({statut:newStatut}).eq('id',id)
    if(error){ toast.error(error.message); return }
    toast.success('Statut mis à jour !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const year=new Date().getFullYear()
    const { count }=await supabase.from('compta_bc_etuveuses').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero=form.numero||`BC-ETV-${year}-${String((count||0)+1).padStart(4,'0')}`
    const montant_total=Math.round(totalBC)
    const { error }=await supabase.from('compta_bc_etuveuses').insert({
      ...form, user_id:uid, company_id:form.company_id||companyId,
      numero, lignes, montant_total
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Bon de commande enregistré !'); close(); load()
  }

  const STATUT_BC={en_attente:{c:'#f59e0b',bg:'#fef3c7',t:'En attente'},valide:{c:'#16a34a',bg:'#dcfce7',t:'Validé'},refuse:{c:'#dc2626',bg:'#fee2e2',t:'Refusé'}}

  const printBC=(r)=>{
    const lignesHtml=(r.lignes||[]).map((l,i)=>`<tr>
      <td>${i+1}</td><td>${l.variete||'—'}</td>
      <td class="r">${(parseFloat(l.quantite_kg)||0).toLocaleString('fr-FR')} kg</td>
      <td class="r">${Math.round(parseFloat(l.prix_unitaire)||0).toLocaleString('fr-FR')} FCFA/kg</td>
      <td class="r">${Math.round((parseFloat(l.quantite_kg)||0)*(parseFloat(l.prix_unitaire)||0)).toLocaleString('fr-FR')} FCFA</td>
    </tr>`).join('')
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bon de Commande ${r.numero}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">BON DE COMMANDE ÉTUVEUSE</div></div>
    <div class="doc-title"><h1>${r.numero}</h1><div class="doc-date">Date : ${r.date_bc||'—'}</div></div></div>
    <p><strong>Étuveuse :</strong> ${getEtvName(r.compta_etuveuses)}</p>
    <table><thead><tr><th>N°</th><th>Variété</th><th class="r">Quantité (kg)</th><th class="r">Prix U. (FCFA/kg)</th><th class="r">Montant</th></tr></thead>
    <tbody>${lignesHtml}</tbody></table>
    <div class="totals"><div class="ttc"><span>TOTAL</span><span>${Math.round(r.montant_total||0).toLocaleString('fr-FR')} FCFA</span></div></div>
    <div class="signatures"><div class="sig-box">Signature étuveuse<br><small>${getEtvName(r.compta_etuveuses)}</small></div><div class="sig-box">Validation société</div></div>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Bons de Commande Étuveuses" subtitle={`${items.length} bon(s) de commande`}
        actions={!readOnly&&<Btn onClick={openAdd}>+ Nouveau BC</Btn>} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📋 Aucun bon de commande</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>N° BC</TH><TH>Date</TH><TH>Étuveuse</TH><TH right>Montant total</TH><TH>Statut</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {items.map(r=>{
                const s=STATUT_BC[r.statut]||STATUT_BC.en_attente
                return (
                  <TR key={r.id}>
                    <TD bold sm>{r.numero}</TD>
                    <TD sm>{r.date_bc}</TD>
                    <TD sm>{getEtvName(r.compta_etuveuses)}</TD>
                    <TD right bold>{fcfa(r.montant_total)}</TD>
                    <TD><span style={{padding:'3px 10px',borderRadius:20,background:s.bg,color:s.c,fontSize:11,fontWeight:700}}>{s.t}</span></TD>
                    <TD><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {BTN_ACTION('👁️','#0ea5e9',()=>setViewItem(r),'Voir')}
                      {BTN_ACTION('🖨️','#f59e0b',()=>printBC(r),'Imprimer')}
                      {!readOnly&&r.statut==='en_attente'&&(
                        <button title="Valider" onClick={()=>changeStatut(r.id,'valide')}
                          style={{background:'#16a34a',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:11,fontWeight:700}}>✅ Valider</button>
                      )}
                      {!readOnly&&r.statut==='en_attente'&&(
                        <button title="Refuser" onClick={()=>changeStatut(r.id,'refuse')}
                          style={{background:'#dc2626',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:11,fontWeight:700}}>❌ Refuser</button>
                      )}
                      {!readOnly&&r.statut!=='en_attente'&&(
                        <button title="Remettre en attente" onClick={()=>changeStatut(r.id,'en_attente')}
                          style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:11,fontWeight:700}}>↩️</button>
                      )}
                      {!readOnly&&BTN_ACTION('🗑️','#ef4444',()=>deleteItem(r.id),'Supprimer')}
                    </div></TD>
                  </TR>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'BC — '+viewItem.numero} size="lg">
          <div style={{marginBottom:12,fontSize:14}}>
            <strong>Étuveuse :</strong> {getEtvName(viewItem.compta_etuveuses)} &nbsp;|&nbsp;
            <strong>Date :</strong> {viewItem.date_bc}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12}}>
            <thead><tr style={{background:'#0f2044',color:'white'}}>
              {['N°','Variété','Qté demandée (kg)','Prix U. (FCFA/kg)','Montant'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:12}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(viewItem.lignes||[]).map((l,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #e2e8f0'}}>
                  <td style={{padding:'8px 10px',fontSize:13}}>{i+1}</td>
                  <td style={{padding:'8px 10px',fontSize:13}}>{l.variete||'—'}</td>
                  <td style={{padding:'8px 10px',fontSize:13,textAlign:'right'}}>{(parseFloat(l.quantite_kg)||0).toLocaleString('fr-FR')} kg</td>
                  <td style={{padding:'8px 10px',fontSize:13,textAlign:'right'}}>{Math.round(parseFloat(l.prix_unitaire)||0).toLocaleString('fr-FR')}</td>
                  <td style={{padding:'8px 10px',fontSize:13,textAlign:'right',fontWeight:700}}>{fcfa((parseFloat(l.quantite_kg)||0)*(parseFloat(l.prix_unitaire)||0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:'12px 16px',background:'#0f2044',borderRadius:8,display:'flex',justifyContent:'space-between',color:'white',fontWeight:800}}>
            <span>TOTAL</span><span>{fcfa(viewItem.montant_total)}</span>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printBC(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouveau Bon de Commande" size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="N° BC (auto si vide)" name="numero" value={form.numero||''} onChange={set} placeholder="BC-ETV-2026-0001" />
            <Input label="Date *" name="date_bc" type="date" value={form.date_bc||''} onChange={set} required />
            <Sel label="Statut" name="statut" value={form.statut||'en_attente'} onChange={set}
              options={[{value:'en_attente',label:'En attente'},{value:'valide',label:'Validé'},{value:'refuse',label:'Refusé'}]} />
            <div style={{gridColumn:'1/-1'}}>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Étuveuse *</label>
              <select name="etuveuse_id" value={form.etuveuse_id||''} onChange={set} required
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner une étuveuse —</option>
                {etuveuses.map(e=><option key={e.id} value={e.id}>{getEtvName(e)}</option>)}
              </select>
            </div>
          </Grid>

          <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>Lignes de commande</div>
          <div style={{background:'#f8fafc',borderRadius:8,border:'1px solid #e2e8f0',overflow:'hidden',marginBottom:12}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#0f2044',color:'white'}}>
                {['Variété de riz','Quantité demandée (kg)','Prix unitaire (FCFA/kg)','Montant',''].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:11}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lignes.map(l=>{
                  const mt=Math.round((parseFloat(l.quantite_kg)||0)*(parseFloat(l.prix_unitaire)||0))
                  return (
                    <tr key={l.id} style={{borderBottom:'1px solid #e2e8f0'}}>
                      <td style={{padding:'6px 8px'}}>
                        <select value={l.variete||''} onChange={e=>setLigne(l.id,'variete',e.target.value)}
                          style={{width:'100%',padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}}>
                          <option value=''>— Variété —</option>
                          {ETV_VARIETES.map(v=><option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{padding:'6px 8px',width:150}}>
                        <input type="number" value={l.quantite_kg||0} onChange={e=>setLigne(l.id,'quantite_kg',e.target.value)} min="0" step="0.001"
                          style={{width:'100%',padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}} />
                      </td>
                      <td style={{padding:'6px 8px',width:150}}>
                        <input type="number" value={l.prix_unitaire||0} onChange={e=>setLigne(l.id,'prix_unitaire',e.target.value)} min="0"
                          style={{width:'100%',padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}} />
                      </td>
                      <td style={{padding:'6px 8px',width:130,fontWeight:700,color:ACCENT,fontSize:13}}>{fcfa(mt)}</td>
                      <td style={{padding:'6px 4px',width:32}}>
                        {lignes.length>1&&<button type="button" onClick={()=>removeLigne(l.id)} style={{background:'#fee2e2',border:'none',borderRadius:4,padding:'3px 7px',cursor:'pointer',color:'#dc2626',fontSize:12}}>✕</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid #e2e8f0'}}>
              <button type="button" onClick={addLigne} style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'5px 12px',cursor:'pointer',color:ACCENT,fontSize:13,fontWeight:600}}>+ Ajouter une ligne</button>
              <div style={{fontWeight:800,fontSize:15,color:'#0f2044'}}>TOTAL : {fcfa(Math.round(totalBC))}</div>
            </div>
          </div>
          <Input label="Notes" name="notes" value={form.notes||''} onChange={set} />
          <Row style={{marginTop:12}}><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── BONS DE RÉCEPTION ─────────────────────────────────────────────────────────
function EtvBRPage({ companies, companyId, toast, readOnly=false }) {
  const [items, setItems]=useState([])
  const [etuveuses, setEtuveuses]=useState([])
  const [bcs, setBcs]=useState([])
  const [modal, setModal]=useState(false)
  const [viewItem, setViewItem]=useState(null)
  const [form, setForm]=useState({})
  const [lignes, setLignes]=useState([])
  const [saving, setSaving]=useState(false)

  const loadEtuveuses=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_etuveuses').select('id,code_etuveuse,nom_etuveuse,ifu').order('code_etuveuse')
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setEtuveuses(data||[])
  },[companyId])

  const loadBCs=useCallback(async()=>{
    try {
      const sess=await supabase.auth.getSession()
      if(!sess.data?.session) return
      const uid=sess.data.session.user.id
      const isAdmin=sess.data.session.user.email===SUPER_ADMIN_EMAIL
      let q=supabase.from('compta_bc_etuveuses').select('id,numero,statut,etuveuse_id,lignes').order('date_bc',{ascending:false})
      q = await buildQuery(q, uid, companyId, isAdmin)
      const { data }=await q
      setBcs(data||[])
    } catch(e){ console.error('loadBCs:', e) }
  },[companyId])

  const load=useCallback(async()=>{
    try {
      const sess=await supabase.auth.getSession()
      if(!sess.data?.session) return
      const uid=sess.data.session.user.id
      const isAdmin=sess.data.session.user.email===SUPER_ADMIN_EMAIL
      let q=supabase.from('compta_br_etuveuses').select('*,compta_etuveuses(code_etuveuse,nom_etuveuse)').order('date_br',{ascending:false})
      q = await buildQuery(q, uid, companyId, isAdmin)
      const { data }=await q
      setItems(data||[])
    } catch(e){ console.error('loadBR:', e) }
  },[companyId])

  useEffect(()=>{ load(); loadEtuveuses(); loadBCs() },[load,loadEtuveuses,loadBCs])

  const getEtvName=(e)=>{
    if(!e) return '—'
    return e.nom_etuveuse ? `${e.code_etuveuse||''} — ${e.nom_etuveuse}` : (e.code_etuveuse||'—')
  }

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))
  const setLigne=(id,field,val)=>setLignes(l=>l.map(x=>x.id===id?{...x,[field]:val}:x))

  const onSelectBC=(bcId)=>{
    const bc=bcs.find(b=>b.id===bcId)
    if(!bc){ setForm(f=>({...f,bc_id:bcId})); return }
    setForm(f=>({...f,bc_id:bcId,etuveuse_id:bc.etuveuse_id}))
    setLignes((bc.lignes||[]).map((l,i)=>({
      id:i+1, variete:l.variete||'', prix_unitaire:l.prix_unitaire||0,
      qte_demandee:parseFloat(l.quantite_kg)||0,
      qte_accordee:parseFloat(l.quantite_kg)||0
    })))
  }

  const totalDemande=lignes.reduce((s,l)=>s+(parseFloat(l.qte_demandee)||0)*(parseFloat(l.prix_unitaire)||0),0)
  const totalAccorde=lignes.reduce((s,l)=>s+(parseFloat(l.qte_accordee)||0)*(parseFloat(l.prix_unitaire)||0),0)

  const openAdd=()=>{
    setForm({company_id:companyId||companies[0]?.id||'',etuveuse_id:'',bc_id:'',numero:'',date_br:today(),notes:''})
    setLignes([]); setModal(true)
  }
  const close=()=>setModal(false)

  const deleteItem=async(id)=>{
    if(!window.confirm('Supprimer ce bon de réception ?')) return
    await supabase.from('compta_br_etuveuses').delete().eq('id',id)
    toast.success('BR supprimé !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const year=new Date().getFullYear()
    const { count }=await supabase.from('compta_br_etuveuses').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero=form.numero||`BR-ETV-${year}-${String((count||0)+1).padStart(4,'0')}`
    const { error }=await supabase.from('compta_br_etuveuses').insert({
      company_id:form.company_id||companyId, user_id:uid,
      etuveuse_id:form.etuveuse_id||null,
      bc_id:form.bc_id||null,  // null si vide, pas ""
      numero, date_br:form.date_br, notes:form.notes||'',
      lignes, montant_demande:Math.round(totalDemande), montant_accorde:Math.round(totalAccorde)
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Bon de réception enregistré !'); close(); load()
  }

  const printBR=(r)=>{
    const lignesHtml=(r.lignes||[]).map((l,i)=>`<tr>
      <td>${i+1}</td><td>${l.variete||'—'}</td>
      <td class="r">${(parseFloat(l.qte_demandee)||0).toLocaleString('fr-FR')} kg</td>
      <td class="r" style="color:#16a34a;font-weight:700">${(parseFloat(l.qte_accordee)||0).toLocaleString('fr-FR')} kg</td>
      <td class="r">${Math.round(parseFloat(l.prix_unitaire)||0).toLocaleString('fr-FR')}</td>
      <td class="r" style="font-weight:700">${Math.round((parseFloat(l.qte_accordee)||0)*(parseFloat(l.prix_unitaire)||0)).toLocaleString('fr-FR')}</td>
    </tr>`).join('')
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bon de Réception ${r.numero}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">BON DE RÉCEPTION ÉTUVEUSE</div></div>
    <div class="doc-title"><h1>${r.numero}</h1><div class="doc-date">Date : ${r.date_br||'—'}</div></div></div>
    <p><strong>Étuveuse :</strong> ${getEtvName(r.compta_etuveuses)} | <strong>BC lié :</strong> ${r.bc_id||'—'}</p>
    <table><thead><tr><th>N°</th><th>Variété</th><th class="r">Qté demandée</th><th class="r">Qté accordée</th><th class="r">Prix U.</th><th class="r">Montant accordé</th></tr></thead>
    <tbody>${lignesHtml}</tbody></table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <div style="padding:10px 16px;background:#f1f5f9;border-radius:8px;display:flex;justify-content:space-between;font-weight:700">
        <span>Total demandé</span><span>${Math.round(r.montant_demande||0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <div style="padding:10px 16px;background:#dcfce7;border-radius:8px;display:flex;justify-content:space-between;font-weight:700;color:#16a34a">
        <span>Total accordé</span><span>${Math.round(r.montant_accorde||0).toLocaleString('fr-FR')} FCFA</span>
      </div>
    </div>
    <div class="signatures"><div class="sig-box">Signature étuveuse<br><small>${getEtvName(r.compta_etuveuses)}</small></div><div class="sig-box">Approbation société</div></div>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Bons de Réception Étuveuses" subtitle={`${items.length} bon(s) de réception`}
        actions={!readOnly&&<Btn onClick={openAdd}>+ Nouveau BR</Btn>} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>✅ Aucun bon de réception</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>N° BR</TH><TH>Date</TH><TH>Étuveuse</TH><TH right>Montant demandé</TH><TH right>Montant accordé</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero}</TD>
                  <TD sm>{r.date_br}</TD>
                  <TD sm>{getEtvName(r.compta_etuveuses)}</TD>
                  <TD right>{fcfa(r.montant_demande)}</TD>
                  <TD right bold color="#16a34a">{fcfa(r.montant_accorde)}</TD>
                  <TD><div style={{display:'flex',gap:4}}>
                    {BTN_ACTION('👁️','#0ea5e9',()=>setViewItem(r),'Voir')}
                    {BTN_ACTION('🖨️','#f59e0b',()=>printBR(r),'Imprimer')}
                    {!readOnly&&BTN_ACTION('🗑️','#ef4444',()=>deleteItem(r.id),'Supprimer')}
                  </div></TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'BR — '+viewItem.numero} size="lg">
          <div style={{marginBottom:12,fontSize:14}}>
            <strong>Étuveuse :</strong> {getEtvName(viewItem.compta_etuveuses)} &nbsp;|&nbsp; <strong>Date :</strong> {viewItem.date_br}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12}}>
            <thead><tr style={{background:'#0f2044',color:'white'}}>
              {['N°','Variété','Qté demandée','Qté accordée','Prix U.','Montant accordé'].map(h=><th key={h} style={{padding:'8px',fontSize:11}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(viewItem.lignes||[]).map((l,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #e2e8f0',background:parseFloat(l.qte_accordee)<parseFloat(l.qte_demandee)?'#fef9c3':'white'}}>
                  <td style={{padding:'8px',fontSize:12}}>{i+1}</td>
                  <td style={{padding:'8px',fontSize:12}}>{l.variete||'—'}</td>
                  <td style={{padding:'8px',fontSize:12,textAlign:'right'}}>{(parseFloat(l.qte_demandee)||0).toLocaleString('fr-FR')} kg</td>
                  <td style={{padding:'8px',fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:700}}>{(parseFloat(l.qte_accordee)||0).toLocaleString('fr-FR')} kg</td>
                  <td style={{padding:'8px',fontSize:12,textAlign:'right'}}>{fcfa(l.prix_unitaire)}</td>
                  <td style={{padding:'8px',fontSize:12,textAlign:'right',fontWeight:700}}>{fcfa((parseFloat(l.qte_accordee)||0)*(parseFloat(l.prix_unitaire)||0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div style={{padding:'10px',background:'#f1f5f9',borderRadius:8,display:'flex',justifyContent:'space-between',fontWeight:700}}>
              <span>Total demandé</span><span>{fcfa(viewItem.montant_demande)}</span>
            </div>
            <div style={{padding:'10px',background:'#dcfce7',borderRadius:8,display:'flex',justifyContent:'space-between',fontWeight:700,color:'#16a34a'}}>
              <span>Total accordé</span><span>{fcfa(viewItem.montant_accorde)}</span>
            </div>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printBR(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouveau Bon de Réception" size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="N° BR (auto si vide)" name="numero" value={form.numero||''} onChange={set} />
            <Input label="Date *" name="date_br" type="date" value={form.date_br||''} onChange={set} required />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>BC lié (optionnel)</label>
              <select name="bc_id" value={form.bc_id||''} onChange={e=>onSelectBC(e.target.value)}
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner un BC validé —</option>
                {bcs.map(b=><option key={b.id} value={b.id}>
                  {b.numero} {b.statut==='valide'?'✅':b.statut==='en_attente'?'⏳':'❌'}
                </option>)}
              </select>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Étuveuse *</label>
              <select name="etuveuse_id" value={form.etuveuse_id||''} onChange={set} required
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner une étuveuse —</option>
                {etuveuses.map(e=><option key={e.id} value={e.id}>{getEtvName(e)}</option>)}
              </select>
            </div>
          </Grid>

          {lignes.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8}}>LIGNES — Quantités demandées vs accordées</div>
              <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',background:'#f8fafc',borderRadius:8,overflow:'hidden'}}>
                <thead><tr style={{background:'#0f2044',color:'white'}}>
                  {['Variété','Qté demandée (kg)','Qté accordée (kg)','Prix U.','Montant accordé'].map(h=><th key={h} style={{padding:'8px 10px',fontSize:11,textAlign:'left'}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {lignes.map(l=>{
                    const diff=parseFloat(l.qte_accordee)<parseFloat(l.qte_demandee)
                    return (
                      <tr key={l.id} style={{borderBottom:'1px solid #e2e8f0',background:diff?'#fef9c3':'white'}}>
                        <td style={{padding:'7px 10px',fontSize:13,fontWeight:600}}>{l.variete||'—'}</td>
                        <td style={{padding:'7px 10px',fontSize:13,textAlign:'right',color:'#64748b'}}>{(parseFloat(l.qte_demandee)||0).toLocaleString('fr-FR')} kg</td>
                        <td style={{padding:'7px 6px'}}>
                          <input type="number" value={l.qte_accordee||0} onChange={e=>setLigne(l.id,'qte_accordee',e.target.value)}
                            max={l.qte_demandee} min="0" step="0.001"
                            style={{width:110,padding:'5px 8px',border:'1.5px solid '+(diff?'#f59e0b':'#bbf7d0'),borderRadius:6,fontSize:12,fontWeight:700,color:diff?'#92400e':'#16a34a'}} />
                        </td>
                        <td style={{padding:'7px 10px',fontSize:12,textAlign:'right'}}>{fcfa(l.prix_unitaire)}</td>
                        <td style={{padding:'7px 10px',fontSize:13,fontWeight:700,color:'#16a34a',textAlign:'right'}}>{fcfa((parseFloat(l.qte_accordee)||0)*(parseFloat(l.prix_unitaire)||0))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:16,padding:'8px 12px',background:'#f8fafc',borderTop:'1px solid #e2e8f0',fontSize:13,fontWeight:700}}>
                <span>Demandé : <span style={{color:'#64748b'}}>{fcfa(Math.round(totalDemande))}</span></span>
                <span>Accordé : <span style={{color:'#16a34a'}}>{fcfa(Math.round(totalAccorde))}</span></span>
              </div>
            </div>
          )}
          <Input label="Notes" name="notes" value={form.notes||''} onChange={set} />
          <Row style={{marginTop:12}}><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── ENTRÉES MAGASIN ───────────────────────────────────────────────────────────
function EtvEntreesPage({ companies, companyId, toast, readOnly=false }) {
  const [items, setItems]=useState([])
  const [etuveuses, setEtuveuses]=useState([])
  const [modal, setModal]=useState(false)
  const [viewItem, setViewItem]=useState(null)
  const [form, setForm]=useState({})
  const [saving, setSaving]=useState(false)
  const [dateFrom, setDateFrom]=useState('')
  const [dateTo, setDateTo]=useState('')

  const loadEtuveuses=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_etuveuses').select('id,code_etuveuse,nom_etuveuse,ifu').order('code_etuveuse')
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setEtuveuses(data||[])
  },[companyId])

  const load=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_entrees_magasin').select('*,compta_etuveuses(code_etuveuse,fournisseur_id)').order('date_entree',{ascending:false})
    q = await buildQuery(q, uid, companyId, isAdmin)
    if(dateFrom) q=q.gte('date_entree',dateFrom)
    if(dateTo) q=q.lte('date_entree',dateTo)
    const { data }=await q; setItems(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load(); loadEtuveuses() },[load,loadEtuveuses])

  const getEtvName=(e)=>{
    if(!e) return '—'
    return e.nom_etuveuse ? `${e.code_etuveuse||''} — ${e.nom_etuveuse}` : (e.code_etuveuse||'—')
  }

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const openAdd=()=>{
    setForm({company_id:companyId||companies[0]?.id||'',etuveuse_id:'',
      numero_lot:'',date_entree:today(),variete:'',annee_production:new Date().getFullYear(),
      quantite_kg:0,prix_unitaire:0,provenance:'',observations:''})
    setModal(true)
  }
  const close=()=>setModal(false)

  const deleteItem=async(id)=>{
    if(!window.confirm('Supprimer cette entrée magasin ?')) return
    await supabase.from('compta_entrees_magasin').delete().eq('id',id)
    toast.success('Entrée supprimée !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const montant=Math.round((parseFloat(form.quantite_kg)||0)*(parseFloat(form.prix_unitaire)||0))
    const { error }=await supabase.from('compta_entrees_magasin').insert({
      ...form, user_id:uid, company_id:form.company_id||companyId,
      quantite_kg:parseFloat(form.quantite_kg)||0,
      prix_unitaire:parseFloat(form.prix_unitaire)||0,
      annee_production:parseInt(form.annee_production)||new Date().getFullYear(),
      montant
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Entrée magasin enregistrée !'); close(); load()
  }

  const totalKg=items.reduce((s,r)=>s+(r.quantite_kg||0),0)
  const totalVal=items.reduce((s,r)=>s+(r.montant||0),0)

  const printEntree=(r)=>{
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bon Entrée Magasin ${r.numero_lot||''}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">BON D'ENTRÉE EN MAGASIN</div></div>
    <div class="doc-title"><h1>N° LOT : ${r.numero_lot||'—'}</h1><div class="doc-date">Date : ${r.date_entree||'—'}</div></div></div>
    <table><thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead><tbody>
    <tr><td>Étuveuse</td><td class="r">${getEtvName(r.compta_etuveuses)}</td></tr>
    <tr><td>N° Lot / Étiquette</td><td class="r"><strong>${r.numero_lot||'—'}</strong></td></tr>
    <tr><td>Variété</td><td class="r">${r.variete||'—'}</td></tr>
    <tr><td>Année de production</td><td class="r">${r.annee_production||'—'}</td></tr>
    <tr><td>Quantité reçue</td><td class="r"><strong>${(r.quantite_kg||0).toLocaleString('fr-FR')} kg</strong></td></tr>
    <tr><td>Prix unitaire</td><td class="r">${Math.round(r.prix_unitaire||0).toLocaleString('fr-FR')} FCFA/kg</td></tr>
    <tr><td>Provenance</td><td class="r">${r.provenance||'—'}</td></tr>
    ${r.observations?`<tr><td>Observations</td><td class="r">${r.observations}</td></tr>`:''}
    </tbody></table>
    <div class="totals"><div class="ttc"><span>VALEUR TOTALE</span><span>${Math.round(r.montant||0).toLocaleString('fr-FR')} FCFA</span></div></div>
    <div style="margin-top:24px;padding:16px;background:#eff6ff;border-radius:8px;text-align:center">
      <div style="font-size:9pt;color:#555;margin-bottom:8px">ÉTIQUETTE SAC</div>
      <div style="font-size:14pt;font-weight:800;border:2px solid #0f2044;display:inline-block;padding:8px 24px;border-radius:6px">
        ${r.numero_lot||'—'} | ${r.variete||'—'} | ${r.annee_production||'—'}
      </div>
    </div>
    <div class="signatures"><div class="sig-box">Responsable magasin</div><div class="sig-box">Signature étuveuse<br><small>${getEtvName(r.compta_etuveuses)}</small></div></div>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Entrées Magasin" subtitle={`${items.length} entrée(s) — ${totalKg.toFixed(2)} kg — ${fcfa(totalVal)}`}
        actions={!readOnly&&<Btn onClick={openAdd}>+ Nouvelle Entrée</Btn>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📥 Aucune entrée magasin</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>N° Lot</TH><TH>Date</TH><TH>Étuveuse</TH><TH>Variété</TH><TH>Année</TH><TH right>Qté (kg)</TH><TH right>Valeur</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold>{r.numero_lot||'—'}</TD>
                  <TD sm>{r.date_entree}</TD>
                  <TD sm>{getEtvName(r.compta_etuveuses)}</TD>
                  <TD sm>{r.variete||'—'}</TD>
                  <TD sm>{r.annee_production||'—'}</TD>
                  <TD right bold>{(r.quantite_kg||0).toLocaleString('fr-FR')} kg</TD>
                  <TD right>{fcfa(r.montant)}</TD>
                  <TD><div style={{display:'flex',gap:4}}>
                    {BTN_ACTION('👁️','#0ea5e9',()=>setViewItem(r),'Voir')}
                    {BTN_ACTION('🖨️','#f59e0b',()=>printEntree(r),'Imprimer')}
                    {!readOnly&&BTN_ACTION('🗑️','#ef4444',()=>deleteItem(r.id),'Supprimer')}
                  </div></TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'Entrée — N° Lot '+viewItem.numero_lot} size="md">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14,marginBottom:16}}>
            {[['N° Lot',viewItem.numero_lot||'—'],['Date',viewItem.date_entree||'—'],
              ['Étuveuse',getEtvName(viewItem.compta_etuveuses)],['Variété',viewItem.variete||'—'],
              ['Année de production',viewItem.annee_production||'—'],['Provenance',viewItem.provenance||'—'],
              ['Prix unitaire',fcfa(viewItem.prix_unitaire)+'/kg'],['Observations',viewItem.observations||'—']
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'14px 18px',background:'#eff6ff',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <span style={{fontWeight:600}}>Quantité reçue</span>
            <span style={{fontSize:18,fontWeight:800,color:ACCENT}}>{(viewItem.quantite_kg||0).toLocaleString('fr-FR')} kg</span>
          </div>
          <div style={{padding:'10px 16px',background:'#0f2044',borderRadius:8,display:'flex',justifyContent:'space-between',color:'white',fontWeight:800}}>
            <span>VALEUR TOTALE</span><span>{fcfa(viewItem.montant)}</span>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printEntree(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouvelle Entrée Magasin" size="lg">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="N° Lot / Étiquette *" name="numero_lot" value={form.numero_lot||''} onChange={set} required placeholder="ex: LOT-ETV-001" />
            <Input label="Date d'entrée *" name="date_entree" type="date" value={form.date_entree||''} onChange={set} required />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Étuveuse *</label>
              <select name="etuveuse_id" value={form.etuveuse_id||''} onChange={set} required
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner —</option>
                {etuveuses.map(e=><option key={e.id} value={e.id}>{getEtvName(e)}</option>)}
              </select>
            </div>
            <Sel label="Variété *" name="variete" value={form.variete||''} onChange={set}
              options={[{value:'',label:'— Variété —'},...ETV_VARIETES.map(v=>({value:v,label:v}))]} />
            <Input label="Année de production *" name="annee_production" type="number" value={form.annee_production||new Date().getFullYear()} onChange={set} required min="2000" max="2100" />
            <Input label="Quantité (kg) *" name="quantite_kg" type="number" value={form.quantite_kg||0} onChange={set} required min="0" step="0.001" />
            <Input label="Prix unitaire (FCFA/kg)" name="prix_unitaire" type="number" value={form.prix_unitaire||0} onChange={set} min="0" />
            <Span2><Input label="Provenance" name="provenance" value={form.provenance||''} onChange={set} /></Span2>
            <Span2><Input label="Observations" name="observations" value={form.observations||''} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── SORTIES MAGASIN ───────────────────────────────────────────────────────────
function EtvSortiesPage({ companies, companyId, toast, readOnly=false }) {
  const [items, setItems]=useState([])
  const [etuveuses, setEtuveuses]=useState([])
  const [lots, setLots]=useState([])
  const [modal, setModal]=useState(false)
  const [viewItem, setViewItem]=useState(null)
  const [form, setForm]=useState({})
  const [saving, setSaving]=useState(false)
  const [dateFrom, setDateFrom]=useState('')
  const [dateTo, setDateTo]=useState('')

  const loadEtuveuses=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_etuveuses').select('id,code_etuveuse,nom_etuveuse,ifu').order('code_etuveuse')
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setEtuveuses(data||[])
  },[companyId])

  const loadLots=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_entrees_magasin').select('id,numero_lot,etuveuse_id,variete,annee_production,quantite_kg').order('date_entree',{ascending:false})
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setLots(data||[])
  },[companyId])

  const load=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_sorties_magasin').select('*,compta_etuveuses(code_etuveuse,fournisseur_id)').order('date_sortie',{ascending:false})
    q = await buildQuery(q, uid, companyId, isAdmin)
    if(dateFrom) q=q.gte('date_sortie',dateFrom)
    if(dateTo) q=q.lte('date_sortie',dateTo)
    const { data }=await q; setItems(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load(); loadEtuveuses(); loadLots() },[load,loadEtuveuses,loadLots])

  const getEtvName=(e)=>{
    if(!e) return '—'
    return e.nom_etuveuse ? `${e.code_etuveuse||''} — ${e.nom_etuveuse}` : (e.code_etuveuse||'—')
  }

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const onSelectLot=(lotId)=>{
    const lot=lots.find(l=>l.id===lotId)
    if(!lot){ setForm(f=>({...f,entree_id:lotId})); return }
    setForm(f=>({...f,entree_id:lotId,numero_lot:lot.numero_lot,etuveuse_id:lot.etuveuse_id,
      variete:lot.variete,annee_production:lot.annee_production}))
  }

  const openAdd=()=>{
    setForm({company_id:companyId||companies[0]?.id||'',etuveuse_id:'',entree_id:'',
      numero_lot:'',date_sortie:today(),variete:'',annee_production:new Date().getFullYear(),
      quantite_kg:0,motif:'',destination:'',observations:''})
    setModal(true)
  }
  const close=()=>setModal(false)

  const deleteItem=async(id)=>{
    if(!window.confirm('Supprimer cette sortie magasin ?')) return
    await supabase.from('compta_sorties_magasin').delete().eq('id',id)
    toast.success('Sortie supprimée !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const { error }=await supabase.from('compta_sorties_magasin').insert({
      ...form, user_id:uid, company_id:form.company_id||companyId,
      quantite_kg:parseFloat(form.quantite_kg)||0,
      annee_production:parseInt(form.annee_production)||new Date().getFullYear()
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Sortie magasin enregistrée !'); close(); load()
  }

  const totalKg=items.reduce((s,r)=>s+(r.quantite_kg||0),0)

  const printSortie=(r)=>{
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bon Sortie Magasin</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">BON DE SORTIE MAGASIN</div></div>
    <div class="doc-title"><h1>DÉSTOCKAGE</h1><div class="doc-date">Date : ${r.date_sortie||'—'}</div></div></div>
    <table><thead><tr><th>Désignation</th><th class="r">Valeur</th></tr></thead><tbody>
    <tr><td>Étuveuse</td><td class="r">${getEtvName(r.compta_etuveuses)}</td></tr>
    <tr><td>N° Lot</td><td class="r"><strong>${r.numero_lot||'—'}</strong></td></tr>
    <tr><td>Variété</td><td class="r">${r.variete||'—'}</td></tr>
    <tr><td>Année de production</td><td class="r">${r.annee_production||'—'}</td></tr>
    <tr><td>Quantité sortie</td><td class="r"><strong>${(r.quantite_kg||0).toLocaleString('fr-FR')} kg</strong></td></tr>
    <tr><td>Motif</td><td class="r">${r.motif||'—'}</td></tr>
    <tr><td>Destination</td><td class="r">${r.destination||'—'}</td></tr>
    </tbody></table>
    <div class="signatures"><div class="sig-box">Responsable magasin</div><div class="sig-box">Visa direction</div></div>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Sorties Magasin" subtitle={`${items.length} sortie(s) — ${totalKg.toFixed(2)} kg déstockés`}
        actions={!readOnly&&<Btn onClick={openAdd}>+ Nouvelle Sortie</Btn>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📤 Aucune sortie magasin</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>Date</TH><TH>Étuveuse</TH><TH>N° Lot</TH><TH>Variété</TH><TH>Année</TH><TH right>Qté sortie (kg)</TH><TH>Motif</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD sm>{r.date_sortie}</TD>
                  <TD sm>{getEtvName(r.compta_etuveuses)}</TD>
                  <TD bold>{r.numero_lot||'—'}</TD>
                  <TD sm>{r.variete||'—'}</TD>
                  <TD sm>{r.annee_production||'—'}</TD>
                  <TD right bold color="#dc2626">{(r.quantite_kg||0).toLocaleString('fr-FR')} kg</TD>
                  <TD sm>{r.motif||'—'}</TD>
                  <TD><div style={{display:'flex',gap:4}}>
                    {BTN_ACTION('👁️','#0ea5e9',()=>setViewItem(r),'Voir')}
                    {BTN_ACTION('🖨️','#f59e0b',()=>printSortie(r),'Imprimer')}
                    {!readOnly&&BTN_ACTION('🗑️','#ef4444',()=>deleteItem(r.id),'Supprimer')}
                  </div></TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title='Détail Sortie Magasin' size="md">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14}}>
            {[['Date',viewItem.date_sortie||'—'],['Étuveuse',getEtvName(viewItem.compta_etuveuses)],
              ['N° Lot',viewItem.numero_lot||'—'],['Variété',viewItem.variete||'—'],
              ['Année',viewItem.annee_production||'—'],['Motif',viewItem.motif||'—'],
              ['Destination',viewItem.destination||'—'],['Observations',viewItem.observations||'—']
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'14px 18px',background:'#fef2f2',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16}}>
            <span style={{fontWeight:600}}>Quantité sortie</span>
            <span style={{fontSize:18,fontWeight:800,color:'#dc2626'}}>{(viewItem.quantite_kg||0).toLocaleString('fr-FR')} kg</span>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printSortie(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouvelle Sortie Magasin" size="lg">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="Date de sortie *" name="date_sortie" type="date" value={form.date_sortie||''} onChange={set} required />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Lot en stock <span style={{fontSize:10,color:'#94a3b8'}}>(auto-rempli)</span></label>
              <select value={form.entree_id||''} onChange={e=>onSelectLot(e.target.value)}
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner un lot —</option>
                {lots.map(l=><option key={l.id} value={l.id}>{l.numero_lot} | {l.variete} | {l.annee_production} ({(l.quantite_kg||0).toLocaleString('fr-FR')} kg)</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Étuveuse *</label>
              <select name="etuveuse_id" value={form.etuveuse_id||''} onChange={set} required
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13}}>
                <option value=''>— Sélectionner —</option>
                {etuveuses.map(e=><option key={e.id} value={e.id}>{getEtvName(e)}</option>)}
              </select>
            </div>
            <Input label="N° Lot" name="numero_lot" value={form.numero_lot||''} onChange={set} />
            <Input label="Variété" name="variete" value={form.variete||''} onChange={set} />
            <Input label="Année production" name="annee_production" type="number" value={form.annee_production||new Date().getFullYear()} onChange={set} />
            <Input label="Quantité à sortir (kg) *" name="quantite_kg" type="number" value={form.quantite_kg||0} onChange={set} required min="0" step="0.001" />
            <Input label="Motif de sortie" name="motif" value={form.motif||''} onChange={set} placeholder="ex: Livraison, Transformation..." />
            <Input label="Destination" name="destination" value={form.destination||''} onChange={set} />
            <Span2><Input label="Observations" name="observations" value={form.observations||''} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── INVENTAIRE PAR ÉTUVEUSE ───────────────────────────────────────────────────
function EtvInventairePage({ companies, companyId, toast }) {
  const [inventaire, setInventaire]=useState([])
  const [loading, setLoading]=useState(false)
  const [etuveuses, setEtuveuses]=useState([])
  const [filterEtv, setFilterEtv]=useState('')

  const loadEtuveuses=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_etuveuses').select('id,code_etuveuse,nom_etuveuse,ifu').order('code_etuveuse')
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setEtuveuses(data||[])
  },[companyId])

  const load=useCallback(async()=>{
    setLoading(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL

    let qE=supabase.from('compta_entrees_magasin').select('etuveuse_id,numero_lot,variete,annee_production,quantite_kg')
    let qS=supabase.from('compta_sorties_magasin').select('etuveuse_id,numero_lot,variete,annee_production,quantite_kg')

    qE = await buildQuery(qE, uid, companyId, isAdmin)
    qS = await buildQuery(qS, uid, companyId, isAdmin)

    if(filterEtv){ qE=qE.eq('etuveuse_id',filterEtv); qS=qS.eq('etuveuse_id',filterEtv) }

    const [{ data:entrees },{ data:sorties }]=await Promise.all([qE,qS])

    // Grouper par etuveuse_id + numero_lot
    const map={}
    ;(entrees||[]).forEach(e=>{
      const key=`${e.etuveuse_id}__${e.numero_lot}`
      if(!map[key]) map[key]={etuveuse_id:e.etuveuse_id,numero_lot:e.numero_lot,variete:e.variete,annee_production:e.annee_production,entrees:0,sorties:0}
      map[key].entrees+=(parseFloat(e.quantite_kg)||0)
    })
    ;(sorties||[]).forEach(s=>{
      const key=`${s.etuveuse_id}__${s.numero_lot}`
      if(!map[key]) map[key]={etuveuse_id:s.etuveuse_id,numero_lot:s.numero_lot,variete:s.variete,annee_production:s.annee_production,entrees:0,sorties:0}
      map[key].sorties+=(parseFloat(s.quantite_kg)||0)
    })

    setInventaire(Object.values(map).map(r=>({...r,stock:Math.max(0,r.entrees-r.sorties)})).sort((a,b)=>a.numero_lot?.localeCompare(b.numero_lot||'')||0))
    setLoading(false)
  },[companyId,filterEtv])

  useEffect(()=>{ loadEtuveuses() },[loadEtuveuses])
  useEffect(()=>{ load() },[load])

  const getEtvName=(etvId)=>{
    const e=etuveuses.find(x=>x.id===etvId)
    if(!e) return etvId
    const f=e.compta_fournisseurs
    const nom=f?(f.type==='morale'?f.nom_societe:(f.nom||'')):''
    return `${e.code_etuveuse||''} — ${nom}`
  }

  const totalEntrees=inventaire.reduce((s,r)=>s+r.entrees,0)
  const totalSorties=inventaire.reduce((s,r)=>s+r.sorties,0)
  const totalStock=inventaire.reduce((s,r)=>s+r.stock,0)

  const printInventaire=()=>{
    const lignesHtml=inventaire.map(r=>`<tr>
      <td>${getEtvName(r.etuveuse_id)}</td><td>${r.numero_lot||'—'}</td>
      <td>${r.variete||'—'}</td><td>${r.annee_production||'—'}</td>
      <td class="r">${r.entrees.toFixed(2)} kg</td>
      <td class="r">${r.sorties.toFixed(2)} kg</td>
      <td class="r" style="font-weight:700;color:${r.stock>0?'#16a34a':'#dc2626'}">${r.stock.toFixed(2)} kg</td>
    </tr>`).join('')
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Inventaire Étuveuses</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">INVENTAIRE ÉTUVEUSES</div></div>
    <div class="doc-title"><h1>ÉTAT DES STOCKS</h1><div class="doc-date">Au : ${new Date().toLocaleDateString('fr-FR')}</div></div></div>
    <table><thead><tr><th>Étuveuse</th><th>N° Lot</th><th>Variété</th><th>Année</th><th class="r">Entrées</th><th class="r">Sorties</th><th class="r">Stock</th></tr></thead>
    <tbody>${lignesHtml}</tbody></table>
    <div class="totals">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px">
        <div style="padding:10px;background:#eff6ff;border-radius:6px;text-align:center"><div>Total Entrées</div><div style="font-weight:800">${totalEntrees.toFixed(2)} kg</div></div>
        <div style="padding:10px;background:#fef2f2;border-radius:6px;text-align:center"><div>Total Sorties</div><div style="font-weight:800;color:#dc2626">${totalSorties.toFixed(2)} kg</div></div>
        <div style="padding:10px;background:#f0fdf4;border-radius:6px;text-align:center"><div>Stock Total</div><div style="font-weight:800;color:#16a34a">${totalStock.toFixed(2)} kg</div></div>
      </div>
    </div>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Inventaire Étuveuses" subtitle="Stock calculé automatiquement (Entrées − Sorties)"
        actions={<Btn variant="danger" onClick={printInventaire}>🖨️ Imprimer inventaire</Btn>} />
      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center'}}>
        <select value={filterEtv} onChange={e=>setFilterEtv(e.target.value)}
          style={{padding:'9px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'white',minWidth:240}}>
          <option value=''>Toutes les étuveuses</option>
          {etuveuses.map(e=>{
            const f=e.compta_fournisseurs
            const nom=f?(f.type==='morale'?f.nom_societe:(f.nom||'')):''
            return <option key={e.id} value={e.id}>{e.code_etuveuse} — {nom}</option>
          })}
        </select>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[
          {l:'Total Entrées', v:totalEntrees.toFixed(2)+' kg', c:'#2563eb', bg:'#eff6ff'},
          {l:'Total Sorties', v:totalSorties.toFixed(2)+' kg', c:'#dc2626', bg:'#fef2f2'},
          {l:'Stock Actuel', v:totalStock.toFixed(2)+' kg', c:'#16a34a', bg:'#f0fdf4'},
        ].map(s=>(
          <Card key={s.l} style={{background:s.bg}}>
            <div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
          </Card>
        ))}
      </div>

      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {loading?<div style={{textAlign:'center',padding:32,color:'#64748b'}}>Chargement...</div>
        :inventaire.length===0?<div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📊 Aucune donnée d'inventaire</div>:(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>Étuveuse</TH><TH>N° Lot</TH><TH>Variété</TH><TH>Année</TH>
              <TH right>Entrées (kg)</TH><TH right>Sorties (kg)</TH><TH right>Stock (kg)</TH>
            </tr></thead>
            <tbody>
              {inventaire.map((r,i)=>(
                <TR key={i}>
                  <TD sm>{getEtvName(r.etuveuse_id)}</TD>
                  <TD bold>{r.numero_lot||'—'}</TD>
                  <TD sm>{r.variete||'—'}</TD>
                  <TD sm>{r.annee_production||'—'}</TD>
                  <TD right color="#2563eb">{r.entrees.toFixed(2)}</TD>
                  <TD right color="#dc2626">{r.sorties.toFixed(2)}</TD>
                  <TD right bold color={r.stock>0?'#16a34a':'#dc2626'}>{r.stock.toFixed(2)}</TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}


// ── TRÉSORERIE ÉTUVEUSES ──────────────────────────────────────────────────────
function EtvTresoreriePage({ companies, companyId, toast }) {
  const [etuveuses,  setEtuveuses]  = useState([])
  const [avances,    setAvances]    = useState([])
  const [entrees,    setEntrees]    = useState([])
  const [sorties,    setSorties]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [filterEtv,  setFilterEtv]  = useState('')
  const [selected,   setSelected]   = useState(null) // étuveuse sélectionnée pour détail

  const loadAll = useCallback(async()=>{
    setLoading(true)
    try {
      const sess = await supabase.auth.getSession()
      if(!sess.data?.session) return
      const uid = sess.data.session.user.id
      const isAdmin = sess.data.session.user.email === SUPER_ADMIN_EMAIL
      let ownerUid = uid
      if(isAdmin && companyId){
        const { data:comp } = await supabase.from('compta_companies').select('user_id').eq('id',companyId).single()
        if(comp?.user_id) ownerUid = comp.user_id
      }

      // Production pattern: buildQuery gère admin+owner fallback
      const [resEtv, resAv, resEnt, resSor] = await Promise.all([
        buildQuery(supabase.from('compta_etuveuses').select('id,code_etuveuse,nom_etuveuse,ifu'), uid, companyId, isAdmin),
        buildQuery(supabase.from('compta_avances_etuveuses').select('etuveuse_id,montant,montant_rembourse,date_avance,numero'), uid, companyId, isAdmin),
        buildQuery(supabase.from('compta_entrees_magasin').select('etuveuse_id,quantite_kg,prix_unitaire,montant,date_entree,numero_lot,variete'), uid, companyId, isAdmin),
        buildQuery(supabase.from('compta_sorties_magasin').select('etuveuse_id,quantite_kg,date_sortie,numero_lot'), uid, companyId, isAdmin),
      ])
      const [r1,r2,r3,r4]=await Promise.all([resEtv,resAv,resEnt,resSor])

      setEtuveuses(r1.data||[])
      setAvances(r2.data||[])
      setEntrees(r3.data||[])
      setSorties(r4.data||[])
    } catch(e){ console.error(e) }
    setLoading(false)
  },[companyId])

  useEffect(()=>{ loadAll() },[loadAll])

  // Calcul trésorerie par étuveuse
  const getTresorerie = (etvId) => {
    const av    = avances.filter(a=>a.etuveuse_id===etvId)
    const ent   = entrees.filter(e=>e.etuveuse_id===etvId)
    const sor   = sorties.filter(s=>s.etuveuse_id===etvId)

    const totalAvance     = av.reduce((s,a)=>s+(a.montant||0),0)
    const totalRembourse  = av.reduce((s,a)=>s+(a.montant_rembourse||0),0)
    const soldeAvance     = totalAvance - totalRembourse

    const qteEntree       = ent.reduce((s,e)=>s+(e.quantite_kg||0),0)
    const qteSortie       = sor.reduce((s,e)=>s+(e.quantite_kg||0),0)
    const qteStock        = Math.max(0, qteEntree - qteSortie)

    const valeurEntree    = ent.reduce((s,e)=>s+(e.montant||0),0)
    const soldeDu         = Math.max(0, soldeAvance - valeurEntree)

    return {
      totalAvance, totalRembourse, soldeAvance,
      qteEntree, qteSortie, qteStock,
      valeurEntree, soldeDu,
      avances: av, entrees: ent, sorties: sor,
      // Situation : créditeur si livré > avance, débiteur sinon
      situation: valeurEntree >= soldeAvance ? 'equilibre' : 'debiteur'
    }
  }

  const filteredEtvs = filterEtv ? etuveuses.filter(e=>e.id===filterEtv) : etuveuses
  const tresoGlobale = etuveuses.reduce((acc, e) => {
    const t = getTresorerie(e.id)
    acc.totalAvances    += t.totalAvance
    acc.totalLivre      += t.valeurEntree
    acc.totalSolde      += t.soldeDu
    acc.totalStock      += t.qteStock
    return acc
  }, {totalAvances:0,totalLivre:0,totalSolde:0,totalStock:0})

  const SITUATION_STYLE = {
    equilibre: {bg:'#f0fdf4',c:'#16a34a',label:'✅ Équilibré'},
    debiteur:  {bg:'#fef2f2',c:'#dc2626',label:'⚠️ Solde dû'},
  }

  const printTresorerie = () => {
    const rows = filteredEtvs.map(e=>{
      const t = getTresorerie(e.id)
      return `<tr>
        <td>${e.code_etuveuse||'—'}</td>
        <td>${e.nom_etuveuse||'—'}</td>
        <td class="r">${Math.round(t.totalAvance).toLocaleString('fr-FR')} FCFA</td>
        <td class="r">${Math.round(t.valeurEntree).toLocaleString('fr-FR')} FCFA</td>
        <td class="r">${t.qteEntree.toFixed(2)} kg</td>
        <td class="r">${t.qteStock.toFixed(2)} kg</td>
        <td class="r" style="font-weight:700;color:${t.soldeDu>0?'#dc2626':'#16a34a'}">${Math.round(t.soldeDu).toLocaleString('fr-FR')} FCFA</td>
        <td>${t.soldeDu>0?'⚠️ Solde dû':'✅ Équilibré'}</td>
      </tr>`
    }).join('')
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Trésorerie Étuveuses</title>
    <style>${CSS_PRINT}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
    .kpi{padding:12px;border-radius:8px;text-align:center}
    </style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
    <div class="header"><div><div class="company-name">SITUATION DE TRÉSORERIE</div></div>
    <div class="doc-title"><h1>Étuveuses</h1><div class="doc-date">Au : ${new Date().toLocaleDateString('fr-FR')}</div></div></div>
    <div class="kpi-grid">
      <div class="kpi" style="background:#eff6ff"><div>Total Avances</div><div style="font-weight:800;font-size:13pt;color:#2563eb">${Math.round(tresoGlobale.totalAvances).toLocaleString('fr-FR')} FCFA</div></div>
      <div class="kpi" style="background:#f0fdf4"><div>Total Livré</div><div style="font-weight:800;font-size:13pt;color:#16a34a">${Math.round(tresoGlobale.totalLivre).toLocaleString('fr-FR')} FCFA</div></div>
      <div class="kpi" style="background:#fef2f2"><div>Solde Dû Total</div><div style="font-weight:800;font-size:13pt;color:#dc2626">${Math.round(tresoGlobale.totalSolde).toLocaleString('fr-FR')} FCFA</div></div>
      <div class="kpi" style="background:#fef3c7"><div>Stock Total</div><div style="font-weight:800;font-size:13pt;color:#92400e">${tresoGlobale.totalStock.toFixed(2)} kg</div></div>
    </div>
    <table><thead><tr>
      <th>Code</th><th>Étuveuse</th><th class="r">Avances</th><th class="r">Livré</th>
      <th class="r">Qté livrée</th><th class="r">Stock</th><th class="r">Solde dû</th><th>Situation</th>
    </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Trésorerie Étuveuses"
        subtitle="Situation financière par étuveuse (avances, livraisons, soldes)"
        actions={<Btn variant="danger" onClick={printTresorerie}>🖨️ Imprimer</Btn>} />

      {/* KPIs globaux */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,marginBottom:20}}>
        {[
          {l:'Total Avances',    v:fcfa(tresoGlobale.totalAvances),  c:'#2563eb', bg:'#eff6ff', icon:'💰'},
          {l:'Total Livré',      v:fcfa(tresoGlobale.totalLivre),    c:'#16a34a', bg:'#f0fdf4', icon:'📥'},
          {l:'Solde Dû Total',   v:fcfa(tresoGlobale.totalSolde),    c:'#dc2626', bg:'#fef2f2', icon:'⚠️'},
          {l:'Stock Total',      v:tresoGlobale.totalStock.toFixed(2)+' kg', c:'#92400e', bg:'#fef3c7', icon:'📦'},
        ].map(s=>(
          <Card key={s.l} style={{background:s.bg,border:'none'}}>
            <div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{s.icon} {s.l}</div>
            <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
          </Card>
        ))}
      </div>

      {/* Filtre */}
      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center'}}>
        <select value={filterEtv} onChange={e=>setFilterEtv(e.target.value)}
          style={{padding:'9px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'white',minWidth:240}}>
          <option value=''>Toutes les étuveuses</option>
          {etuveuses.map(e=><option key={e.id} value={e.id}>{e.code_etuveuse} — {e.nom_etuveuse||'—'}</option>)}
        </select>
        {filterEtv&&<button onClick={()=>setFilterEtv('')} style={{background:'#f1f5f9',border:'none',borderRadius:6,padding:'8px 14px',cursor:'pointer',fontSize:12,color:'#64748b'}}>✕ Réinitialiser</button>}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:48,color:'#64748b'}}>Chargement...</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {filteredEtvs.map(e=>{
            const t = getTresorerie(e.id)
            const sit = SITUATION_STYLE[t.situation]
            return (
              <div key={e.id} style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
                {/* En-tête étuveuse */}
                <div style={{padding:'14px 20px',background:sit.bg,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}}
                  onClick={()=>setSelected(selected===e.id?null:e.id)}>
                  <div>
                    <span style={{fontWeight:800,fontSize:15,color:'#0f2044'}}>{e.code_etuveuse}</span>
                    <span style={{marginLeft:10,fontSize:13,color:'#64748b'}}>{e.nom_etuveuse||'—'}</span>
                    {e.ifu&&<span style={{marginLeft:8,fontSize:11,color:'#94a3b8'}}>IFU: {e.ifu}</span>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <span style={{padding:'4px 12px',borderRadius:20,background:sit.bg,color:sit.c,fontSize:12,fontWeight:700,border:`1px solid ${sit.c}`}}>{sit.label}</span>
                    <span style={{color:'#94a3b8',fontSize:16}}>{selected===e.id?'▲':'▼'}</span>
                  </div>
                </div>

                {/* KPIs ligne */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:0,borderBottom:'1px solid #f1f5f9'}}>
                  {[
                    {l:'Avances reçues',    v:fcfa(t.totalAvance),    c:'#2563eb'},
                    {l:'Remboursé',         v:fcfa(t.totalRembourse), c:'#16a34a'},
                    {l:'Solde avances',     v:fcfa(t.soldeAvance),    c:t.soldeAvance>0?'#dc2626':'#16a34a'},
                    {l:'Qté livrée',        v:t.qteEntree.toFixed(2)+' kg', c:'#0ea5e9'},
                    {l:'En stock',          v:t.qteStock.toFixed(2)+' kg', c:'#f59e0b'},
                    {l:'Valeur livrée',     v:fcfa(t.valeurEntree),   c:'#16a34a'},
                    {l:'Solde dû',          v:fcfa(t.soldeDu),        c:t.soldeDu>0?'#dc2626':'#16a34a'},
                  ].map(k=>(
                    <div key={k.l} style={{padding:'12px 16px',borderRight:'1px solid #f1f5f9'}}>
                      <div style={{fontSize:11,color:'#94a3b8',marginBottom:3}}>{k.l}</div>
                      <div style={{fontSize:13,fontWeight:700,color:k.c}}>{k.v}</div>
                    </div>
                  ))}
                </div>

                {/* Détail expandable */}
                {selected===e.id&&(
                  <div style={{padding:16}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>

                      {/* Avances */}
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>💰 Avances</div>
                        {t.avances.length===0?<div style={{fontSize:12,color:'#94a3b8'}}>Aucune avance</div>:(
                          t.avances.map((a,i)=>(
                            <div key={i} style={{padding:'8px 10px',background:'#f8fafc',borderRadius:6,marginBottom:6,fontSize:12}}>
                              <div style={{fontWeight:600}}>{a.numero||'—'} — {a.date_avance}</div>
                              <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                                <span style={{color:'#2563eb'}}>Avance: {fcfa(a.montant)}</span>
                                <span style={{color:'#16a34a'}}>Remb.: {fcfa(a.montant_rembourse)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Entrées */}
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>📥 Livraisons en magasin</div>
                        {t.entrees.length===0?<div style={{fontSize:12,color:'#94a3b8'}}>Aucune entrée</div>:(
                          t.entrees.map((en,i)=>(
                            <div key={i} style={{padding:'8px 10px',background:'#f8fafc',borderRadius:6,marginBottom:6,fontSize:12}}>
                              <div style={{fontWeight:600}}>Lot {en.numero_lot||'—'} — {en.date_entree}</div>
                              <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                                <span style={{color:'#0ea5e9'}}>{(en.quantite_kg||0).toFixed(2)} kg</span>
                                <span style={{color:'#16a34a'}}>{fcfa(en.montant)}</span>
                              </div>
                              {en.variete&&<div style={{color:'#94a3b8',marginTop:2}}>{en.variete}</div>}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Situation */}
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>📊 Bilan</div>
                        <div style={{background:t.soldeDu>0?'#fef2f2':'#f0fdf4',borderRadius:8,padding:16}}>
                          <div style={{display:'grid',gap:8}}>
                            {[
                              ['Total avances',  fcfa(t.totalAvance),   '#2563eb'],
                              ['Valeur livrée',  '− '+fcfa(t.valeurEntree), '#16a34a'],
                            ].map(([l,v,c])=>(
                              <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                                <span style={{color:'#475569'}}>{l}</span>
                                <span style={{fontWeight:700,color:c}}>{v}</span>
                              </div>
                            ))}
                            <div style={{borderTop:'2px solid #e2e8f0',paddingTop:8,display:'flex',justifyContent:'space-between',fontSize:14}}>
                              <span style={{fontWeight:700}}>Solde dû</span>
                              <span style={{fontWeight:800,fontSize:15,color:t.soldeDu>0?'#dc2626':'#16a34a'}}>{fcfa(t.soldeDu)}</span>
                            </div>
                            <div style={{marginTop:4,display:'flex',justifyContent:'space-between',fontSize:12}}>
                              <span style={{color:'#64748b'}}>Stock en magasin</span>
                              <span style={{fontWeight:700,color:'#f59e0b'}}>{t.qteStock.toFixed(2)} kg</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {filteredEtvs.length===0&&(
            <div style={{textAlign:'center',padding:'64px 24px',background:'white',borderRadius:12,border:'1px solid #e2e8f0',color:'#64748b'}}>
              <div style={{fontSize:40,marginBottom:8}}>💼</div>
              <p>Aucune étuveuse trouvée</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── PARAMÈTRES (Super Admin) ──────────────────────────────────────────────────
const DOCUMENTS_TYPES = [
  'Expression de besoin','Fiche épierrage','Achat semi-fini',
  'Paiement étuvage','Bon de commande','Facture','Proforma',
  'Journal caisse','Journal banque','Journal Mobile Money',
  'Lot de production','Lot semi-fini','Bon livraison','Règlement'
]

// ── CONTRÔLE BUDGÉTAIRE ──────────────────────────────────────────────────────
// Table des tranches CCIB (chiffre d'affaires → cotisation annuelle)
const CCIB_TRANCHES = [
  { min:0,          max:5000000,    montant:20000 },
  { min:5000001,    max:10000000,   montant:30000 },
  { min:10000001,   max:25000000,   montant:50000 },
  { min:25000001,   max:50000000,   montant:150000 },
  { min:50000001,   max:100000000,  montant:250000 },
  { min:100000001,  max:300000000,  montant:300000 },
  { min:300000001,  max:500000000,  montant:400000 },
  { min:500000001,  max:700000000,  montant:500000 },
  { min:700000001,  max:800000000,  montant:600000 },
  { min:800000001,  max:1000000000, montant:800000 },
  { min:1000000001, max:2000000000, montant:1200000 },
  { min:2000000001, max:4000000000, montant:1600000 },
  { min:4000000001, max:Infinity,   montant:2000000 },
]
function calcCCIB(ca) {
  const t = CCIB_TRANCHES.find(t => ca >= t.min && ca <= t.max)
  return t ? t.montant : 0
}

// Lignes de charges (fixes, communes aux 2 formulaires)
const BUDGET_CHARGES = [
  { code:'C1',  label:'ACHAT DU RIZ USINE', groupe:"Charge d'approvisionnement" },
  { code:'C2',  label:'Emballages 100kg+ fil' },
  { code:'C3',  label:'Prestation pour coudre' },
  { code:'C4',  label:'CDL' },
  { code:'C5',  label:'Commissionnaire' },
  { code:'C6',  label:'ENERGIE' },
  { code:'C7',  label:'Transport et manutention' },
  { code:'C8',  label:"transport divers et voyage d'affaire" },
  { code:'C9',  label:'charges salariales et missions diverses', groupe:'Charge de personnel' },
  { code:'C10', label:'Contrôles et conseils' },
  { code:'C11', label:'Volet social et environnement' },
  { code:'C12', label:'bureautiques' },
  { code:'C13', label:'Assurance + prime de motivation + PUB' },
  { code:'C14', label:'Provision aux Amortissements et imprévus', groupe:'Autres charges' },
  { code:'C15', label:'Interêt sur emprunt' },
]
// Impôts (après marge brute) — CCIB est auto-calculé
const BUDGET_IMPOTS = [
  { code:'C16', label:'Impôt sur les sociétés', autoIS:true },
  { code:'C17', label:'TEO' },
  { code:'C18', label:'CCIB', auto:true },
  { code:'C19', label:'Patente' },
  { code:'C20', label:'ORTB' },
]

// ── GRAND-LIVRE ───────────────────────────────────────────────────────────────
function GrandLivrePage({ companies, companyId, toast, readOnly=false }) {
  const [comptes, setComptes]   = useState([])
  const [fourns, setFourns]     = useState([])
  const [clis, setClis]         = useState([])
  const [achats, setAchats]     = useState([])
  const [regls, setRegls]       = useState([])
  const [factures, setFactures] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [loading, setLoading]   = useState(true)

  const norm = s => String(s||'').trim().toLowerCase()
  const companyNameGL = companies.find(c=>c.id===companyId)?.raison_sociale||''

  const load = useCallback(async()=>{
    setLoading(true)
    const { data:ad } = await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    const scope = (q) => { if (isAdmin) { if(companyId) q=q.eq('company_id',companyId) } else { q=q.eq('user_id',uid); if(companyId) q=q.eq('company_id',companyId) } return q }
    const [pc, fo, cl, ac, rg, fa] = await Promise.all([
      scope(supabase.from('compta_plan_comptable').select('numero,libelle,est_collectif')),
      scope(supabase.from('compta_fournisseurs').select('id,type,nom,nom_societe,numero_compte')),
      scope(supabase.from('compta_clients').select('id,type,nom,nom_societe,numero_compte')),
      scope(supabase.from('compta_achats_semi_finis').select('date_achat,nom_fournisseur,numero_fact,montant')),
      scope(supabase.from('compta_reglements').select('date_paiement,tiers_type,tiers_nom,montant_paye,numero_facture')),
      scope(supabase.from('compta_documents').select('date_doc,client_id,montant_ttc,numero,type_doc').eq('type_doc','facture')),
    ])
    setComptes((pc.data||[]).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),undefined,{numeric:true})))
    setFourns(fo.data||[]); setClis(cl.data||[]); setAchats(ac.data||[]); setRegls(rg.data||[]); setFactures(fa.data||[])
    setLoading(false)
  },[companyId])
  useEffect(()=>{ load() },[load])

  const inPeriode = d => (!dateFrom || (d||'')>=dateFrom) && (!dateTo || (d||'')<=dateTo)
  const nomTiers = t => t.type==='morale' ? (t.nom_societe||'') : (t.nom||'')

  // Construit les lignes (débit/crédit) d'un compte donné
  const lignesPourCompte = (numero) => {
    const lignes = []
    const fourn = fourns.find(f=>f.numero_compte===numero)
    const cli   = clis.find(c=>c.numero_compte===numero)
    const isCollFourn = numero===COLLECTIF_FOURNISSEUR
    const isCollCli   = numero===COLLECTIF_CLIENT

    // FOURNISSEUR : achat = crédit, règlement = débit
    const ajoutFourn = (filtreNom) => {
      achats.filter(a=>inPeriode(a.date_achat) && (filtreNom?norm(a.nom_fournisseur)===filtreNom:true))
        .forEach(a=>lignes.push({ date:a.date_achat, libelle:`Achat${a.numero_fact?(' '+a.numero_fact):''}${a.nom_fournisseur?(' — '+a.nom_fournisseur):''}`, debit:0, credit:a.montant||0 }))
      regls.filter(r=>r.tiers_type==='fournisseur' && inPeriode(r.date_paiement) && (filtreNom?norm(r.tiers_nom)===filtreNom:true))
        .forEach(r=>lignes.push({ date:r.date_paiement, libelle:`Règlement${r.numero_facture?(' '+r.numero_facture):''}${r.tiers_nom?(' — '+r.tiers_nom):''}`, debit:r.montant_paye||0, credit:0 }))
    }
    // CLIENT : facture = débit, règlement = crédit
    const ajoutCli = (filtreNom, filtreId) => {
      factures.filter(f=>inPeriode(f.date_doc) && (filtreId?f.client_id===filtreId:true))
        .forEach(f=>lignes.push({ date:f.date_doc, libelle:`Facture${f.numero?(' '+f.numero):''}`, debit:f.montant_ttc||0, credit:0 }))
      regls.filter(r=>r.tiers_type==='client' && inPeriode(r.date_paiement) && (filtreNom?norm(r.tiers_nom)===filtreNom:true))
        .forEach(r=>lignes.push({ date:r.date_paiement, libelle:`Règlement${r.numero_facture?(' '+r.numero_facture):''}${r.tiers_nom?(' — '+r.tiers_nom):''}`, debit:0, credit:r.montant_paye||0 }))
    }

    if (isCollFourn) ajoutFourn(null)
    else if (isCollCli) ajoutCli(null, null)
    else if (fourn) ajoutFourn(norm(nomTiers(fourn)))
    else if (cli) ajoutCli(norm(nomTiers(cli)), cli.id)

    lignes.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))
    return lignes
  }

  // Grand-livre = comptes ayant au moins un mouvement
  const grandLivre = comptes.map(c=>{
    const lignes = lignesPourCompte(c.numero)
    const totalDebit = lignes.reduce((s,l)=>s+(l.debit||0),0)
    const totalCredit = lignes.reduce((s,l)=>s+(l.credit||0),0)
    return { ...c, lignes, totalDebit, totalCredit }
  }).filter(c=>c.lignes.length>0)

  const grandTotalDebit  = grandLivre.reduce((s,c)=>s+c.totalDebit,0)
  const grandTotalCredit = grandLivre.reduce((s,c)=>s+c.totalCredit,0)

  const soldeDebit  = c => Math.max(0, c.totalDebit - c.totalCredit)
  const soldeCredit = c => Math.max(0, c.totalCredit - c.totalDebit)

  const telechargerPDF = () => {
    if (grandLivre.length===0) { toast.error('Aucun mouvement à afficher.'); return }
    const periode = (dateFrom||dateTo) ? `du ${dateFrom||'…'} au ${dateTo||'…'}` : `au ${today()}`
    const sections = grandLivre.map(c=>{
      const corps = c.lignes.map(l=>`<tr>
        <td>${l.date||'—'}</td><td>${l.libelle||'—'}</td>
        <td class="r">${l.debit?Math.round(l.debit).toLocaleString('fr-FR'):''}</td>
        <td class="r">${l.credit?Math.round(l.credit).toLocaleString('fr-FR'):''}</td></tr>`).join('')
      return `
        <tr><td colspan="4" style="background:#e8eef7;font-weight:700;text-align:center">Compte ${c.numero} ${c.libelle||''}${c.est_collectif?' (collectif)':''}</td></tr>
        ${corps}
        <tr style="font-weight:700"><td>${today()}</td><td>Total</td><td class="r">${Math.round(c.totalDebit).toLocaleString('fr-FR')}</td><td class="r">${Math.round(c.totalCredit).toLocaleString('fr-FR')}</td></tr>
        <tr style="font-weight:700"><td>${today()}</td><td>Solde</td><td class="r">${soldeDebit(c)?Math.round(soldeDebit(c)).toLocaleString('fr-FR'):'0'}</td><td class="r">${soldeCredit(c)?Math.round(soldeCredit(c)).toLocaleString('fr-FR'):'0'}</td></tr>`
    }).join('')
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>grand_livre</title>
      <style>${CSS_PRINT}
        table{width:100%;border-collapse:collapse;font-size:9.5pt}
        th,td{border:1px solid #94a3b8;padding:4px 8px}
        th{background:#0f2044;color:white}
        td.r{text-align:right}
      </style></head><body>
      <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
      <div class="header"><div><div class="company-name">GRAND-LIVRE GÉNÉRAL ${periode}</div><div class="doc-numero" style="margin-top:4px">${companyNameGL}</div></div></div>
      <table>
        <thead><tr><th style="width:14%">Date</th><th>Libellé</th><th class="r" style="width:16%">Débit</th><th class="r" style="width:16%">Crédit</th></tr></thead>
        <tbody>
          ${sections}
          <tr style="font-weight:800;background:#fff7ed"><td colspan="2" style="text-align:right">TOTAL GRAND-LIVRE</td><td class="r">${Math.round(grandTotalDebit).toLocaleString('fr-FR')}</td><td class="r">${Math.round(grandTotalCredit).toLocaleString('fr-FR')}</td></tr>
        </tbody>
      </table>
    </body></html>`
    openPrintWindow(html, 'grand_livre')
  }

  return (
    <div>
      <PageHeader title="📚 Grand-Livre" subtitle="Mouvements par compte (dérivés des achats, factures et règlements)"
        actions={<Btn variant="info" onClick={telechargerPDF}>📥 Télécharger PDF</Btn>} />

      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end',marginBottom:14}}>
        <div><label style={{display:'block',fontSize:12,color:'#64748b',marginBottom:4}}>Du</label>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid #d1d5db'}} /></div>
        <div><label style={{display:'block',fontSize:12,color:'#64748b',marginBottom:4}}>Au</label>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid #d1d5db'}} /></div>
        {(dateFrom||dateTo) && <Btn sm variant="secondary" onClick={()=>{setDateFrom('');setDateTo('')}}>Réinitialiser</Btn>}
      </div>

      {loading ? (
        <Card><div style={{textAlign:'center',padding:24,color:'#64748b'}}>Chargement…</div></Card>
      ) : grandLivre.length===0 ? (
        <Card><div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📚 Aucun mouvement sur la période. Les comptes s'alimentent à partir des achats, factures et règlements.</div></Card>
      ) : (
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:640,fontSize:13}}>
              <thead><tr><TH>Date</TH><TH>Libellé</TH><TH right>Débit</TH><TH right>Crédit</TH></tr></thead>
              <tbody>
                {grandLivre.map(c=>(
                  <Fragment key={c.numero}>
                    <tr><td colSpan={4} style={{background:'#e8eef7',fontWeight:700,textAlign:'center',padding:'8px'}}>Compte {c.numero} {c.libelle||''}{c.est_collectif?' (collectif)':''}</td></tr>
                    {c.lignes.map((l,i)=>(
                      <TR key={i}>
                        <TD sm>{l.date||'—'}</TD><TD>{l.libelle||'—'}</TD>
                        <TD right>{l.debit?fcfa(l.debit):''}</TD><TD right>{l.credit?fcfa(l.credit):''}</TD>
                      </TR>
                    ))}
                    <tr style={{fontWeight:700,background:'#f8fafc'}}><td style={{padding:'6px 10px'}}>{today()}</td><td>Total</td><td style={{textAlign:'right',padding:'6px 10px'}}>{fcfa(c.totalDebit)}</td><td style={{textAlign:'right',padding:'6px 10px'}}>{fcfa(c.totalCredit)}</td></tr>
                    <tr style={{fontWeight:700}}><td style={{padding:'6px 10px'}}>{today()}</td><td>Solde</td><td style={{textAlign:'right',padding:'6px 10px',color:'#dc2626'}}>{fcfa(soldeDebit(c))}</td><td style={{textAlign:'right',padding:'6px 10px',color:'#dc2626'}}>{fcfa(soldeCredit(c))}</td></tr>
                  </Fragment>
                ))}
                <tr style={{fontWeight:800,background:'#fff7ed'}}><td colSpan={2} style={{textAlign:'right',padding:'10px'}}>TOTAL GRAND-LIVRE</td><td style={{textAlign:'right',padding:'10px'}}>{fcfa(grandTotalDebit)}</td><td style={{textAlign:'right',padding:'10px'}}>{fcfa(grandTotalCredit)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PLAN COMPTABLE (page) ─────────────────────────────────────────────────────
function PlanComptablePage({ companies, companyId, toast, readOnly=false }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm]     = useState({})
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async()=>{
    const { data:ad } = await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_plan_comptable').select('*')
    if (isAdmin) { if (companyId) q=q.eq('company_id',companyId) }
    else { q=q.eq('user_id',uid); if (companyId) q=q.eq('company_id',companyId) }
    const { data } = await q
    const sorted = (data||[]).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),undefined,{numeric:true}))
    setItems(sorted)
  },[companyId])
  useEffect(()=>{ load() },[load])

  const companyNamePC = companies.find(c=>c.id===companyId)?.raison_sociale||''
  const set = e => setForm(f=>({...f,[e.target.name]:e.target.type==='checkbox'?e.target.checked:e.target.value}))

  const filtered = items.filter(it=>{
    const s=search.trim().toLowerCase(); if(!s) return true
    return String(it.numero).toLowerCase().includes(s) || (it.libelle||'').toLowerCase().includes(s)
  })

  const openAdd = ()=>{ setEditItem(null); setForm({numero:'',libelle:'',est_collectif:false}); setModal(true) }
  const openEdit = it=>{ setEditItem(it); setForm({numero:it.numero||'',libelle:it.libelle||'',est_collectif:!!it.est_collectif}); setModal(true) }
  const close = ()=>{ setModal(false); setEditItem(null) }

  const save = async e=>{
    e.preventDefault()
    const numero = (form.numero||'').trim()
    if (!numero) { toast.error('Saisissez un numéro de compte.'); return }
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const cid = companyId || companies[0]?.id
    // Anti-doublon de numéro (dans la société)
    if (items.some(it=>String(it.numero)===numero && it.id!==editItem?.id)) { toast.error('Ce numéro de compte existe déjà.'); return }
    setSaving(true)
    const pay = { numero, libelle:form.libelle||'', est_collectif:!!form.est_collectif }
    const { error } = editItem
      ? await supabase.from('compta_plan_comptable').update(pay).eq('id', editItem.id)
      : await supabase.from('compta_plan_comptable').insert({...pay, company_id:cid, user_id:uid})
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editItem?'Compte mis à jour !':'Compte ajouté !'); close(); load()
  }

  const del = async id=>{
    if (!window.confirm('Supprimer ce compte du plan comptable ?')) return
    const { error } = await supabase.from('compta_plan_comptable').delete().eq('id',id)
    if (error) { toast.error(error.message); return }
    toast.success('Compte supprimé.'); load()
  }

  // Génère les sous-comptes manquants pour fournisseurs (4011…) et clients (4111…)
  const genererManquants = async ()=>{
    if (!window.confirm('Générer les sous-comptes manquants pour tous les fournisseurs (4011…) et clients (4111…) ?')) return
    setGenerating(true)
    try {
      const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
      const cid = companyId || companies[0]?.id
      let total = 0
      for (const conf of [
        { tableTiers:'compta_fournisseurs', collectif:COLLECTIF_FOURNISSEUR, lib:'Fournisseurs' },
        { tableTiers:'compta_clients',      collectif:COLLECTIF_CLIENT,      lib:'Clients' },
      ]) {
        await assurerCollectif(conf.collectif, conf.lib, cid, uid)
        let q = supabase.from(conf.tableTiers).select('id,type,nom,nom_societe,numero_compte')
        if (isAdmin) { if (cid) q=q.eq('company_id',cid) } else { q=q.eq('user_id',uid); if (cid) q=q.eq('company_id',cid) }
        const { data:tiers } = await q
        const libOf = t => t.type==='morale' ? (t.nom_societe||'') : (t.nom||'')
        let nums = await numerosSousCompte(conf.collectif, cid)
        const numSet = new Set(nums)
        // 1) Réconcilier les fiches qui ont DÉJÀ un numéro mais absent du plan comptable
        for (const t of (tiers||[]).filter(t=>t.numero_compte && String(t.numero_compte).startsWith(conf.collectif))) {
          if (!numSet.has(t.numero_compte)) {
            await supabase.from('compta_plan_comptable').insert({ company_id:cid, user_id:uid, numero:t.numero_compte, libelle:libOf(t), est_collectif:false })
            numSet.add(t.numero_compte); nums.push(t.numero_compte); total++
          }
        }
        // 2) Générer pour les fiches SANS numéro
        for (const t of (tiers||[]).filter(t=>!t.numero_compte)) {
          const numero = prochainSousCompte(conf.collectif, nums)
          await supabase.from('compta_plan_comptable').insert({ company_id:cid, user_id:uid, numero, libelle:libOf(t), est_collectif:false })
          await supabase.from(conf.tableTiers).update({ numero_compte:numero }).eq('id', t.id)
          numSet.add(numero); nums.push(numero); total++
        }
      }
      toast.success(total>0 ? `${total} compte(s) généré(s).` : 'Aucun compte manquant — tout est à jour.')
      load()
    } catch(err) { toast.error('Erreur génération : '+(err.message||err)) }
    setGenerating(false)
  }

  const printPC = ()=>{
    const headers=[{label:'N° Compte'},{label:'Libellé'},{label:'Type'}]
    const rows=filtered.map(it=>[it.numero, it.libelle||'—', it.est_collectif?'Collectif':'Sous-compte'])
    printFilteredList({ title:'Plan Comptable', companyName:companyNamePC, headers, rows })
  }

  return (
    <div>
      <PageHeader title="📒 Plan Comptable" subtitle={`${items.length} compte(s)`}
        actions={!readOnly ? (
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <Btn sm variant="info" onClick={printPC}>🖨️ Imprimer</Btn>
            <Btn sm variant="secondary" onClick={genererManquants} disabled={generating}>{generating?'Génération…':'⚙️ Générer les comptes manquants'}</Btn>
            <Btn onClick={openAdd}>+ Nouveau compte</Btn>
          </div>
        ) : null} />

      <div style={{marginBottom:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher par numéro ou libellé…"
          style={{width:'100%',maxWidth:360,padding:'9px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13.5,boxSizing:'border-box'}} />
      </div>

      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📒 Aucun compte. Cliquez sur « Générer les comptes manquants » ou ajoutez-en un.</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}>
              <thead><tr><TH>N° Compte</TH><TH>Libellé</TH><TH>Type</TH>{!readOnly && <TH>Actions</TH>}</tr></thead>
              <tbody>
                {filtered.map(it=>(
                  <TR key={it.id}>
                    <TD bold sm style={it.est_collectif?{}:{paddingLeft:24}}>{it.numero}</TD>
                    <TD>{it.libelle||'—'}</TD>
                    <TD sm>{it.est_collectif ? <Badge type="info">Collectif</Badge> : <Badge type="secondary">Sous-compte</Badge>}</TD>
                    {!readOnly && (
                      <TD>
                        <div style={{display:'flex',gap:6}}>
                          <Btn sm variant="secondary" onClick={()=>openEdit(it)}>Edit</Btn>
                          <Btn sm variant="danger" onClick={()=>del(it.id)}>🗑️</Btn>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={close} title={editItem?'Modifier le compte':'Nouveau compte'} size="md">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="N° de compte *" name="numero" value={form.numero||''} onChange={set} required />
            <Input label="Libellé" name="libelle" value={form.libelle||''} onChange={set} />
          </Grid>
          <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,fontSize:13.5,color:'#374151',cursor:'pointer'}}>
            <input type="checkbox" name="est_collectif" checked={!!form.est_collectif} onChange={set} />
            Compte collectif (ses sous-comptes commenceront par ce numéro)
          </label>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

function ControleBudgetairePage({ companies, companyId, toast, readOnly=false }) {
  const [tab, setTab] = useState('prevision') // 'prevision' | 'realisation' | 'ecart'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recordId, setRecordId] = useState(null)
  const [budgetsList, setBudgetsList] = useState([])
  const [titre, setTitre] = useState('')
  const [dateBudget, setDateBudget] = useState(new Date().toISOString().slice(0,10))
  const fmt = n => Math.round(n||0).toLocaleString('fr-FR')

  // État : revenus (lignes éditables) + charges + impôts, pour prévision et réalisation
  const emptyRevenus = () => ([
    { code:'P1', label:'Prix du riz usiné traité', qte:0, pu:0 },
    { code:'P2', label:'Hors normes', qte:0, pu:0 },
    { code:'P3', label:'BIOCHAR', qte:0, pu:0 },
  ])
  const emptyCharges = () => BUDGET_CHARGES.map(c=>({...c, qte:0, pu:0, montant:0}))
  const emptyImpots  = () => BUDGET_IMPOTS.map(c=>({...c, montant:0}))

  const [prev, setPrev] = useState({ revenus:emptyRevenus(), charges:emptyCharges(), impots:emptyImpots() })
  const [real, setReal] = useState({ revenus:emptyRevenus(), charges:emptyCharges(), impots:emptyImpots() })

  // Charger la liste des budgets de la société
  const loadList = useCallback(async()=>{
    setLoading(true)
    const cid = companyId || companies[0]?.id
    if(!cid){ setLoading(false); return }
    const { data } = await supabase.from('compta_budget_controle')
      .select('id,titre,date_budget,created_at').eq('company_id',cid).order('date_budget',{ascending:false})
    setBudgetsList(data||[])
    setLoading(false)
  },[companyId, companies])
  useEffect(()=>{ loadList() },[loadList])

  // Charger un budget spécifique
  const loadBudget = async(id)=>{
    if(!id){ // Nouveau budget
      setRecordId(null); setTitre(''); setDateBudget(new Date().toISOString().slice(0,10))
      setPrev({ revenus:emptyRevenus(), charges:emptyCharges(), impots:emptyImpots() })
      setReal({ revenus:emptyRevenus(), charges:emptyCharges(), impots:emptyImpots() })
      return
    }
    setLoading(true)
    const { data } = await supabase.from('compta_budget_controle').select('*').eq('id',id).single()
    if(data){
      setRecordId(data.id)
      setTitre(data.titre||'')
      setDateBudget(data.date_budget||new Date().toISOString().slice(0,10))
      setPrev(data.prevision||{ revenus:emptyRevenus(), charges:emptyCharges(), impots:emptyImpots() })
      setReal(data.realisation||{ revenus:emptyRevenus(), charges:emptyCharges(), impots:emptyImpots() })
    }
    setLoading(false)
  }

  // ── Calculs ───────────────────────────────────────────────────────────────
  const calcTotaux = (data) => {
    const totalRevenus = data.revenus.reduce((s,r)=>s+(r.qte||0)*(r.pu||0), 0)
    const totalCharges = data.charges.reduce((s,c)=>s+((c.qte||0)*(c.pu||0) || c.montant||0), 0)
    const margeBrute = totalRevenus - totalCharges
    // CCIB auto selon le total revenus (chiffre d'affaires)
    const ccib = calcCCIB(totalRevenus)
    // IS auto : 25% (industrielle) ou 30% (commerciale) sur la marge brute,
    // minimum 1% du total revenus si supérieur
    const company = companies.find(c=>c.id===(companyId||companies[0]?.id))
    const tauxIS = company?.type_activite==='commerciale' ? 0.30 : 0.25
    const isParTaux = Math.max(0, margeBrute) * tauxIS
    const isMinimum = totalRevenus * 0.01
    const impotSocietes = Math.round(Math.max(isParTaux, isMinimum))
    // Injecter IS (C16) et CCIB (C18) automatiquement
    const impotsAvecCcib = data.impots.map(i=>{
      if(i.autoIS) return {...i, montant:impotSocietes}
      if(i.auto) return {...i, montant:ccib}
      return i
    })
    const totalImpots = impotsAvecCcib.reduce((s,i)=>s+(i.montant||0), 0)
    const resultat = margeBrute - totalImpots
    return { totalRevenus, totalCharges, margeBrute, ccib, impotSocietes, tauxIS, totalImpots, resultat, impotsAvecCcib }
  }
  const tPrev = calcTotaux(prev)
  const tReal = calcTotaux(real)

  // ── Modificateurs ──────────────────────────────────────────────────────────
  const setData = tab==='prevision' ? setPrev : setReal
  const data = tab==='prevision' ? prev : real
  const totaux = tab==='prevision' ? tPrev : tReal

  const updateRevenu = (i, field, val) => {
    setData(d=>{ const r=[...d.revenus]; r[i]={...r[i],[field]:field==='label'?val:(parseFloat(val)||0)}; return {...d, revenus:r} })
  }
  const addRevenu = () => setData(d=>({...d, revenus:[...d.revenus, { code:'P'+(d.revenus.length+1), label:'', qte:0, pu:0 }]}))
  const removeRevenu = (i) => setData(d=>({...d, revenus:d.revenus.filter((_,idx)=>idx!==i)}))
  const updateChargeField = (i, field, val) => setData(d=>{ const c=[...d.charges]; c[i]={...c[i],[field]:field==='label'?val:(parseFloat(val)||0)}; return {...d, charges:c} })
  const updateChargeLabel = (i, val) => updateChargeField(i,'label',val)
  const addCharge = () => setData(d=>({...d, charges:[...d.charges, { code:'C'+(d.charges.length+1), label:'', qte:0, pu:0, montant:0, custom:true }]}))
  const removeCharge = (i) => setData(d=>({...d, charges:d.charges.filter((_,idx)=>idx!==i)}))
  const updateImpot = (i, val) => setData(d=>{ const im=[...d.impots]; im[i]={...im[i],montant:parseFloat(val)||0}; return {...d, impots:im} })

  // ── Sauvegarde ──────────────────────────────────────────────────────────────
  const save = async()=>{
    if(!titre.trim()){ toast.error('Donnez un titre au budget avant d\'enregistrer.'); return }
    setSaving(true)
    const cid = companyId || companies[0]?.id
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const prevToSave = {...prev, impots: tPrev.impotsAvecCcib}
    const realToSave = {...real, impots: tReal.impotsAvecCcib}
    const payload = { company_id:cid, user_id:uid, titre:titre.trim(), date_budget:dateBudget, prevision:prevToSave, realisation:realToSave }
    let error
    if(recordId){ ({error} = await supabase.from('compta_budget_controle').update(payload).eq('id',recordId)) }
    else { const r = await supabase.from('compta_budget_controle').insert(payload).select().single(); error=r.error; if(r.data) setRecordId(r.data.id) }
    if(error) toast.error(error.message); else { toast.success('Budget enregistré !'); loadList() }
    setSaving(false)
  }

  const deleteBudget = async()=>{
    if(!recordId) return
    if(!confirm('Supprimer ce budget ?')) return
    await supabase.from('compta_budget_controle').delete().eq('id',recordId)
    toast.success('Budget supprimé')
    loadBudget(null); loadList()
  }

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const exportExcel = async()=>{
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs')
    const wb = XLSX.utils.book_new()
    const company = companies.find(c=>c.id===(companyId||companies[0]?.id))
    const buildSheet = (data, totaux, titre) => {
      const rows = [
        [company?.raison_sociale||'', '', '', titre],
        [],
        ['N°','Libellé','Quantité','Prix Unitaire','Montant'],
      ]
      data.revenus.forEach(r=> rows.push([r.code, r.label, r.qte, r.pu, (r.qte||0)*(r.pu||0)]))
      rows.push(['','TOTAL REVENUS','','', totaux.totalRevenus])
      rows.push([])
      rows.push(['','CHARGES','','',''])
      data.charges.forEach(c=> rows.push([c.code, c.label, c.qte||'', c.pu||'', (c.qte||0)*(c.pu||0)||c.montant||0]))
      rows.push(['','TOTAL CHARGES','','', totaux.totalCharges])
      rows.push(['','MARGE BRUTE','','', totaux.margeBrute])
      rows.push([])
      totaux.impotsAvecCcib.forEach(i=> rows.push([i.code, i.label + (i.auto?' (auto)':''), '','', i.montant]))
      rows.push(['','RÉSULTAT APRÈS IMPÔT','','', totaux.resultat])
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{wch:6},{wch:40},{wch:12},{wch:14},{wch:16}]
      return ws
    }
    XLSX.utils.book_append_sheet(wb, buildSheet(prev, tPrev, 'PRÉVISION'), 'PREVISION')
    XLSX.utils.book_append_sheet(wb, buildSheet(real, tReal, 'RÉALISATION'), 'REALISATION')
    // Feuille écart
    const ecartRows = [
      [company?.raison_sociale||'','','ÉCART BUDGÉTAIRE'],[],
      ['Libellé','Prévision','Réalisation','Écart'],
      ['Total Revenus', tPrev.totalRevenus, tReal.totalRevenus, tReal.totalRevenus-tPrev.totalRevenus],
      ['Total Charges', tPrev.totalCharges, tReal.totalCharges, tReal.totalCharges-tPrev.totalCharges],
      ['Marge Brute', tPrev.margeBrute, tReal.margeBrute, tReal.margeBrute-tPrev.margeBrute],
      ['CCIB', tPrev.ccib, tReal.ccib, tReal.ccib-tPrev.ccib],
      ['Total Impôts', tPrev.totalImpots, tReal.totalImpots, tReal.totalImpots-tPrev.totalImpots],
      ['Résultat après impôt', tPrev.resultat, tReal.resultat, tReal.resultat-tPrev.resultat],
    ]
    const wsEcart = XLSX.utils.aoa_to_sheet(ecartRows)
    wsEcart['!cols'] = [{wch:28},{wch:16},{wch:16},{wch:16}]
    XLSX.utils.book_append_sheet(wb, wsEcart, 'ECART BUDGETAIRE')
    XLSX.writeFile(wb, `controle_budgetaire_${company?.raison_sociale||'societe'}.xlsx`)
    toast.success('Fichier Excel téléchargé !')
  }

  // ── Impression PDF ───────────────────────────────────────────────────────────
  const printPdf = (which) => {
    const company = companies.find(c=>c.id===(companyId||companies[0]?.id))
    const sets = which==='ecart'
      ? [{ titre:'ÉCART BUDGÉTAIRE', ecart:true }]
      : which==='realisation'
      ? [{ titre:'RÉALISATION', data:real, totaux:tReal }]
      : [{ titre:'PRÉVISION', data:prev, totaux:tPrev }]

    let body = ''
    sets.forEach(s=>{
      if(s.ecart){
        const eRow = (lbl,p,r)=>`<tr><td>${lbl}</td><td class="r">${fmt(p)}</td><td class="r">${fmt(r)}</td><td class="r"><strong>${fmt(r-p)}</strong></td></tr>`
        body += `<h3>${s.titre}</h3><table><thead><tr><th>Libellé</th><th class="r">Prévision</th><th class="r">Réalisation</th><th class="r">Écart</th></tr></thead><tbody>
          ${eRow('Total Revenus', tPrev.totalRevenus, tReal.totalRevenus)}
          ${eRow('Total Charges', tPrev.totalCharges, tReal.totalCharges)}
          ${eRow('Marge Brute', tPrev.margeBrute, tReal.margeBrute)}
          ${eRow('CCIB', tPrev.ccib, tReal.ccib)}
          ${eRow('Total Impôts', tPrev.totalImpots, tReal.totalImpots)}
          ${eRow('Résultat après impôt', tPrev.resultat, tReal.resultat)}
        </tbody></table>`
      } else {
        const revRows = s.data.revenus.map(r=>`<tr><td>${r.code}</td><td>${r.label}</td><td class="r">${fmt(r.qte)}</td><td class="r">${fmt(r.pu)}</td><td class="r">${fmt((r.qte||0)*(r.pu||0))}</td></tr>`).join('')
        const chRows = s.data.charges.map(c=>`<tr><td>${c.code}</td><td>${c.label}</td><td class="r">${fmt(c.qte)}</td><td class="r">${fmt(c.pu)}</td><td class="r">${fmt((c.qte||0)*(c.pu||0)||c.montant||0)}</td></tr>`).join('')
        const imRows = s.totaux.impotsAvecCcib.map(i=>`<tr><td>${i.code}</td><td>${i.label}${i.auto?' (auto)':''}</td><td colspan="2"></td><td class="r">${fmt(i.montant)}</td></tr>`).join('')
        body += `<h3>${s.titre}</h3><table><thead><tr><th>N°</th><th>Libellé</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Montant</th></tr></thead><tbody>
          ${revRows}
          <tr class="sub"><td colspan="4">TOTAL REVENUS</td><td class="r">${fmt(s.totaux.totalRevenus)}</td></tr>
          ${chRows}
          <tr class="sub"><td colspan="4">TOTAL CHARGES</td><td class="r">${fmt(s.totaux.totalCharges)}</td></tr>
          <tr class="sub"><td colspan="4">MARGE BRUTE</td><td class="r">${fmt(s.totaux.margeBrute)}</td></tr>
          ${imRows}
          <tr class="total"><td colspan="4">RÉSULTAT APRÈS IMPÔT</td><td class="r">${fmt(s.totaux.resultat)}</td></tr>
        </tbody></table>`
      }
    })

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{size:A4;margin:12mm}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a}
      .head{text-align:center;margin-bottom:14px}
      .cname{font-size:16px;font-weight:800;color:#075E54}
      h3{background:#075E54;color:white;padding:6px 10px;border-radius:4px;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-bottom:18px}
      th,td{border:1px solid #ccc;padding:5px 8px}
      th{background:#e8f5ee;font-size:10px}
      .r{text-align:right}
      .sub{background:#f0f9f4;font-weight:700}
      .total{background:#d6f5e0;font-weight:800}
      .print-btn{margin:10px;padding:8px 16px;background:#25D366;color:white;border:none;border-radius:6px;cursor:pointer}
      @media print{.print-btn{display:none}}
    </style></head><body>
      <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
      <div class="head">
        ${company?.logo_url?`<img src="${company.logo_url}" style="max-height:60px"><br>`:''}
        <div class="cname">${company?.raison_sociale||''}</div>
        <div>Contrôle Budgétaire — ${new Date().toLocaleDateString('fr-FR')}</div>
      </div>
      ${body}
    </body></html>`
    openPrintWindow(html)
  }

  if(loading) return <div style={{textAlign:'center',padding:40,color:'#94a3b8'}}>Chargement…</div>

  const inp = (val, onCh, w=90) => <input type="number" value={val||''} onChange={e=>onCh(e.target.value)} disabled={readOnly}
    style={{width:w,padding:'5px 8px',border:'1px solid #d1d5db',borderRadius:6,fontSize:13,textAlign:'right'}} />

  return (
    <div>
      <PageHeader title="📊 Contrôle Budgétaire" subtitle="Prévision · Réalisation · Écart" />

      {/* Sélection / gestion des budgets */}
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:14,marginBottom:16,display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
        <div style={{flex:'1 1 200px',minWidth:160}}>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Budget enregistré</label>
          <select value={recordId||''} onChange={e=>loadBudget(e.target.value||null)}
            style={{width:'100%',padding:'9px 12px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13}}>
            <option value="">— Nouveau budget —</option>
            {budgetsList.map(b=>(
              <option key={b.id} value={b.id}>{b.titre} ({b.date_budget})</option>
            ))}
          </select>
        </div>
        <div style={{flex:'1 1 200px',minWidth:160}}>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Titre du budget *</label>
          <input value={titre} onChange={e=>setTitre(e.target.value)} disabled={readOnly} placeholder="Ex: Campagne 2026"
            style={{width:'100%',padding:'9px 12px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13,boxSizing:'border-box'}} />
        </div>
        <div style={{flex:'0 1 150px',minWidth:130}}>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Date</label>
          <input type="date" value={dateBudget} onChange={e=>setDateBudget(e.target.value)} disabled={readOnly}
            style={{width:'100%',padding:'9px 12px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13,boxSizing:'border-box'}} />
        </div>
        {!readOnly && <button onClick={()=>loadBudget(null)} style={{padding:'9px 14px',background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>+ Nouveau</button>}
        {!readOnly && recordId && <button onClick={deleteBudget} style={{padding:'9px 14px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>🗑️ Supprimer</button>}
      </div>

      {/* Onglets */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {[{id:'prevision',l:'📋 Prévision'},{id:'realisation',l:'✅ Réalisation'},{id:'ecart',l:'📈 Écart Budgétaire'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'8px 18px',borderRadius:8,border:'none',fontWeight:600,fontSize:13,cursor:'pointer',
            background:tab===t.id?ACCENT:'#f1f5f9',color:tab===t.id?'white':'#475569'}}>{t.l}</button>
        ))}
      </div>

      {/* Boutons d'action */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {!readOnly && <button onClick={save} disabled={saving} style={{padding:'9px 16px',background:ACCENT,color:'white',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>{saving?'...':'💾 Enregistrer'}</button>}
        <button onClick={()=>printPdf(tab)} style={{padding:'9px 16px',background:'#f1f5f9',color:'#475569',border:'1px solid #cbd5e1',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>🖨️ Imprimer PDF</button>
        <button onClick={exportExcel} style={{padding:'9px 16px',background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>📊 Télécharger Excel</button>
      </div>

      {tab==='ecart' ? (
        // ── ÉCART BUDGÉTAIRE (auto) ──────────────────────────────────────────
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'#075E54',color:'white'}}>
              <th style={{padding:10,textAlign:'left'}}>Libellé</th>
              <th style={{padding:10,textAlign:'right'}}>Prévision</th>
              <th style={{padding:10,textAlign:'right'}}>Réalisation</th>
              <th style={{padding:10,textAlign:'right'}}>Écart</th>
            </tr></thead>
            <tbody>
              {[
                ['Total Revenus', tPrev.totalRevenus, tReal.totalRevenus],
                ['Total Charges', tPrev.totalCharges, tReal.totalCharges],
                ['Marge Brute', tPrev.margeBrute, tReal.margeBrute],
                ['CCIB', tPrev.ccib, tReal.ccib],
                ['Total Impôts', tPrev.totalImpots, tReal.totalImpots],
                ['Résultat après impôt', tPrev.resultat, tReal.resultat],
              ].map(([lbl,p,r],i)=>{
                const ecart = r-p
                return (
                  <tr key={i} style={{borderTop:'1px solid #e2e8f0',background:i%2?'#f8fafc':'white'}}>
                    <td style={{padding:10,fontWeight:i>=2?700:400}}>{lbl}</td>
                    <td style={{padding:10,textAlign:'right'}}>{fmt(p)}</td>
                    <td style={{padding:10,textAlign:'right'}}>{fmt(r)}</td>
                    <td style={{padding:10,textAlign:'right',fontWeight:700,color:ecart>=0?'#16a34a':'#dc2626'}}>{ecart>=0?'+':''}{fmt(ecart)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        // ── FORMULAIRE PRÉVISION / RÉALISATION ───────────────────────────────
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:16}}>
          {/* Revenus */}
          <div style={{fontWeight:700,color:'#075E54',marginBottom:8,fontSize:14}}>💰 REVENUS</div>
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,marginBottom:8}}>
            <thead><tr style={{background:'#e8f5ee'}}>
              <th style={{padding:8,textAlign:'left',minWidth:60}}>N°</th>
              <th style={{padding:8,textAlign:'left',minWidth:160}}>Libellé</th>
              <th style={{padding:8,textAlign:'right'}}>Quantité</th>
              <th style={{padding:8,textAlign:'right'}}>Prix Unitaire</th>
              <th style={{padding:8,textAlign:'right'}}>Montant</th>
              {!readOnly && <th style={{width:40}}></th>}
            </tr></thead>
            <tbody>
              {data.revenus.map((r,i)=>(
                <tr key={i} style={{borderTop:'1px solid #e2e8f0'}}>
                  <td style={{padding:6}}>{r.code}</td>
                  <td style={{padding:6}}><input value={r.label} onChange={e=>updateRevenu(i,'label',e.target.value)} disabled={readOnly} style={{width:'100%',minWidth:140,padding:'5px 8px',border:'1px solid #d1d5db',borderRadius:6,fontSize:13}} /></td>
                  <td style={{padding:6,textAlign:'right'}}>{inp(r.qte,v=>updateRevenu(i,'qte',v))}</td>
                  <td style={{padding:6,textAlign:'right'}}>{inp(r.pu,v=>updateRevenu(i,'pu',v),110)}</td>
                  <td style={{padding:6,textAlign:'right',fontWeight:600}}>{fmt((r.qte||0)*(r.pu||0))}</td>
                  {!readOnly && <td style={{textAlign:'center'}}>{i>=3 && <button onClick={()=>removeRevenu(i)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14}}>✕</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {!readOnly && <button onClick={addRevenu} style={{padding:'6px 14px',background:'#f0fdf4',color:'#15803d',border:'1px dashed #86efac',borderRadius:8,fontSize:13,cursor:'pointer',marginBottom:12}}>+ Ajouter une ligne de revenu</button>}
          <div style={{background:'#d6f5e0',padding:'8px 12px',borderRadius:8,fontWeight:700,display:'flex',justifyContent:'space-between',marginBottom:20}}>
            <span>TOTAL REVENUS (Chiffre d'affaires)</span><span>{fmt(totaux.totalRevenus)} FCFA</span>
          </div>

          {/* Charges */}
          <div style={{fontWeight:700,color:'#075E54',marginBottom:8,fontSize:14}}>📉 CHARGES</div>
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,marginBottom:8}}>
            <thead><tr style={{background:'#fef2f2'}}>
              <th style={{padding:8,textAlign:'left',minWidth:50}}>N°</th>
              <th style={{padding:8,textAlign:'left',minWidth:160}}>Libellé</th>
              <th style={{padding:8,textAlign:'right'}}>Quantité</th>
              <th style={{padding:8,textAlign:'right'}}>Prix Unitaire</th>
              <th style={{padding:8,textAlign:'right'}}>Montant</th>
              {!readOnly && <th style={{width:40}}></th>}
            </tr></thead>
            <tbody>
              {data.charges.flatMap((c,i)=>{
                const rows=[]
                const montantLigne = (c.qte||0)*(c.pu||0) || c.montant||0
                if(c.groupe) rows.push(<tr key={'g'+i} style={{background:'#f8fafc'}}><td colSpan={6} style={{padding:'8px 6px 4px',fontSize:11,fontWeight:700,color:'#64748b'}}>{c.groupe}</td></tr>)
                rows.push(
                  <tr key={'c'+i} style={{borderTop:'1px solid #f1f5f9'}}>
                    <td style={{padding:6,width:50}}>{c.code}</td>
                    <td style={{padding:6}}>
                      <input value={c.label} onChange={e=>updateChargeLabel(i,e.target.value)} disabled={readOnly} placeholder="Libellé de la charge" style={{width:'100%',minWidth:140,padding:'5px 8px',border:'1px solid #d1d5db',borderRadius:6,fontSize:13}} />
                    </td>
                    <td style={{padding:6,textAlign:'right'}}>{inp(c.qte,v=>updateChargeField(i,'qte',v))}</td>
                    <td style={{padding:6,textAlign:'right'}}>{inp(c.pu,v=>updateChargeField(i,'pu',v),110)}</td>
                    <td style={{padding:6,textAlign:'right',fontWeight:600}}>{fmt(montantLigne)}</td>
                    {!readOnly && <td style={{textAlign:'center',width:40}}>{c.custom && <button onClick={()=>removeCharge(i)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14}}>✕</button>}</td>}
                  </tr>
                )
                return rows
              })}
            </tbody>
          </table>
          </div>
          {!readOnly && <button onClick={addCharge} style={{padding:'6px 14px',background:'#fef2f2',color:'#dc2626',border:'1px dashed #fca5a5',borderRadius:8,fontSize:13,cursor:'pointer',marginBottom:12}}>+ Ajouter une ligne de charge</button>}
          <div style={{background:'#fef2f2',padding:'8px 12px',borderRadius:8,fontWeight:700,display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <span>TOTAL CHARGES</span><span>{fmt(totaux.totalCharges)} FCFA</span>
          </div>
          <div style={{background:'#eff6ff',padding:'8px 12px',borderRadius:8,fontWeight:700,display:'flex',justifyContent:'space-between',marginBottom:20}}>
            <span>MARGE BRUTE</span><span>{fmt(totaux.margeBrute)} FCFA</span>
          </div>

          {/* Impôts */}
          <div style={{fontWeight:700,color:'#075E54',marginBottom:8,fontSize:14}}>🏛️ IMPÔTS & TAXES</div>
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,marginBottom:8}}>
            <tbody>
              {totaux.impotsAvecCcib.map((im,i)=>{
                const isAuto = im.auto || im.autoIS
                return (
                <tr key={i} style={{borderTop:'1px solid #f1f5f9'}}>
                  <td style={{padding:6,width:50}}>{im.code}</td>
                  <td style={{padding:6}}>{im.label}{isAuto && <span style={{marginLeft:8,fontSize:11,background:'#dbeafe',color:'#1d4ed8',borderRadius:6,padding:'1px 8px'}}>auto</span>}</td>
                  <td style={{padding:6,textAlign:'right',width:140}}>
                    {isAuto ? <span style={{fontWeight:700,color:'#1d4ed8'}}>{fmt(im.montant)}</span> : inp(data.impots[i]?.montant,v=>updateImpot(i,v),120)}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          </div>
          <div style={{background:'#075E54',color:'white',padding:'10px 12px',borderRadius:8,fontWeight:800,display:'flex',justifyContent:'space-between',fontSize:15}}>
            <span>RÉSULTAT APRÈS IMPÔT</span><span>{fmt(totaux.resultat)} FCFA</span>
          </div>
          <div style={{marginTop:10,fontSize:12,color:'#64748b',fontStyle:'italic'}}>
            💡 CCIB auto selon la tranche du CA ({fmt(totaux.totalRevenus)} → {fmt(totaux.ccib)} FCFA)<br/>
            💡 IS auto : {(totaux.tauxIS*100)}% de la marge brute, minimum 1% du CA → {fmt(totaux.impotSocietes)} FCFA
          </div>
        </div>
      )}
    </div>
  )
}


// ── CHAT GLOBAL (temps réel) ─────────────────────────────────────────────────
function ChatPage({ profile, toast }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [myUid, setMyUid] = useState(null)
  const [recording, setRecording] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const endRef = useRef(null)
  const fileRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recTimerRef = useRef(null)

  const scrollBottom = () => { setTimeout(()=>endRef.current?.scrollIntoView({behavior:'smooth'}), 50) }

  const load = useCallback(async()=>{
    const { data:ad } = await supabase.auth.getUser()
    setMyUid(ad?.user?.id)
    const { data } = await supabase.from('compta_chat_messages')
      .select('*').order('created_at',{ascending:true}).limit(200)
    setMessages(data||[])
    scrollBottom()
  },[])

  useEffect(()=>{
    load()
    // Abonnement temps réel
    const channel = supabase.channel('chat-global')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'compta_chat_messages' },
        payload => { setMessages(m=>[...m, payload.new]); scrollBottom() })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'compta_chat_messages' },
        payload => { setMessages(m=>m.filter(x=>x.id!==payload.old.id)) })
      .subscribe()
    return ()=>{ supabase.removeChannel(channel) }
  },[load])

  const send = async()=>{
    if(!text.trim() || sending) return
    setSending(true)
    const { data:ad } = await supabase.auth.getUser()
    const uid = ad?.user?.id
    const { error } = await supabase.from('compta_chat_messages').insert({
      user_id: uid,
      auteur_nom: profile?.nom || ad?.user?.email || 'Utilisateur',
      auteur_role: profile?.role || 'utilisateur_simple',
      message: text.trim(),
    })
    if(error) toast.error(error.message)
    else setText('')
    setSending(false)
  }

  const sendImage = async(e)=>{
    const file = e.target.files[0]
    if(!file) return
    if(file.size > 3000000){ toast.error("Image trop lourde. Max 3 Mo."); return }
    setUploading(true)
    try {
      const { data:ad } = await supabase.auth.getUser()
      const uid = ad?.user?.id
      const ext = file.name.split('.').pop()
      const path = `${uid}/${Date.now()}.${ext}`
      const { error:upErr } = await supabase.storage.from('chat-images').upload(path, file)
      if(upErr){ toast.error("Erreur upload : "+upErr.message); setUploading(false); return }
      const { data:urlData } = supabase.storage.from('chat-images').getPublicUrl(path)
      await supabase.from('compta_chat_messages').insert({
        user_id: uid,
        auteur_nom: profile?.nom || ad?.user?.email || 'Utilisateur',
        auteur_role: profile?.role || 'utilisateur_simple',
        image_url: urlData.publicUrl,
      })
    } catch(err) { toast.error("Erreur : "+err.message) }
    setUploading(false)
    e.target.value = ''
  }

  const deleteMsg = async(id)=>{
    if(!confirm("Supprimer ce message ?")) return
    await supabase.from('compta_chat_messages').delete().eq('id', id)
  }

  // ── Enregistrement vocal ──────────────────────────────────────────────
  const startRecording = async()=>{
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e=>{ if(e.data.size>0) chunksRef.current.push(e.data) }
      mr.onstop = async()=>{
        stream.getTracks().forEach(t=>t.stop())
        const blob = new Blob(chunksRef.current, { type:'audio/webm' })
        await uploadAudio(blob)
      }
      mr.start()
      setRecording(true)
      setRecTime(0)
      recTimerRef.current = setInterval(()=>setRecTime(t=>t+1), 1000)
    } catch(err) {
      toast.error("Micro non accessible. Autorisez l'accès au microphone.")
    }
  }

  const stopRecording = (cancel=false)=>{
    if(recTimerRef.current) clearInterval(recTimerRef.current)
    setRecording(false)
    setRecTime(0)
    if(mediaRecorderRef.current && mediaRecorderRef.current.state!=='inactive'){
      if(cancel) chunksRef.current = []
      mediaRecorderRef.current.stop()
    }
  }

  const uploadAudio = async(blob)=>{
    if(!blob || blob.size===0) return
    setUploading(true)
    try {
      const { data:ad } = await supabase.auth.getUser()
      const uid = ad?.user?.id
      const path = `${uid}/${Date.now()}.webm`
      const { error:upErr } = await supabase.storage.from('chat-audios').upload(path, blob, { contentType:'audio/webm' })
      if(upErr){ toast.error("Erreur upload audio : "+upErr.message); setUploading(false); return }
      const { data:urlData } = supabase.storage.from('chat-audios').getPublicUrl(path)
      await supabase.from('compta_chat_messages').insert({
        user_id: uid,
        auteur_nom: profile?.nom || ad?.user?.email || 'Utilisateur',
        auteur_role: profile?.role || 'utilisateur_simple',
        audio_url: urlData.publicUrl,
      })
    } catch(err) { toast.error("Erreur : "+err.message) }
    setUploading(false)
  }

  const fmtRecTime = (s)=> `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  const roleBadge = (role) => {
    if(role==='super_admin') return { label:'Super Admin', color:'#f59e0b' }
    if(role==='admin_societe'||role==='admin') return { label:'Admin', color:'#3b82f6' }
    return { label:'', color:'#94a3b8' }
  }

  const fmtTime = (ts) => new Date(ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 140px)',maxHeight:'calc(100vh - 140px)',width:'100%',maxWidth:'100%',boxSizing:'border-box',overflow:'hidden'}}>
      <PageHeader title="💬 Messagerie" subtitle="Discussion entre tous les utilisateurs" />

      {/* Zone messages */}
      <div style={{flex:1,overflowY:'auto',background:'#e5ddd5',borderRadius:12,padding:16,marginBottom:12,backgroundImage:'linear-gradient(rgba(229,221,213,0.6),rgba(229,221,213,0.6))'}}>
        {messages.length===0 ? (
          <div style={{textAlign:'center',color:'#64748b',padding:40}}>
            <div style={{fontSize:48,marginBottom:12}}>💬</div>
            Aucun message. Lancez la discussion !
          </div>
        ) : messages.map(m=>{
          const mine = m.user_id===myUid
          const badge = roleBadge(m.auteur_role)
          return (
            <div key={m.id} style={{display:'flex',justifyContent:mine?'flex-end':'flex-start',marginBottom:10}}>
              <div style={{maxWidth:'75%',background:mine?'#dcf8c6':'white',borderRadius:10,padding:'8px 12px',boxShadow:'0 1px 1px rgba(0,0,0,0.1)',position:'relative'}}>
                {!mine && (
                  <div style={{fontSize:12,fontWeight:700,color:'#075E54',marginBottom:2,display:'flex',alignItems:'center',gap:6}}>
                    {m.auteur_nom}
                    {badge.label && <span style={{fontSize:10,background:badge.color,color:'white',borderRadius:8,padding:'1px 6px'}}>{badge.label}</span>}
                  </div>
                )}
                {m.image_url && <img src={m.image_url} alt="img" style={{maxWidth:'100%',borderRadius:8,marginBottom:m.message?6:0,cursor:'pointer'}} onClick={()=>window.open(m.image_url,'_blank')} />}
                {m.audio_url && <audio controls src={m.audio_url} style={{maxWidth:'220px',height:40,marginBottom:m.message?6:0}} />}
                {m.message && <div style={{fontSize:14,color:'#1e293b',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{m.message}</div>}
                <div style={{fontSize:10,color:'#94a3b8',textAlign:'right',marginTop:2}}>{fmtTime(m.created_at)}</div>
                {(mine || profile?.role==='super_admin') && (
                  <button onClick={()=>deleteMsg(m.id)} title="Supprimer"
                    style={{position:'absolute',top:2,right:2,background:'none',border:'none',cursor:'pointer',fontSize:11,opacity:0.5,color:'#ef4444'}}>✕</button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Zone saisie */}
      <div style={{display:'flex',gap:6,alignItems:'center',background:'white',borderRadius:12,padding:8,border:'1px solid #e2e8f0',width:'100%',maxWidth:'100%',boxSizing:'border-box',flexShrink:0}}>
        {recording ? (
          <>
            <button onClick={()=>stopRecording(true)} title="Annuler"
              style={{background:'#fee2e2',border:'none',borderRadius:10,padding:'10px 12px',cursor:'pointer',fontSize:18,color:'#dc2626',flexShrink:0}}>
              🗑️
            </button>
            <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:8,padding:'11px 10px',color:'#dc2626',fontSize:13,overflow:'hidden'}}>
              <span style={{width:10,height:10,minWidth:10,borderRadius:'50%',background:'#dc2626',flexShrink:0}}></span>
              <span style={{fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Enreg… {fmtRecTime(recTime)}</span>
            </div>
            <button onClick={()=>stopRecording(false)} title="Envoyer le vocal"
              style={{background:'#25D366',border:'none',borderRadius:'50%',width:44,height:44,minWidth:44,cursor:'pointer',fontSize:18,color:'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              ➤
            </button>
          </>
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" onChange={sendImage} style={{display:'none'}} />
            <button onClick={()=>fileRef.current?.click()} disabled={uploading} title="Envoyer une image"
              style={{background:'#f0f2f5',border:'none',borderRadius:10,padding:'10px 12px',cursor:uploading?'wait':'pointer',fontSize:18,flexShrink:0}}>
              {uploading?'⏳':'📷'}
            </button>
            <input value={text} onChange={e=>setText(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send() } }}
              placeholder="Écrivez un message…"
              style={{flex:1,minWidth:0,padding:'11px 14px',border:'1px solid #e2e8f0',borderRadius:20,fontSize:14,outline:'none',boxSizing:'border-box'}} />
            {text.trim() ? (
              <button onClick={send} disabled={sending}
                style={{background:'#25D366',border:'none',borderRadius:'50%',width:44,height:44,minWidth:44,cursor:'pointer',fontSize:18,color:'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                ➤
              </button>
            ) : (
              <button onClick={startRecording} disabled={uploading} title="Enregistrer un vocal"
                style={{background:'#25D366',border:'none',borderRadius:'50%',width:44,height:44,minWidth:44,cursor:'pointer',fontSize:20,color:'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                🎤
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ParametresPage({ toast, companies, companyId }) {
  const [signataires, setSignataires] = useState([])
  const [theme, setThemeLocal] = useState(getStoredTheme())
  const switchTheme = (m) => { setThemeLocal(m); setStoredTheme(m) }
  const [modal,       setModal]       = useState(false)
  const [form,        setForm]        = useState({nom:'',fonction:'',documents:[]})
  const [saving,      setSaving]      = useState(false)
  const [editItem,    setEditItem]    = useState(null)

  const load=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const { data }=await supabase.from('compta_signataires').select('*').eq('user_id',uid).order('created_at',{ascending:true})
    setSignataires(data||[])
  },[])

  useEffect(()=>{ load() },[load])

  const toggleDoc=(doc)=>setForm(f=>({
    ...f,
    documents: f.documents.includes(doc) ? f.documents.filter(d=>d!==doc) : [...f.documents, doc]
  }))

  const openAdd=()=>{ setEditItem(null); setForm({nom:'',fonction:'',documents:[]}); setModal(true) }
  const openEdit=(s)=>{ setEditItem(s); setForm({nom:s.nom,fonction:s.fonction||'',documents:s.documents||[]}); setModal(true) }
  const close=()=>setModal(false)

  const deleteSign=async(id)=>{
    if(!window.confirm('Supprimer ce signataire ?')) return
    const { error }=await supabase.from('compta_signataires').delete().eq('id',id)
    if(error){ toast.error(error.message); return }
    toast.success('Signataire supprimé !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const payload={user_id:uid,nom:form.nom,fonction:form.fonction,documents:form.documents}
    const { error }=editItem
      ? await supabase.from('compta_signataires').update(payload).eq('id',editItem.id)
      : await supabase.from('compta_signataires').insert(payload)
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success(editItem?'Signataire mis à jour !':'Signataire ajouté !'); close(); load()
  }

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Apparence & signataires de documents" />

      {/* Carte Apparence */}
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20,marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:700,color:'#0f2044',marginBottom:4}}>🎨 Apparence</div>
        <div style={{fontSize:13,color:'#64748b',marginBottom:14}}>Choisissez le thème de l'application.</div>
        <div style={{display:'flex',gap:12}}>
          <button onClick={()=>switchTheme('light')} style={{flex:1,maxWidth:200,padding:'14px',borderRadius:10,cursor:'pointer',border:theme==='light'?'2px solid #25D366':'1px solid #e2e8f0',background:theme==='light'?'#f0fdf4':'white',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
            <span style={{fontSize:28}}>☀️</span>
            <span style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>Mode Clair</span>
            {theme==='light' && <span style={{fontSize:11,color:'#16a34a',fontWeight:700}}>✓ Actif</span>}
          </button>
          <button onClick={()=>switchTheme('dark')} style={{flex:1,maxWidth:200,padding:'14px',borderRadius:10,cursor:'pointer',border:theme==='dark'?'2px solid #25D366':'1px solid #e2e8f0',background:theme==='dark'?'#1f2c34':'white',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
            <span style={{fontSize:28}}>🌙</span>
            <span style={{fontSize:13,fontWeight:600,color:theme==='dark'?'#e9edef':'#1e293b'}}>Mode Sombre</span>
            {theme==='dark' && <span style={{fontSize:11,color:'#25D366',fontWeight:700}}>✓ Actif</span>}
          </button>
        </div>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:20}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:'#0f2044',marginBottom:4}}>✍️ Signataires autorisés</div>
          <div style={{fontSize:13,color:'#64748b'}}>Définissez les personnes habilitées à signer chaque type de document. Leurs noms apparaîtront dans les impressions.</div>
        </div>
        <Btn onClick={openAdd}>+ Nouveau signataire</Btn>
      </div>

      {signataires.length===0?(
        <div style={{textAlign:'center',padding:'64px 24px',background:'white',borderRadius:12,border:'1px solid #e2e8f0',color:'#64748b'}}>
          <div style={{fontSize:40,marginBottom:12}}>✍️</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>Aucun signataire configuré</div>
          <div style={{fontSize:13}}>Ajoutez des signataires pour qu'ils apparaissent dans vos documents imprimés.</div>
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16}}>
          {signataires.map(s=>(
            <div key={s.id} style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                <div>
                  <div style={{fontSize:15,fontWeight:800,color:'#0f2044'}}>{s.nom}</div>
                  {s.fonction&&<div style={{fontSize:12,color:'#64748b',marginTop:2}}>{s.fonction}</div>}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>openEdit(s)} style={{background:'#f1f5f9',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',fontSize:13}}>✏️</button>
                  <button onClick={()=>deleteSign(s.id)} style={{background:'#fee2e2',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',fontSize:13,color:'#dc2626'}}>🗑️</button>
                </div>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',marginBottom:8}}>Documents assignés</div>
              {(s.documents||[]).length===0?(
                <div style={{fontSize:12,color:'#cbd5e1',fontStyle:'italic'}}>Aucun document assigné</div>
              ):(
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {(s.documents||[]).map(doc=>(
                    <span key={doc} style={{padding:'3px 8px',borderRadius:20,background:'#eff6ff',color:'#2563eb',fontSize:11,fontWeight:600,border:'1px solid #bfdbfe'}}>{doc}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={close} title={editItem?'Modifier signataire':'Nouveau signataire'} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="Nom complet *" name="nom" value={form.nom||''} onChange={e=>setForm(f=>({...f,nom:e.target.value}))} required />
            <Input label="Fonction / Titre" name="fonction" value={form.fonction||''} onChange={e=>setForm(f=>({...f,fonction:e.target.value}))} placeholder="ex: Directeur Général" />
          </Grid>
          <div style={{marginBottom:8,fontSize:12,fontWeight:700,color:'#0f2044',textTransform:'uppercase'}}>Documents pour lesquels ce signataire est habilité</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,padding:12,background:'#f8fafc',borderRadius:8,border:'1px solid #e2e8f0',marginBottom:16}}>
            {DOCUMENTS_TYPES.map(doc=>(
              <label key={doc} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:6,
                border:'1px solid '+(form.documents.includes(doc)?ACCENT:'#e2e8f0'),
                background:form.documents.includes(doc)?'#eff6ff':'white',cursor:'pointer',fontSize:13}}>
                <input type="checkbox" checked={form.documents.includes(doc)} onChange={()=>toggleDoc(doc)} style={{accentColor:ACCENT}} />
                {doc}
              </label>
            ))}
          </div>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':editItem?'Mettre à jour':'Ajouter'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}


// ── ÉPIERRAGE ─────────────────────────────────────────────────────────────────
function EpierragePage({ companies, companyId, toast, readOnly=false, lots=[] }) {
  const [items,    setItems]   = useState([])
  const [modal,    setModal]   = useState(false)
  const [form,     setForm]    = useState({})
  const [saving,   setSaving]  = useState(false)
  const [viewItem, setViewItem]= useState(null)
  const [localLots,setLocalLots]=useState([])
  const [dateFrom, setDateFrom]= useState('')
  const [dateTo,   setDateTo]  = useState('')

  useEffect(()=>{
    const fetchLots=async()=>{
      const { data:ad }=await supabase.auth.getUser()
      const uid=ad?.user?.id; if(!uid) return
      const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
      let q=supabase.from('compta_lots_semi_finis').select('id,numero_lot').order('date_reception',{ascending:false})
      if(isAdmin&&companyId) q=q.eq('company_id',companyId)
      else if(companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
      else q=q.eq('user_id',uid)
      const { data }=await q; setLocalLots(data||[])
    }
    fetchLots()
  },[companyId])

  const load=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_epierrage').select('*,compta_companies(raison_sociale)').order('date_epierrage',{ascending:false})
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    if(dateFrom) q=q.gte('date_epierrage',dateFrom)
    if(dateTo)   q=q.lte('date_epierrage',dateTo)
    const { data }=await q; setItems(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const set=e=>{
    setForm(f=>{
      const nf={...f,[e.target.name]:e.target.value}
      if(e.target.name==='lot_id'&&e.target.value){
        const lot=localLots.find(l=>l.id===e.target.value)
        if(lot) nf.numero_lot=lot.numero_lot||''
      }
      const av=parseFloat(e.target.name==='poids_avant'?e.target.value:nf.poids_avant)||0
      const ap=parseFloat(e.target.name==='poids_apres'?e.target.value:nf.poids_apres)||0
      const cailloux=parseFloat(e.target.name==='poids_cailloux'?e.target.value:nf.poids_cailloux)||0
      if(e.target.name==='poids_avant'||e.target.name==='poids_apres'||e.target.name==='poids_cailloux') nf.ecart=Math.max(0,av-ap-cailloux).toFixed(2)
      return nf
    })
  }

  const openAdd=()=>{
    setForm({company_id:companyId||companies[0]?.id||'',lot_id:'',numero_lot:'',date_epierrage:today(),responsable:'',poids_avant:0,poids_apres:0,poids_cailloux:0,ecart:0,taux_humidite:0,observation:'',recommandation:''})
    setModal(true)
  }
  const close=()=>setModal(false)

  const deleteRow=async(id)=>{
    if(!window.confirm('Supprimer cette fiche ?')) return
    const { error }=await supabase.from('compta_epierrage').delete().eq('id',id)
    if(error){ toast.error(error.message); return }
    toast.success('Fiche supprimée !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const year=new Date().getFullYear()
    const { count }=await supabase.from('compta_epierrage').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero=`EP-${year}-${String((count||0)+1).padStart(4,'0')}`
    const poids_avant=parseFloat(form.poids_avant)||0
    const poids_apres=parseFloat(form.poids_apres)||0
    const poids_cailloux_val=parseFloat(form.poids_cailloux)||0
    const ecart=Math.max(0,poids_avant-poids_apres-poids_cailloux_val)
    const { error }=await supabase.from('compta_epierrage').insert({
      company_id:form.company_id||companyId, user_id:uid, numero,
      lot_id:form.lot_id||null, numero_lot:form.numero_lot,
      date_epierrage:form.date_epierrage, responsable:form.responsable,
      poids_avant, poids_apres, poids_cailloux:parseFloat(form.poids_cailloux)||0,
      ecart, taux_humidite:parseFloat(form.taux_humidite)||0,
      observation:form.observation, recommandation:form.recommandation
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success(`Fiche ${numero} enregistrée !`); close(); load()
  }

  const totalAvant=items.reduce((s,r)=>s+(r.poids_avant||0),0)
  const totalApres=items.reduce((s,r)=>s+(r.poids_apres||0),0)
  const companyName=companies.find(c=>c.id===companyId)?.raison_sociale||''

  return (
    <div>
      <PageHeader title="Épierrage" subtitle={`${items.length} fiche(s)`}
        actions={!readOnly&&<Btn onClick={openAdd}>+ Nouvelle Fiche</Btn>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[
          {l:'Total Poids Avant',v:(totalAvant).toFixed(2)+' kg',c:'#2563eb'},
          {l:'Total Poids Après',v:(totalApres).toFixed(2)+' kg',c:'#16a34a'},
          {l:'Total Écart',v:(totalAvant-totalApres).toFixed(2)+' kg',c:'#dc2626'},
        ].map(s=>(
          <Card key={s.l}><div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{s.l}</div>
          <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div></Card>
        ))}
      </div>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>🪨 Aucune fiche d'épierrage</div>
        ):(
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N°</TH><TH>Date</TH><TH>Lot</TH><TH>Responsable</TH>
              <TH right>Pds Avant</TH><TH right>Pds Après</TH><TH right>Cailloux</TH>
              <TH right>Écart</TH><TH right>Humidité</TH><TH>Action</TH>
            </tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero}</TD>
                  <TD sm>{r.date_epierrage}</TD>
                  <TD sm>{r.numero_lot||'—'}</TD>
                  <TD sm>{r.responsable||'—'}</TD>
                  <TD right>{(r.poids_avant||0).toFixed(2)} kg</TD>
                  <TD right>{(r.poids_apres||0).toFixed(2)} kg</TD>
                  <TD right>{(r.poids_cailloux||0).toFixed(2)} kg</TD>
                  <TD right color="#dc2626">{(r.ecart||0).toFixed(2)} kg</TD>
                  <TD right>{r.taux_humidite||0}%</TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <button title="Voir" onClick={()=>setViewItem(r)} style={{background:'#0ea5e9',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>👁️</button>
                      <button title="Imprimer" onClick={()=>printEpierrage(r,companyName)} style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🖨️</button>
                      {!readOnly&&<button title="Supprimer" onClick={()=>deleteRow(r.id)} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🗑️</button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'Fiche Épierrage — '+(viewItem.numero||'—')} size="lg">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14}}>
            {[
              ['N° Fiche',viewItem.numero||'—'],['Date',viewItem.date_epierrage||'—'],
              ['N° Lot',viewItem.numero_lot||'—'],['Responsable',viewItem.responsable||'—'],
              ['Poids avant épierrage',(viewItem.poids_avant||0).toFixed(2)+' kg'],
              ['Poids après épierrage',(viewItem.poids_apres||0).toFixed(2)+' kg'],
              ['Poids des cailloux',(viewItem.poids_cailloux||0).toFixed(2)+' kg'],
              ["Taux d'humidité",(viewItem.taux_humidite||0)+'%'],
              ['Observation',viewItem.observation||'—'],['Recommandation',viewItem.recommandation||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600,color:'#1e293b'}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:20,padding:'14px 18px',background:'#fef2f2',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:'#475569',fontWeight:600}}>ÉCART</span>
            <span style={{fontSize:20,fontWeight:800,color:'#dc2626'}}>{(viewItem.ecart||0).toFixed(2)} kg</span>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printEpierrage(viewItem,companyName)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouvelle Fiche Épierrage" size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="Date *" name="date_epierrage" type="date" value={form.date_epierrage||''} onChange={set} required />
            <Sel label="Lot *" name="lot_id" value={form.lot_id||''} onChange={set}
              options={[{value:'',label:'— Sélectionner un lot —'},...localLots.map(l=>({value:l.id,label:l.numero_lot||'Sans numéro'}))]} />
            <Input label="N° Lot" name="numero_lot" value={form.numero_lot||''} onChange={set} placeholder="Auto depuis lot" />
            <Input label="Responsable de section *" name="responsable" value={form.responsable||''} onChange={set} required />
            <Input label="Poids avant épierrage (kg) *" name="poids_avant" type="number" value={form.poids_avant} onChange={set} required min="0" step="0.001" />
            <Input label="Poids après épierrage (kg) *" name="poids_apres" type="number" value={form.poids_apres} onChange={set} required min="0" step="0.001" />
            <Input label="Poids des cailloux (kg)" name="poids_cailloux" type="number" value={form.poids_cailloux} onChange={set} min="0" step="0.001" />
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Écart calculé (kg)</label>
              <div style={{padding:'9px 12px',background:'#fef2f2',borderRadius:8,border:'1px solid #fecaca',fontSize:14,fontWeight:700,color:'#dc2626'}}>{parseFloat(form.ecart||0).toFixed(2)} kg</div>
            </div>
            <Input label="Taux d'humidité (%)" name="taux_humidite" type="number" value={form.taux_humidite} onChange={set} min="0" max="100" step="0.1" />
            <Span2><Input label="Observation" name="observation" value={form.observation||''} onChange={set} /></Span2>
            <Span2><Input label="Recommandation" name="recommandation" value={form.recommandation||''} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}


// ── DOCUMENTS ADMINISTRATIFS ──────────────────────────────────────────────────
// ── DOCUMENTS VALIDÉS (vue Admin Société) ────────────────────────────────────
function DocsValidesPage({ companies, companyId, toast, profile }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [printModal, setPrintModal] = useState(null)
  const [budgets, setBudgets] = useState([])

  const load = useCallback(async()=>{
    setLoading(true)
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id
    const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_expression_besoin')
      .select('*,compta_companies(raison_sociale,rccm,adresse,tel,logo_url)')
      .eq('statut_validation','traitee')
      .order('date_validation',{ascending:false})
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q
    setItems(data||[])
    setLoading(false)
    // Marquer comme vus
    const nonVus=(data||[]).filter(d=>!d.vu_par_admin).map(d=>d.id)
    if(nonVus.length>0){
      await supabase.from('compta_expression_besoin').update({vu_par_admin:true}).in('id',nonVus)
    }
  },[companyId])

  const loadBudgets=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_budget').select('*')
    q = await buildQuery(q, uid, companyId, isAdmin)
    const { data }=await q; setBudgets(data||[])
  },[companyId])

  useEffect(()=>{ load(); loadBudgets() },[load,loadBudgets])

  if(loading) return <div style={{textAlign:'center',padding:40,color:'#94a3b8'}}>Chargement…</div>

  return (
    <div>
      {items.length===0 ? (
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:48,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>📭</div>
          <div style={{fontWeight:600,color:'#64748b'}}>Aucun document validé</div>
          <div style={{fontSize:13,color:'#94a3b8',marginTop:6}}>Les autorisations de dépense validées par l'administration apparaîtront ici.</div>
        </div>
      ) : (
        <div style={{display:'grid',gap:12}}>
          {items.map(f=>(
            <div key={f.id} style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:'16px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontSize:15,fontWeight:700,color:'#0f2044'}}>{f.reference||f.numero||'Fiche'}</span>
                  <span style={{background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700}}>✅ Validé</span>
                </div>
                <div style={{fontSize:13,color:'#64748b'}}>{f.expression||f.description||''}</div>
                <div style={{fontSize:12,color:'#94a3b8',marginTop:4}}>
                  Montant autorisé : <strong style={{color:'#16a34a'}}>{fcfa(f.total_autorise||0)}</strong>
                  {f.date_validation && ` · Validé le ${new Date(f.date_validation).toLocaleDateString('fr-FR')}`}
                </div>
              </div>
              <button onClick={()=>printExpressionBesoin(f, f.lignes||[], budgets, f.compta_companies, null, null)}
                style={{background:ACCENT,border:'none',borderRadius:8,padding:'10px 18px',cursor:'pointer',color:'white',fontWeight:600,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                📥 Télécharger PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DocsAdminPage({ companies, companyId, toast, readOnly=false, profile }) {
  const [subPage, setSubPage] = useState('fiches') // 'fiches' | 'budgets' | 'valides'
  const [nbNonVus, setNbNonVus] = useState(0)
  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdminSoc = profile?.role === 'admin_societe' || profile?.role === 'admin'

  // Compter les documents validés non vus (pour le badge)
  useEffect(()=>{
    if(!isAdminSoc) return
    const check=async()=>{
      const { data:ad }=await supabase.auth.getUser()
      const uid=ad?.user?.id; if(!uid) return
      let q=supabase.from('compta_expression_besoin').select('id',{count:'exact',head:true})
        .eq('statut_validation','traitee').eq('vu_par_admin',false)
      const prof=(await supabase.from('compta_profiles').select('company_id').eq('id',uid).single()).data
      if(prof?.company_id) q=q.eq('company_id',prof.company_id)
      const { count }=await q
      setNbNonVus(count||0)
    }
    check()
  },[isAdminSoc, subPage])

  const tabs=[
    {id:'fiches',label:'📋 Expressions de besoin'},
    {id:'budgets',label:'💼 Gestion Budget'},
  ]
  // Onglet Documents Validés visible pour admin société
  if(isAdminSoc||isSuperAdmin) tabs.push({id:'valides',label:'✅ Documents Validés',badge:nbNonVus})

  return (
    <div>
      <PageHeader title="Documents administratifs" subtitle="Fiches & Budget" />
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setSubPage(t.id)} style={{
            padding:'8px 18px',borderRadius:8,border:'none',fontWeight:600,fontSize:13,cursor:'pointer',position:'relative',
            background:subPage===t.id?ACCENT:'#f1f5f9',color:subPage===t.id?'white':'#475569'
          }}>
            {t.label}
            {t.badge>0 && <span style={{position:'absolute',top:-6,right:-6,background:'#ef4444',color:'white',borderRadius:10,minWidth:18,height:18,fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px'}}>{t.badge}</span>}
          </button>
        ))}
      </div>
      {subPage==='fiches'    && <ExpressionBesoinPage companies={companies} companyId={companyId} toast={toast} readOnly={readOnly} profile={profile} />}
      {subPage==='budgets'   && <BudgetPage companies={companies} companyId={companyId} toast={toast} readOnly={readOnly} />}
      {subPage==='valides'   && <DocsValidesPage companies={companies} companyId={companyId} toast={toast} profile={profile} />}
    </div>
  )
}

// ── GESTION BUDGET ────────────────────────────────────────────────────────────
function BudgetPage({ companies, companyId, toast, readOnly=false }) {
  const [items,  setItems] = useState([])
  const [modal,  setModal] = useState(false)
  const [form,   setForm]  = useState({})
  const [saving, setSaving]= useState(false)
  const [edit,   setEdit]  = useState(null)

  const load = useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_budget').select('*').order('code',{ascending:true})
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    const { data }=await q; setItems(data||[])
  },[companyId])

  useEffect(()=>{ load() },[load])

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const openAdd=()=>{ setEdit(null); setForm({company_id:companyId||companies[0]?.id||'',code:'',libelle:'',montant:0}); setModal(true) }
  const openEdit=(r)=>{ setEdit(r); setForm({company_id:r.company_id,code:r.code,libelle:r.libelle,montant:r.montant}); setModal(true) }
  const close=()=>setModal(false)

  const deleteBudget=async(id)=>{
    if(!window.confirm('Supprimer cette ligne budgétaire ?')) return
    const { error }=await supabase.from('compta_budget').delete().eq('id',id)
    if(error){ toast.error(error.message); return }
    toast.success('Ligne supprimée !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const payload={company_id:form.company_id||companyId,user_id:uid,code:form.code,libelle:form.libelle,montant:parseFloat(form.montant)||0}
    const { error }=edit
      ? await supabase.from('compta_budget').update(payload).eq('id',edit.id)
      : await supabase.from('compta_budget').insert(payload)
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success(edit?'Ligne mise à jour !':'Ligne ajoutée !'); close(); load()
  }

  const total=items.reduce((s,r)=>s+(r.montant||0),0)

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontSize:13,color:'#64748b'}}>{items.length} ligne(s) — Total : <strong>{fcfa(total)}</strong></div>
        {!readOnly&&<Btn onClick={openAdd}>+ Nouvelle ligne</Btn>}
      </div>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>💼 Aucune ligne budgétaire</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr><TH>Code</TH><TH>Libellé / Ligne budgétaire</TH><TH right>Montant</TH><TH>Action</TH></tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.code}</TD>
                  <TD>{r.libelle}</TD>
                  <TD right bold>{fcfa(r.montant)}</TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <button title="Modifier" onClick={()=>openEdit(r)} style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>✏️</button>
                      {!readOnly&&<button title="Supprimer" onClick={()=>deleteBudget(r.id)} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🗑️</button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <Modal open={modal} onClose={close} title={edit?'Modifier la ligne':'Nouvelle ligne budgétaire'} size="md">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="Code *" name="code" value={form.code||''} onChange={set} required placeholder="ex: BUDGET-001" />
            <Input label="Montant (FCFA) *" name="montant" type="number" value={form.montant||0} onChange={set} required min="0" />
            <Span2><Input label="Libellé / Ligne budgétaire *" name="libelle" value={form.libelle||''} onChange={set} required placeholder="ex: Fournitures de bureau" /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':edit?'Mettre à jour':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── EXPRESSION DE BESOIN ──────────────────────────────────────────────────────
function ExpressionBesoinPage({ companies, companyId, toast, readOnly=false, profile }) {
  const [fiches,      setFiches]     = useState([])
  const [budgets,     setBudgets]    = useState([])
  const [modal,       setModal]      = useState(false)
  const [viewItem,    setViewItem]   = useState(null)
  const [validModal,  setValidModal] = useState(null) // fiche en cours de validation
  const [saving,      setSaving]     = useState(false)
  const [form,        setForm]       = useState({})
  const [lignes,      setLignes]     = useState([])
  const [selBudgets,  setSelBudgets] = useState([])
  const [validLignes, setValidLignes]= useState([]) // lignes de validation
  const [isSuperAdmin,setIsSuperAdmin]=useState(false)
  const [signatureImg, setSignatureImg]=useState(null)   // base64 signature
  const [cachetImg,    setCachetImg]   =useState(null)   // base64 cachet
  const [printModal,   setPrintModal]  =useState(null)   // fiche à imprimer avec options

  useEffect(()=>{
    supabase.auth.getUser().then(async ({data:ad})=>{
      const isSuper = ad?.user?.email===SUPER_ADMIN_EMAIL
      setIsSuperAdmin(isSuper)
    })
  },[])

  const handleImageUpload=(setter)=>(e)=>{
    const file=e.target.files?.[0]; if(!file) return
    const reader=new FileReader()
    reader.onload=ev=>setter(ev.target.result)
    reader.readAsDataURL(file)
  }

  const openPrintModal=(fiche)=>setPrintModal(fiche)

  const load=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id
    const isSuper=ad?.user?.email===SUPER_ADMIN_EMAIL
    const isAdminRole=profile?.role==='admin_societe'||profile?.role==='admin'
    let q=supabase.from('compta_expression_besoin').select('*,compta_companies(raison_sociale,rccm,adresse,tel)').order('created_at',{ascending:false})
    // Super admin voit TOUTES les fiches de toutes les sociétés
    if(isSuper){
      if(companyId) q=q.eq('company_id',companyId) // filtré si société sélectionnée
      // sinon pas de filtre = toutes les fiches
    } else if(companyId){
      q=q.eq('user_id',uid).eq('company_id',companyId)
    } else {
      q=q.eq('user_id',uid)
    }
    const { data }=await q; setFiches(data||[])
  },[companyId,profile])

  const loadBudgets=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_budget').select('*').order('code',{ascending:true})
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    const { data }=await q; setBudgets(data||[])
  },[companyId])

  useEffect(()=>{ load(); loadBudgets() },[load,loadBudgets])

  const set=e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const openAdd=()=>{
    setForm({company_id:companyId||companies[0]?.id||'',date_fiche:today(),reference:'',realise_par:'',fonction:'',direction:'',expression:''})
    setLignes([{id:1,numero_ordre:'1',description:'',quantite:1,prix_unitaire:0,tva:0}])
    setSelBudgets([])
    setModal(true)
  }
  const close=()=>setModal(false)

  const addLigne=()=>setLignes(l=>[...l,{id:Date.now(),numero_ordre:String(l.length+1),description:'',quantite:1,prix_unitaire:0,tva:0}])
  const removeLigne=id=>setLignes(l=>l.filter(x=>x.id!==id))
  const setLigne=(id,field,val)=>setLignes(l=>l.map(x=>x.id===id?{...x,[field]:val}:x))
  const toggleBudget=id=>setSelBudgets(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])

  const totalTTC=lignes.reduce((s,l)=>{
    const pu=parseFloat(l.prix_unitaire)||0,qty=parseFloat(l.quantite)||0,tva=parseFloat(l.tva)||0
    return s+Math.round(pu*qty*(1+tva/100))
  },0)

  const deleteFiche=async(id)=>{
    if(!window.confirm('Supprimer cette fiche ?')) return
    const { error }=await supabase.from('compta_expression_besoin').delete().eq('id',id)
    if(error){ toast.error(error.message); return }
    toast.success('Fiche supprimée !'); load()
  }

  const save=async e=>{
    e.preventDefault(); setSaving(true)
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const year=new Date().getFullYear()
    const { count }=await supabase.from('compta_expression_besoin').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const autoRef=`EB-${year}-${String((count||0)+1).padStart(4,'0')}`
    const payload={
      company_id:form.company_id||companyId, user_id:uid,
      reference:form.reference||autoRef, date_fiche:form.date_fiche,
      realise_par:form.realise_par, fonction:form.fonction,
      direction:form.direction, expression:form.expression,
      codes_budget:selBudgets,
      lignes:lignes.map(l=>({...l,montant:Math.round((parseFloat(l.prix_unitaire)||0)*(parseFloat(l.quantite)||0)*(1+(parseFloat(l.tva)||0)/100)),validation:'en_attente',montant_autorise:0})),
      total_ttc:totalTTC, total_autorise:0
    }
    const { error }=await supabase.from('compta_expression_besoin').insert(payload)
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Fiche enregistrée !'); close(); load()
  }

  // WhatsApp send to super admin
  const sendWhatsApp=(fiche)=>{
    const lignesText=(fiche.lignes||[]).map((l,i)=>
      `  ${l.numero_ordre||i+1}. ${l.description} - Qte: ${l.quantite} - Montant: ${Math.round(l.montant||0).toLocaleString('fr-FR')} FCFA`
    ).join('\n')
    const msg=encodeURIComponent(
      `EXPRESSION DE BESOIN - ${fiche.reference}\n`+
      `Date: ${fiche.date_fiche||'-'}\n`+
      `Realise par: ${fiche.realise_par||'-'} (${fiche.fonction||'-'})\n`+
      `Direction: ${fiche.direction||'-'}\n`+
      `Expression: ${fiche.expression||'-'}\n\n`+
      `DETAIL DES BESOINS:\n${lignesText}\n\n`+
      `TOTAL TTC: ${Math.round(fiche.total_ttc||0).toLocaleString('fr-FR')} FCFA\n\n`+
      `Veuillez valider cette fiche dans ComptaPro.`
    )
    window.open(`https://wa.me/${SUPER_ADMIN_WHATSAPP}?text=${msg}`, '_blank')
  }

  // Open validation modal (super admin)
  const openValidation=(fiche)=>{
    const lignesInit=(fiche.lignes||[]).map(l=>({
      ...l,
      validation:l.validation||'en_attente',
      montant_autorise:l.montant_autorise||l.montant||0,
      quantite_autorisee:l.quantite_autorisee||l.quantite||0
    }))
    setValidLignes(lignesInit)
    setValidModal(fiche)
  }

  const setValidLigne=(id,field,val)=>setValidLignes(l=>l.map(x=>x.id===id?{...x,[field]:val}:x))

  const saveValidation=async()=>{
    if(!validModal) return
    const totalAutorise=validLignes.reduce((s,l)=>
      l.validation==='approuve'?s+Math.round(parseFloat(l.montant_autorise)||0):s
    ,0)
    const estTraitee = validLignes.every(l=>l.validation!=='en_attente')
    const { error }=await supabase.from('compta_expression_besoin').update({
      lignes:validLignes,
      total_autorise:totalAutorise,
      statut_validation:estTraitee?'traitee':'en_cours',
      date_validation: estTraitee ? new Date().toISOString() : null,
      vu_par_admin: estTraitee ? false : null
    }).eq('id',validModal.id)
    if(error){ toast.error(error.message); return }
    toast.success(estTraitee?'✅ Document validé et envoyé à l\'admin société !':'Validation enregistrée !'); setValidModal(null); load()
  }

  const getStatutBadge=(fiche)=>{
    const s=fiche.statut_validation||'en_attente'
    const cfg={en_attente:{c:'#f59e0b',bg:'#fef3c7',label:'En attente'},en_cours:{c:'#3b82f6',bg:'#eff6ff',label:'En cours'},traitee:{c:'#16a34a',bg:'#f0fdf4',label:'Traitée'}}
    const t=cfg[s]||cfg.en_attente
    return <span style={{padding:'3px 8px',borderRadius:20,background:t.bg,color:t.c,fontSize:11,fontWeight:700}}>{t.label}</span>
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontSize:13,color:'#64748b'}}>{fiches.length} fiche(s)</div>
        {!readOnly&&<Btn onClick={openAdd}>+ Nouvelle fiche</Btn>}
      </div>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {fiches.length===0?(
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>📋 Aucune fiche d'expression de besoin</div>
        ):(
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              {isSuperAdmin&&<TH>Société</TH>}
              <TH>Référence</TH><TH>Date</TH><TH>Réalisé par</TH><TH>Direction</TH>
              <TH right>Total demandé</TH><TH right>Total autorisé</TH><TH>Statut</TH><TH>Action</TH>
            </tr></thead>
            <tbody>
              {fiches.map(r=>(
                <TR key={r.id}>
                  {isSuperAdmin&&<TD sm style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.compta_companies?.raison_sociale||'—'}</TD>}
                  <TD bold sm>{r.reference}</TD>
                  <TD sm>{r.date_fiche}</TD>
                  <TD sm>{r.realise_par||'—'}</TD>
                  <TD sm>{r.direction||'—'}</TD>
                  <TD right bold>{fcfa(r.total_ttc)}</TD>
                  <TD right bold color="#16a34a">{fcfa(r.total_autorise||0)}</TD>
                  <TD>{getStatutBadge(r)}</TD>
                  <TD>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      <button title="Voir" onClick={()=>setViewItem(r)} style={{background:'#0ea5e9',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>👁️</button>
                      <button title="Envoyer par WhatsApp" onClick={()=>sendWhatsApp(r)} style={{background:'#25d366',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>
                        <svg width="14" height="14" viewBox="0 0 32 32" fill="none"><path d="M16 3C8.832 3 3 8.832 3 16c0 2.29.614 4.437 1.682 6.29L3 29l6.9-1.655A12.93 12.93 0 0 0 16 29c7.168 0 13-5.832 13-13S23.168 3 16 3Z" fill="white"/><path d="M21.75 19.25c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.71.16-.21.32-.82 1.04-.99 1.25-.17.21-.35.24-.65.08-.32-.16-1.33-.49-2.53-1.56-.94-.83-1.57-1.86-1.75-2.18-.18-.32-.02-.49.13-.65.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.1-.21.05-.39-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.32-1.1 1.07-1.1 2.62s1.13 3.04 1.29 3.25c.16.21 2.22 3.38 5.38 4.74.75.32 1.34.52 1.8.66.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.16-1.52.26-.75.26-1.39.18-1.52-.08-.13-.29-.21-.61-.37Z" fill="#25d366"/></svg>
                      </button>
                      <button title="Imprimer avec signature" onClick={()=>openPrintModal(r)} style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🖨️</button>
                      {(isSuperAdmin||profile?.role==='admin_societe'||profile?.role==='admin')&&<button title="Valider" onClick={()=>openValidation(r)} style={{background:'#7c3aed',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>✅</button>}
                      {!readOnly&&<button title="Supprimer" onClick={()=>deleteFiche(r.id)} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🗑️</button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>


      {/* ── Modal Impression avec Signature & Cachet ── */}
      {printModal&&(
        <Modal open={!!printModal} onClose={()=>setPrintModal(null)} title={'Imprimer — '+printModal.reference} size="lg">
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,color:'#64748b',marginBottom:16}}>
              Importez votre signature et/ou cachet avant d'imprimer. Ces images apparaîtront dans les zones de signature du document.
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
              {/* Signature */}
              <div style={{border:'2px dashed #e2e8f0',borderRadius:10,padding:16,textAlign:'center',background:'#f8fafc'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#0f2044',marginBottom:8}}>✍️ Signature</div>
                {signatureImg?(
                  <div>
                    <img src={signatureImg} alt="Signature" style={{maxWidth:'100%',maxHeight:80,objectFit:'contain',marginBottom:8}} />
                    <button onClick={()=>setSignatureImg(null)} style={{display:'block',margin:'0 auto',background:'#fee2e2',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',color:'#dc2626',fontSize:12}}>✕ Supprimer</button>
                  </div>
                ):(
                  <label style={{cursor:'pointer'}}>
                    <div style={{fontSize:32,marginBottom:6}}>📷</div>
                    <div style={{fontSize:12,color:'#94a3b8',marginBottom:8}}>Cliquer pour importer</div>
                    <div style={{fontSize:11,color:'#cbd5e1'}}>PNG, JPG recommandé</div>
                    <input type="file" accept="image/*" onChange={handleImageUpload(setSignatureImg)} style={{display:'none'}} />
                  </label>
                )}
              </div>
              {/* Cachet */}
              <div style={{border:'2px dashed #e2e8f0',borderRadius:10,padding:16,textAlign:'center',background:'#f8fafc'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#0f2044',marginBottom:8}}>🔏 Cachet / Tampon</div>
                {cachetImg?(
                  <div>
                    <img src={cachetImg} alt="Cachet" style={{maxWidth:'100%',maxHeight:80,objectFit:'contain',marginBottom:8}} />
                    <button onClick={()=>setCachetImg(null)} style={{display:'block',margin:'0 auto',background:'#fee2e2',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',color:'#dc2626',fontSize:12}}>✕ Supprimer</button>
                  </div>
                ):(
                  <label style={{cursor:'pointer'}}>
                    <div style={{fontSize:32,marginBottom:6}}>🖼️</div>
                    <div style={{fontSize:12,color:'#94a3b8',marginBottom:8}}>Cliquer pour importer</div>
                    <div style={{fontSize:11,color:'#cbd5e1'}}>PNG transparent recommandé</div>
                    <input type="file" accept="image/*" onChange={handleImageUpload(setCachetImg)} style={{display:'none'}} />
                  </label>
                )}
              </div>
            </div>
            <div style={{padding:'12px 16px',background:'#eff6ff',borderRadius:8,fontSize:12,color:'#1d4ed8',marginBottom:16}}>
              💡 Les images sont utilisées uniquement pour cette impression — elles ne sont pas enregistrées en base de données.
            </div>
          </div>
          <Row>
            <Btn variant="secondary" onClick={()=>setPrintModal(null)}>Annuler</Btn>
            <button onClick={()=>{ sendWhatsApp(printModal); setPrintModal(null) }}
              style={{background:'#25d366',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',color:'white',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M16 3C8.832 3 3 8.832 3 16c0 2.29.614 4.437 1.682 6.29L3 29l6.9-1.655A12.93 12.93 0 0 0 16 29c7.168 0 13-5.832 13-13S23.168 3 16 3Z" fill="white"/><path d="M21.75 19.25c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.71.16-.21.32-.82 1.04-.99 1.25-.17.21-.35.24-.65.08-.32-.16-1.33-.49-2.53-1.56-.94-.83-1.57-1.86-1.75-2.18-.18-.32-.02-.49.13-.65.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.1-.21.05-.39-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.32-1.1 1.07-1.1 2.62s1.13 3.04 1.29 3.25c.16.21 2.22 3.38 5.38 4.74.75.32 1.34.52 1.8.66.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.16-1.52.26-.75.26-1.39.18-1.52-.08-.13-.29-.21-.61-.37Z" fill="#25d366"/></svg>
              WhatsApp
            </button>
            <Btn onClick={()=>{ printExpressionBesoin(printModal,printModal.lignes||[],budgets,printModal.compta_companies,signatureImg,cachetImg); setPrintModal(null) }}>
              🖨️ Imprimer
            </Btn>
          </Row>
        </Modal>
      )}

      {/* ── Modal Validation Super Admin ── */}
      {validModal&&(
        <Modal open={!!validModal} onClose={()=>setValidModal(null)} title={`Validation — ${validModal.reference}`} size="xl">
          <div style={{marginBottom:16,padding:'12px 16px',background:'#f8fafc',borderRadius:8,display:'flex',gap:24}}>
            <div><span style={{fontSize:12,color:'#94a3b8'}}>Total demandé</span><div style={{fontSize:16,fontWeight:800,color:'#0f2044'}}>{fcfa(validModal.total_ttc)}</div></div>
            <div><span style={{fontSize:12,color:'#94a3b8'}}>Total autorisé</span>
              <div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>
                {fcfa(validLignes.reduce((s,l)=>l.validation==='approuve'?s+Math.round(parseFloat(l.montant_autorise)||0):s,0))}
              </div>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
              <thead>
                <tr style={{background:'#0f2044',color:'white'}}>
                  {['N°','Description','Qté dem.','Montant dem.','Statut','Qté autorisée','Montant autorisé'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:11,fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validLignes.map((l,i)=>{
                  const isApprove=l.validation==='approuve'
                  const isRefuse=l.validation==='refuse'
                  const rowBg=isApprove?'#f0fdf4':isRefuse?'#fef2f2':'white'
                  return (
                    <tr key={l.id||i} style={{borderBottom:'1px solid #e2e8f0',background:rowBg}}>
                      <td style={{padding:'8px 10px',fontSize:13}}>{l.numero_ordre||i+1}</td>
                      <td style={{padding:'8px 10px',fontSize:13,maxWidth:200}}>{l.description}</td>
                      <td style={{padding:'8px 10px',fontSize:13}}>{l.quantite}</td>
                      <td style={{padding:'8px 10px',fontSize:13,fontWeight:700}}>{fcfa(l.montant)}</td>
                      <td style={{padding:'8px 6px'}}>
                        <select value={l.validation||'en_attente'} onChange={e=>setValidLigne(l.id||i,'validation',e.target.value)}
                          style={{padding:'5px 8px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:12,
                            background:isApprove?'#dcfce7':isRefuse?'#fee2e2':'#fef3c7',
                            color:isApprove?'#16a34a':isRefuse?'#dc2626':'#92400e',fontWeight:700}}>
                          <option value="en_attente">⏳ En attente</option>
                          <option value="approuve">✅ Approuvé</option>
                          <option value="refuse">❌ Refusé</option>
                        </select>
                      </td>
                      <td style={{padding:'8px 6px'}}>
                        <input type="number" disabled={!isApprove} value={l.quantite_autorisee||0}
                          onChange={e=>setValidLigne(l.id||i,'quantite_autorisee',e.target.value)}
                          style={{width:80,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:12,
                            opacity:isApprove?1:0.4,background:isApprove?'white':'#f8fafc'}} />
                      </td>
                      <td style={{padding:'8px 6px'}}>
                        <input type="number" disabled={!isApprove} value={l.montant_autorise||0}
                          onChange={e=>setValidLigne(l.id||i,'montant_autorise',e.target.value)}
                          style={{width:110,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:12,
                            opacity:isApprove?1:0.4,background:isApprove?'white':'#f8fafc'}} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="secondary" onClick={()=>setValidModal(null)}>Annuler</Btn>
            <Btn onClick={saveValidation}>💾 Enregistrer la validation</Btn>
          </Row>
        </Modal>
      )}

      {/* ── Modal Aperçu fiche ── */}
      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={"Fiche — "+viewItem.reference} size="xl">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14,marginBottom:16}}>
            {[
              ['Référence',viewItem.reference],['Date',viewItem.date_fiche],
              ['Réalisé par',viewItem.realise_par||'—'],['Fonction',viewItem.fonction||'—'],
              ["Direction d'exploitation",viewItem.direction||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600}}>{v}</div>
              </div>
            ))}
            <div style={{gridColumn:'1/-1',borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
              <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>Expression / Description</div>
              <div style={{fontWeight:600}}>{viewItem.expression||'—'}</div>
            </div>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:6}}>DÉTAIL DES BESOINS</div>
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12,minWidth:600}}>
            <thead><tr style={{background:'#0f2044',color:'white'}}>
              {['N°','Description','Qté dem.','Montant dem.','Statut','Qté aut.','Montant aut.'].map(h=>(
                <th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:11}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(viewItem.lignes||[]).map((l,i)=>{
                const sv=l.validation||'en_attente'
                const vc={approuve:{c:'#16a34a',bg:'#f0fdf4',t:'✅ Approuvé'},refuse:{c:'#dc2626',bg:'#fef2f2',t:'❌ Refusé'},en_attente:{c:'#f59e0b',bg:'#fef3c7',t:'⏳ En attente'}}
                const v=vc[sv]||vc.en_attente
                return (
                  <tr key={i} style={{borderBottom:'1px solid #e2e8f0',background:v.bg}}>
                    <td style={{padding:'7px 10px',fontSize:13}}>{l.numero_ordre||i+1}</td>
                    <td style={{padding:'7px 10px',fontSize:13}}>{l.description}</td>
                    <td style={{padding:'7px 10px',fontSize:13}}>{l.quantite}</td>
                    <td style={{padding:'7px 10px',fontSize:13,fontWeight:700}}>{fcfa(l.montant)}</td>
                    <td style={{padding:'7px 10px'}}><span style={{padding:'3px 8px',borderRadius:20,background:v.bg,color:v.c,fontSize:11,fontWeight:700,border:`1px solid ${v.c}`}}>{v.t}</span></td>
                    <td style={{padding:'7px 10px',fontSize:13}}>{sv==='approuve'?(l.quantite_autorisee||0):'—'}</td>
                    <td style={{padding:'7px 10px',fontSize:13,fontWeight:700,color:'#16a34a'}}>{sv==='approuve'?fcfa(l.montant_autorise):'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div style={{padding:'12px 16px',background:'#0f2044',borderRadius:8,display:'flex',justifyContent:'space-between',color:'white',fontWeight:800}}>
              <span>TOTAL DEMANDÉ</span><span>{fcfa(viewItem.total_ttc)}</span>
            </div>
            <div style={{padding:'12px 16px',background:'#16a34a',borderRadius:8,display:'flex',justifyContent:'space-between',color:'white',fontWeight:800}}>
              <span>TOTAL AUTORISÉ</span><span>{fcfa(viewItem.total_autorise||0)}</span>
            </div>
          </div>
          <Row style={{marginTop:8}}>
            <button onClick={()=>sendWhatsApp(viewItem)} style={{background:'#25d366',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',color:'white',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M16 3C8.832 3 3 8.832 3 16c0 2.29.614 4.437 1.682 6.29L3 29l6.9-1.655A12.93 12.93 0 0 0 16 29c7.168 0 13-5.832 13-13S23.168 3 16 3Z" fill="white"/><path d="M21.75 19.25c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.71.16-.21.32-.82 1.04-.99 1.25-.17.21-.35.24-.65.08-.32-.16-1.33-.49-2.53-1.56-.94-.83-1.57-1.86-1.75-2.18-.18-.32-.02-.49.13-.65.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.1-.21.05-.39-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.32-1.1 1.07-1.1 2.62s1.13 3.04 1.29 3.25c.16.21 2.22 3.38 5.38 4.74.75.32 1.34.52 1.8.66.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.16-1.52.26-.75.26-1.39.18-1.52-.08-.13-.29-.21-.61-.37Z" fill="#25d366"/></svg>
              Envoyer au Super Admin
            </button>
            <Btn variant="danger" onClick={()=>{ setViewItem(null); openPrintModal(viewItem) }}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      {/* ── Modal Création fiche ── */}
      <Modal open={modal} onClose={close} title="Nouvelle Fiche d'Expression de Besoin" size="xl">
        <form onSubmit={save}>
          <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>Informations générales</div>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="Date *" name="date_fiche" type="date" value={form.date_fiche||''} onChange={set} required />
            <Input label="Référence (auto si vide)" name="reference" value={form.reference||''} onChange={set} placeholder="ex: EB-2026-0001" />
            <Input label="Direction d'exploitation" name="direction" value={form.direction||''} onChange={set} />
            <Input label="Réalisé par *" name="realise_par" value={form.realise_par||''} onChange={set} required />
            <Input label="Fonction" name="fonction" value={form.fonction||''} onChange={set} />
            <Span2><Input label="Expression / Description du besoin *" name="expression" value={form.expression||''} onChange={set} required /></Span2>
          </Grid>
          <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>Lignes budgétaires concernées</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16,padding:12,background:'#f8fafc',borderRadius:8,border:'1px solid #e2e8f0'}}>
            {budgets.length===0?<span style={{fontSize:12,color:'#94a3b8'}}>Aucune ligne budgétaire — créez-en dans "Gestion Budget"</span>:
              budgets.map(b=>(
                <label key={b.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:6,border:'1px solid '+(selBudgets.includes(b.id)?ACCENT:'#e2e8f0'),background:selBudgets.includes(b.id)?'#eff6ff':'white',cursor:'pointer',fontSize:13}}>
                  <input type="checkbox" checked={selBudgets.includes(b.id)} onChange={()=>toggleBudget(b.id)} style={{accentColor:ACCENT}} />
                  {b.code} — {b.libelle} ({fcfa(b.montant)})
                </label>
              ))
            }
          </div>
          <div style={{fontSize:12,fontWeight:700,color:'#0f2044',marginBottom:8,textTransform:'uppercase'}}>Détail des besoins</div>
          <div style={{background:'#f8fafc',borderRadius:8,border:'1px solid #e2e8f0',overflow:'hidden',marginBottom:12}}>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
              <thead><tr style={{background:'#0f2044',color:'white'}}>
                {['N°','Description','Quantité','Prix Unitaire (FCFA)','TVA (%)','Montant TTC',''].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:11}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lignes.map((l,i)=>{
                  const pu=parseFloat(l.prix_unitaire)||0,qty=parseFloat(l.quantite)||0,tva=parseFloat(l.tva)||0
                  const montant=Math.round(pu*qty*(1+tva/100))
                  return (
                    <tr key={l.id} style={{borderBottom:'1px solid #e2e8f0'}}>
                      <td style={{padding:'6px 8px',width:40}}><input value={l.numero_ordre} onChange={e=>setLigne(l.id,'numero_ordre',e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}} /></td>
                      <td style={{padding:'6px 8px'}}><input value={l.description} onChange={e=>setLigne(l.id,'description',e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}} placeholder="Description" /></td>
                      <td style={{padding:'6px 8px',width:80}}><input type="number" value={l.quantite} onChange={e=>setLigne(l.id,'quantite',e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}} min="0" step="0.001" /></td>
                      <td style={{padding:'6px 8px',width:120}}><input type="number" value={l.prix_unitaire} onChange={e=>setLigne(l.id,'prix_unitaire',e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}} min="0" /></td>
                      <td style={{padding:'6px 8px',width:70}}><input type="number" value={l.tva} onChange={e=>setLigne(l.id,'tva',e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #e2e8f0',borderRadius:4,fontSize:12}} min="0" max="100" step="0.1" /></td>
                      <td style={{padding:'6px 8px',width:120,fontWeight:700,color:ACCENT,fontSize:13}}>{fcfa(montant)}</td>
                      <td style={{padding:'6px 4px',width:32}}>{lignes.length>1&&<button type="button" onClick={()=>removeLigne(l.id)} style={{background:'#fee2e2',border:'none',borderRadius:4,padding:'3px 7px',cursor:'pointer',color:'#dc2626',fontSize:12}}>✕</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            <div style={{padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid #e2e8f0'}}>
              <button type="button" onClick={addLigne} style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'5px 12px',cursor:'pointer',color:ACCENT,fontSize:13,fontWeight:600}}>+ Ajouter une ligne</button>
              <div style={{fontWeight:800,fontSize:15,color:'#0f2044'}}>TOTAL TTC : {fcfa(totalTTC)}</div>
            </div>
          </div>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer la fiche'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── GESTION BUDGET ────────────────────────────────────────────────────────────
// ── TRÉSORERIE : comptes / journaux (Caisse, Banque, Mobile Money) ───────────
const JOURNAL_TABLE = { caisse:'compta_journal_caisse', banque:'compta_journal_banque', mobile:'compta_journal_mobile' }
const JOURNAL_LABEL = { caisse:'Journal Caisse', banque:'Journal Banque', mobile:'Journal Mobile Money' }
const COMPTE_OPTIONS = [
  { value:'caisse', label:'🏦 Journal Caisse' },
  { value:'banque', label:'🏛️ Journal Banque' },
  { value:'mobile', label:'📱 Journal Mobile Money' },
]

// Solde courant d'un compte (entrées − sorties) pour une société
async function getSoldeCompte(compte, cid) {
  const table = JOURNAL_TABLE[compte]; if (!table || !cid) return 0
  const { data:ad } = await supabase.auth.getUser()
  const uid = ad?.user?.id; const isAdmin = ad?.user?.email===SUPER_ADMIN_EMAIL
  let q = supabase.from(table).select('type_operation,montant')
  if (isAdmin) q = q.eq('company_id', cid)
  else q = q.eq('user_id', uid).eq('company_id', cid)
  const { data } = await q
  return (data||[]).reduce((s,r)=> s + (r.type_operation==='entree' ? (r.montant||0) : -(r.montant||0)), 0)
}

// Crée une écriture "sortie" dans le journal du compte, liée à sa source
async function creerSortieJournal({ compte, cid, uid, date, montant, libelle, tiers, reference, sourceType, sourceId }) {
  const table = JOURNAL_TABLE[compte]; if (!table) return { error:{ message:'Compte invalide' } }
  return await supabase.from(table).insert({
    company_id: cid, user_id: uid, date_operation: date || today(),
    numero_piece:'', libelle: libelle||'', tiers: tiers||'',
    type_operation:'sortie', montant: Math.round(montant||0),
    reference: reference||'', source_type: sourceType, source_id: sourceId,
  })
}

// Supprime la sortie liée (quel que soit le journal) quand la source est supprimée
async function supprimerSortiesJournal(sourceType, sourceId) {
  for (const t of Object.values(JOURNAL_TABLE)) {
    await supabase.from(t).delete().eq('source_type', sourceType).eq('source_id', sourceId)
  }
}

function ReglementsPage({ companies, companyId, toast, readOnly=false, mode='clients' }) {
  const isClients = mode==='clients'
  const title     = isClients ? 'Règlements Clients' : 'Règlements Fournisseurs'
  const filterKey = isClients ? 'client' : 'fournisseur'

  const [items,    setItems]   = useState([])
  const [modal,    setModal]   = useState(false)
  const [form,     setForm]    = useState({})
  const [saving,   setSaving]  = useState(false)
  const [dateFrom, setDateFrom]= useState('')
  const [dateTo,   setDateTo]  = useState('')
  const [factures, setFactures]= useState([])
  const [fournsList, setFournsList] = useState([])
  const [viewItem, setViewItem]= useState(null)

  const load = useCallback(async()=>{
    const { data:ad } = await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_reglements')
      .select('*,compta_companies(raison_sociale)')
      .eq('tiers_type', filterKey)
      .order('date_paiement',{ascending:false})
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    if(dateFrom) q=q.gte('date_paiement',dateFrom)
    if(dateTo)   q=q.lte('date_paiement',dateTo)
    const { data }=await q; setItems(data||[])
  },[companyId,dateFrom,dateTo,filterKey])

  // Charger factures livrées (clients uniquement)
  const loadFactures = useCallback(async()=>{
    if(!isClients) return
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_documents')
      .select('id,numero,type_doc,statut,montant_ttc,client_id,compta_clients(nom,prenom,nom_societe,type)')
      .order('created_at',{ascending:false})
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    const { data }=await q; setFactures(data||[])
  },[companyId,isClients])

  useEffect(()=>{ load() },[load])
  useEffect(()=>{ loadFactures() },[loadFactures])

  // Charger les fournisseurs (pour l'autocomplétion du nom) — règlements fournisseurs uniquement
  const loadFourns = useCallback(async()=>{
    if(isClients) return
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_fournisseurs').select('id,type,nom,nom_societe')
    q = isAdmin&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uid)
    if(companyId&&!isAdmin) q=q.eq('company_id',companyId)
    const { data }=await q
    const noms = (data||[]).map(f=> f.type==='morale' ? (f.nom_societe||'') : (f.nom||'')).filter(n=>n.trim()!=='')
    setFournsList([...new Set(noms)].sort((a,b)=>a.localeCompare(b)))
  },[companyId,isClients])
  useEffect(()=>{ loadFourns() },[loadFourns])

  const total = items.reduce((s,r)=>s+(r.montant_paye||0),0)
  const set = e=>setForm(f=>({...f,[e.target.name]:e.target.value}))
  const companyNameR = companies.find(c=>c.id===companyId)?.raison_sociale||''

  // Auto-remplissage depuis facture sélectionnée
  const getClientName = (fac) => {
    const c = fac.compta_clients
    if(!c) return ''
    return c.type==='morale' ? (c.nom_societe||'') : (c.nom||'')
  }

  const onSelectFacture = (num) => {
    const fac = factures.find(f=>f.numero===num)
    if(!fac){ setForm(f=>({...f,numero_facture:num})); return }
    setForm(f=>({...f,
      numero_facture:   fac.numero,
      tiers_nom:        getClientName(fac),
      provenance:       '',
      acheteur_vendeur: '',
      nature_produit:   '',
      _montant_ttc:     fac.montant_ttc||0,  // montant total de la facture
      solde:            fac.montant_ttc||0,   // solde = total au départ
      montant_paye:     0,
    }))
  }

  // Recalculer solde quand montant_paye change
  const onMontantChange = (e) => {
    const paye = parseFloat(e.target.value)||0
    const total = parseFloat(form._montant_ttc)||0
    const solde = Math.max(0, total - paye)
    setForm(f=>({...f, montant_paye:e.target.value, solde:Math.round(solde)}))
  }

  const emptyForm = {
    company_id:companyId||companies[0]?.id||'',
    numero_facture:'', date_paiement:today(),
    tiers_type: filterKey, tiers_nom:'', provenance:'',
    acheteur_vendeur:'', nature_produit:'',
    montant_paye:0, solde:0,
    mode_paiement: isClients?'espèce':'caisse', reference_paiement:'', notes:''
  }

  const deleteRegl = async(id)=>{
    if(!window.confirm('Supprimer ce règlement ?')) return
    const { error }=await supabase.from('compta_reglements').delete().eq('id',id)
    if(error){ toast.error(error.message); return }
    if(!isClients) await supprimerSortiesJournal('reglement_fournisseur', id)
    toast.success('Règlement supprimé !'); load()
  }

  const openAdd = ()=>{ setForm(emptyForm); setModal(true) }
  const close   = ()=>setModal(false)

  const save = async e=>{
    e.preventDefault()
    const { data:ad }=await supabase.auth.getUser(); const uid=ad?.user?.id
    const { company_id,numero_facture,date_paiement,tiers_nom,provenance,acheteur_vendeur,nature_produit,montant_paye,solde,mode_paiement,reference_paiement,notes } = form
    const cid = company_id || companyId || companies[0]?.id

    // Règlements fournisseurs : mode_paiement = compte (caisse/banque/mobile) → sortie de trésorerie
    if (!isClients) {
      const compte = mode_paiement
      if (!JOURNAL_TABLE[compte]) { toast.error('Veuillez choisir un compte de règlement.'); return }
      const montant = +montant_paye || 0
      if (montant <= 0) { toast.error('Le montant payé doit être supérieur à 0.'); return }
      setSaving(true)
      const soldeCompte = await getSoldeCompte(compte, cid)
      if (montant > soldeCompte) {
        setSaving(false)
        toast.error(`Vous ne pouvez pas régler par ce compte : solde insuffisant (${JOURNAL_LABEL[compte]} : ${fcfa(soldeCompte)}).`)
        return
      }
      const { data:ins, error } = await supabase.from('compta_reglements').insert({
        company_id:cid,user_id:uid,numero_facture,date_paiement,
        tiers_type:filterKey, tiers_nom,provenance,acheteur_vendeur,nature_produit,
        montant_paye:montant,solde:+solde,mode_paiement,reference_paiement,notes
      }).select('id').single()
      if (error) { setSaving(false); toast.error(error.message); return }
      const { error:errJ } = await creerSortieJournal({
        compte, cid, uid, date:date_paiement, montant,
        libelle:`Règlement fournisseur ${tiers_nom||''}${numero_facture?(' — '+numero_facture):''}`.trim(),
        tiers:tiers_nom, reference:reference_paiement,
        sourceType:'reglement_fournisseur', sourceId:ins.id,
      })
      setSaving(false)
      if (errJ) toast.error('Règlement enregistré, mais erreur sur le journal : '+errJ.message)
      else toast.success(`Règlement enregistré — sortie ${JOURNAL_LABEL[compte]} : ${fcfa(montant)}`)
      close(); load(); return
    }

    // Règlements clients : inchangé
    setSaving(true)
    const { error }=await supabase.from('compta_reglements').insert({
      company_id:cid,user_id:uid,numero_facture,date_paiement,
      tiers_type:filterKey, tiers_nom,provenance,acheteur_vendeur,nature_produit,
      montant_paye:+montant_paye,solde:+solde,mode_paiement,reference_paiement,notes
    })
    setSaving(false)
    if(error){ toast.error(error.message); return }
    toast.success('Règlement enregistré !'); close(); load()
  }

  const printFilteredR = () => {
    const headers = [{label:'N° Fact.'},{label:'Date'},{label:isClients?'Client':'Fournisseur'},{label:'Provenance'},{label:'Produit'},{label:'Mode'},{label:'Montant payé',r:true},{label:'Solde',r:true}]
    const rows = items.map(r=>[r.numero_facture||'—',r.date_paiement,r.tiers_nom||'—',r.provenance||'—',r.nature_produit||'—',r.mode_paiement||'—',Math.round(r.montant_paye||0).toLocaleString('fr-FR')+' FCFA',Math.round(r.solde||0).toLocaleString('fr-FR')+' FCFA'])
    printFilteredList({ title, companyName:companyNameR, headers, rows, dateFrom, dateTo,
      totals:[{label:'Total payé', value:Math.round(total).toLocaleString('fr-FR')+' FCFA'}]})
  }

  // Vérifie si champ vient d'une facture sélectionnée
  const autoFilled = (field) => isClients && form[field] && factures.find(f=>f.numero===form.numero_facture)
  const autoStyle  = (field) => ({
    width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, boxSizing:'border-box',
    border:'1.5px solid '+(autoFilled(field)?'#bbf7d0':'#e2e8f0'),
    background: autoFilled(field)?'#f0fdf4':'white'
  })

  return (
    <div>
      <PageHeader title={title}
        subtitle={`${items.length} règlement(s) — Total payé : ${fcfa(total)}`}
        actions={<>
          <Btn sm variant="danger" onClick={printFilteredR}>🖨️ PDF liste</Btn>
          {!readOnly && <Btn onClick={openAdd}>+ Nouveau Règlement</Btn>}
        </>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
            {isClients?'💳':'💸'} Aucun règlement {isClients?'client':'fournisseur'} enregistré
          </div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N° Fact.</TH><TH>Date</TH>
              <TH>{isClients?'Client':'Fournisseur'}</TH>
              <TH>Provenance</TH><TH>Produit</TH>
              <TH right>Montant payé</TH><TH right>Solde</TH><TH>Mode</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero_facture||'—'}</TD>
                  <TD sm>{r.date_paiement}</TD>
                  <TD sm>{r.tiers_nom||'—'}</TD>
                  <TD sm>{r.provenance||'—'}</TD>
                  <TD sm>{r.nature_produit||'—'}</TD>
                  <TD right color="#16a34a" bold>{fcfa(r.montant_paye)}</TD>
                  <TD right color={(r.solde||0)>0?'#dc2626':'#16a34a'}>{fcfa(r.solde)}</TD>
                  <TD sm>{r.mode_paiement||'—'}</TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <button title="Voir" onClick={()=>setViewItem(r)} style={{background:'#0ea5e9',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>👁️</button>
                      <button title="Imprimer" onClick={()=>printReglement(r)} style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🖨️</button>
                      {!readOnly&&<button title="Supprimer" onClick={()=>deleteRegl(r.id)} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🗑️</button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>


      {/* ── Modal Vue règlement ── */}
      {viewItem&&(
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'Règlement — '+(viewItem.numero_facture||'—')} size="lg">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14,marginBottom:16}}>
            {[
              ['N° Facture', viewItem.numero_facture||'—'],
              ['Date', viewItem.date_paiement||'—'],
              [isClients?'Client':'Fournisseur', viewItem.tiers_nom||'—'],
              ['Provenance', viewItem.provenance||'—'],
              ['Acheteur / Vendeur', viewItem.acheteur_vendeur||'—'],
              ['Nature du produit', viewItem.nature_produit||'—'],
              ['Mode de paiement', viewItem.mode_paiement||'—'],
              ['Référence', viewItem.reference_paiement||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600,color:'#1e293b'}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div style={{padding:'12px 16px',background:'#f0fdf4',borderRadius:8,display:'flex',justifyContent:'space-between',fontWeight:800}}>
              <span style={{color:'#475569'}}>Montant payé</span>
              <span style={{color:'#16a34a',fontSize:16}}>{fcfa(viewItem.montant_paye)}</span>
            </div>
            <div style={{padding:'12px 16px',background:(viewItem.solde||0)>0?'#fef2f2':'#f0fdf4',borderRadius:8,display:'flex',justifyContent:'space-between',fontWeight:800}}>
              <span style={{color:'#475569'}}>Solde restant</span>
              <span style={{color:(viewItem.solde||0)>0?'#dc2626':'#16a34a',fontSize:16}}>{fcfa(viewItem.solde)}</span>
            </div>
          </div>
          {viewItem.notes&&<div style={{padding:'10px 14px',background:'#f8fafc',borderRadius:8,fontSize:13,color:'#475569'}}><strong>Notes :</strong> {viewItem.notes}</div>}
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printReglement(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title={`Nouveau Règlement ${isClients?'Client':'Fournisseur'}`} size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>

            {/* N° Facture */}
            <div style={{gridColumn:'1/2'}}>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>
                N° Facture {isClients&&<span style={{fontSize:10,color:'#94a3b8'}}>(depuis les factures livrées)</span>}
              </label>
              {isClients ? (
                <>
                  <select value={form.numero_facture||''} onChange={e=>onSelectFacture(e.target.value)}
                    style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13,background:'white',cursor:'pointer'}}>
                    <option value=''>— Sélectionner une facture —</option>
                    {factures.map(f=>(
                      <option key={f.id} value={f.numero}>
                        {f.numero} · {(f.type_doc||'').toUpperCase()} · {f.compta_clients?.type==='morale'?f.compta_clients?.nom_societe:(f.compta_clients?.nom||'')||'?'}
                      </option>
                    ))}
                  </select>
                  {factures.length===0&&<div style={{fontSize:11,color:'#f59e0b',marginTop:4}}>⚠️ Aucune facture livrée trouvée — vérifiez les Documents commerciaux</div>}
                </>
              ) : (
                <input value={form.numero_facture||''} onChange={e=>setForm(f=>({...f,numero_facture:e.target.value}))}
                  placeholder="ex: FACT-2026-0001"
                  style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13,boxSizing:'border-box'}} />
              )}
            </div>

            <Input label="Date *" name="date_paiement" type="date" value={form.date_paiement||''} onChange={set} required />
            <div /> {/* spacer */}

            {/* Nom du tiers */}
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>
                {isClients?'Nom du client':'Nom du fournisseur'} *
                {autoFilled('tiers_nom')&&<span style={{marginLeft:6,fontSize:10,color:'#16a34a',fontWeight:700}}>✅ auto</span>}
              </label>
              <input name="tiers_nom" value={form.tiers_nom||''} onChange={set} required style={autoStyle('tiers_nom')}
                list={isClients?undefined:'fourn-nom-list'}
                placeholder={isClients?'':'Saisir / choisir un fournisseur'} />
              {!isClients && (
                <datalist id="fourn-nom-list">
                  {fournsList.map((n,i)=><option key={i} value={n} />)}
                </datalist>
              )}
            </div>

            {/* Provenance */}
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>
                Provenance
                {autoFilled('provenance')&&<span style={{marginLeft:6,fontSize:10,color:'#16a34a',fontWeight:700}}>✅ auto</span>}
              </label>
              <input name="provenance" value={form.provenance||''} onChange={set} style={autoStyle('provenance')} />
            </div>

            {/* Acheteur / Vendeur */}
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>
                {isClients?'Acheteur':'Vendeur'}
                {autoFilled('acheteur_vendeur')&&<span style={{marginLeft:6,fontSize:10,color:'#16a34a',fontWeight:700}}>✅ auto</span>}
              </label>
              <input name="acheteur_vendeur" value={form.acheteur_vendeur||''} onChange={set} style={autoStyle('acheteur_vendeur')} />
            </div>

            {/* Nature produit */}
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>
                Nature du produit
                {autoFilled('nature_produit')&&<span style={{marginLeft:6,fontSize:10,color:'#16a34a',fontWeight:700}}>✅ auto</span>}
              </label>
              <input name="nature_produit" value={form.nature_produit||''} onChange={set} style={autoStyle('nature_produit')} />
            </div>

            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>Montant payé (FCFA) *</label>
              <input type="number" name="montant_paye" value={form.montant_paye||0} onChange={onMontantChange} required min="0"
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:13,boxSizing:'border-box'}} />
            </div>
            <div>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>
                Solde restant <span style={{fontSize:10,color:'#16a34a',fontWeight:700}}>⚡ calculé</span>
              </label>
              <div style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontSize:14,fontWeight:800,
                color:(form.solde||0)>0?'#dc2626':'#16a34a',background:(form.solde||0)>0?'#fef2f2':'#f0fdf4'}}>
                {fcfa(form.solde||0)}
              </div>
            </div>
            {isClients ? (
              <Sel label="Mode de paiement" name="mode_paiement" value={form.mode_paiement||'espèce'} onChange={set}
                options={['espèce','virement','mobile_money','chèque','autre'].map(m=>({value:m,label:m.charAt(0).toUpperCase()+m.slice(1)}))} />
            ) : (
              <Sel label="Compte de règlement *" name="mode_paiement" value={form.mode_paiement||'caisse'} onChange={set}
                options={COMPTE_OPTIONS} />
            )}
            <Input label="Référence de paiement" name="reference_paiement" value={form.reference_paiement||''} onChange={set} />
            <Span2><Input label="Notes" name="notes" value={form.notes||''} onChange={set} /></Span2>
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}



// ── JOURNAL CAISSE / BANQUE ───────────────────────────────────────────────────
function JournalPage({ table, title, icon, journalType='caisse', companies, companyId, toast, readOnly=false }) {
  const isBanque = journalType==='banque'
  const isMobile = journalType==='mobile'

  const [items,    setItems]   = useState([])
  const [modal,    setModal]   = useState(false)
  const [editItem, setEditItem]= useState(null)
  const [form,     setForm]    = useState({})
  const [saving,   setSaving]  = useState(false)
  const [dateFrom, setDateFrom]= useState('')
  const [dateTo,   setDateTo]  = useState('')
  const [filterType, setFilter]= useState('')

  const load = useCallback(async()=>{
    const { data:ad } = await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from(table).select('*,compta_companies(raison_sociale)').order('date_operation',{ascending:true})
    // Super admin : filtre uniquement par company_id (RLS désactivé sur ces tables)
    if (isAdmin && companyId) q = q.eq('company_id', companyId)
    else if (companyId) q = q.eq('user_id', uid).eq('company_id', companyId)
    else q = q.eq('user_id', uid)
    if (dateFrom) q = q.gte('date_operation', dateFrom)
    if (dateTo)   q = q.lte('date_operation', dateTo)
    if (filterType) q = q.eq('type_operation', filterType)
    const { data } = await q; setItems(data||[])
  }, [table, companyId, dateFrom, dateTo, filterType])

  useEffect(()=>{ load() },[load])

  const totalEntrees = items.filter(i=>i.type_operation==='entree').reduce((s,i)=>s+(i.montant||0),0)
  const totalSorties = items.filter(i=>i.type_operation==='sortie').reduce((s,i)=>s+(i.montant||0),0)
  const solde        = totalEntrees - totalSorties

  const itemsAvecSolde = items.reduce((acc, it) => {
    const prev = acc.length > 0 ? acc[acc.length-1].soldeCum : 0
    const delta = it.type_operation==='entree' ? (it.montant||0) : -(it.montant||0)
    return [...acc, { ...it, soldeCum: prev + delta }]
  }, [])

  const set = e => setForm(f=>({...f,[e.target.name]:e.target.value}))
  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''

  const openAdd = () => {
    setEditItem(null)
    setForm({ company_id:companyId||companies[0]?.id||'', date_operation:today(), numero_piece:'', libelle:'', tiers:'', type_operation:'entree', montant:0, mode_operation:'', operateur:'', numero_mobile:'', reference:'', notes:'' })
    setModal(true)
  }
  const openEdit = it => { setEditItem(it); setForm({...it}); setModal(true) }
  const close = () => { setModal(false); setEditItem(null) }

  const save = async e => {
    e.preventDefault(); setSaving(true)
    const { data:ad } = await supabase.auth.getUser(); const uid=ad?.user?.id
    let cid = form.company_id || companyId || companies[0]?.id
    if (!cid) cid = await getEffectiveCompanyId(companyId, companies)
    if (!cid) { toast.error('Veuillez sélectionner une société.'); setSaving(false); return }
    const pay = {
      company_id: cid, date_operation:form.date_operation,
      numero_piece:form.numero_piece, libelle:form.libelle, tiers:form.tiers,
      type_operation:form.type_operation, montant:+form.montant,
      ...(!isMobile ? {mode_operation:form.mode_operation} : {}),
      reference:form.reference, notes:form.notes,
      ...(isMobile ? {operateur:form.operateur, numero_mobile:form.numero_mobile} : {}),
    }
    const { error } = editItem
      ? await supabase.from(table).update(pay).eq('id', editItem.id)
      : await supabase.from(table).insert({...pay, user_id:uid})
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editItem ? 'Ligne mise à jour !' : 'Opération enregistrée !'); close(); load()
  }

  const del = async id => {
    if (!confirm('Supprimer cette ligne ?')) return
    await supabase.from(table).delete().eq('id', id)
    toast.success('Supprimé.'); load()
  }

  const printPDF = () => {
    const headers = [
      {label:'Date'}, {label:'N° Pièce'}, {label:'Libellé'}, {label:'Tiers'},
      ...(isBanque ? [{label:'Mode'}] : []),
      ...(isMobile ? [{label:'Opérateur'}, {label:'N° Mobile'}] : []),
      {label:'Réf.'}, {label:'Entrée (FCFA)', r:true}, {label:'Sortie (FCFA)', r:true}, {label:'Solde cum.', r:true},
    ]
    const rows = itemsAvecSolde.map(it => [
      it.date_operation||'—', it.numero_piece||'—', it.libelle||'—', it.tiers||'—',
      ...(isBanque ? [it.mode_operation||'—'] : []),
      ...(isMobile ? [it.operateur||'—', it.numero_mobile||'—'] : []),
      it.reference||'—',
      it.type_operation==='entree' ? Math.round(it.montant||0).toLocaleString('fr-FR') : '—',
      it.type_operation==='sortie' ? Math.round(it.montant||0).toLocaleString('fr-FR') : '—',
      Math.round(it.soldeCum||0).toLocaleString('fr-FR'),
    ])
    printFilteredList({
      title, companyName, headers, rows, dateFrom, dateTo,
      totals:[
        {label:'Total Entrées', value: Math.round(totalEntrees).toLocaleString('fr-FR')+' FCFA'},
        {label:'Total Sorties', value: Math.round(totalSorties).toLocaleString('fr-FR')+' FCFA'},
        {label:'Solde final',   value: Math.round(solde).toLocaleString('fr-FR')+' FCFA'},
      ]
    })
  }

  const exportExcel = () => {
    const period = dateFrom||dateTo ? `_${dateFrom||'debut'}_${dateTo||'fin'}` : ''
    const extraCols = isBanque ? ['Mode'] : isMobile ? ['Opérateur','N° Mobile'] : []
    const allHeaders = ['Date','N° Pièce','Libellé','Tiers',...extraCols,'Référence','Entrée (FCFA)','Sortie (FCFA)','Solde cumulatif (FCFA)','Notes']
    const thead = allHeaders.map(h=>`<th style="background:#0f2044;color:white;padding:6px 10px;white-space:nowrap;text-align:${h.includes('FCFA')?'right':'left'}">${h}</th>`).join('')
    const tbody = itemsAvecSolde.map((it,i)=>{
      const extras = isBanque ? [`<td>${it.mode_operation||'—'}</td>`]
        : isMobile ? [`<td>${it.operateur||'—'}</td>`,`<td>${it.numero_mobile||'—'}</td>`] : []
      return `<tr style="background:${i%2===0?'#f8fafc':'white'}">
        <td>${it.date_operation||'—'}</td>
        <td>${it.numero_piece||'—'}</td>
        <td>${it.libelle||'—'}</td>
        <td>${it.tiers||'—'}</td>
        ${extras.join('')}
        <td>${it.reference||'—'}</td>
        <td style="text-align:right">${it.type_operation==='entree'?Math.round(it.montant||0).toLocaleString('fr-FR'):''}</td>
        <td style="text-align:right">${it.type_operation==='sortie'?Math.round(it.montant||0).toLocaleString('fr-FR'):''}</td>
        <td style="text-align:right;font-weight:bold;color:${it.soldeCum>=0?'#16a34a':'#dc2626'}">${Math.round(it.soldeCum||0).toLocaleString('fr-FR')}</td>
        <td>${it.notes||'—'}</td>
      </tr>`
    }).join('')
    const totalsRow = `<tr style="background:#0f2044;color:white;font-weight:bold">
      <td colspan="${4+extraCols.length+1}" style="padding:6px 10px">TOTAUX (${items.length} ligne${items.length>1?'s':''})</td>
      <td style="text-align:right;padding:6px 10px;color:#4ade80">${Math.round(totalEntrees).toLocaleString('fr-FR')}</td>
      <td style="text-align:right;padding:6px 10px;color:#f87171">${Math.round(totalSorties).toLocaleString('fr-FR')}</td>
      <td style="text-align:right;padding:6px 10px">${Math.round(solde).toLocaleString('fr-FR')}</td>
      <td></td>
    </tr>`
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"><style>
        table{border-collapse:collapse;width:100%} th,td{border:1px solid #d1d5db;padding:5px 8px;font-size:10pt}
        h2{font-family:Arial;color:#0f2044} p{font-family:Arial;font-size:9pt;color:#555}
      </style></head><body>
      <h2>${title}</h2>
      <p>${companyName}${dateFrom||dateTo?` — Période : ${dateFrom||'—'} → ${dateTo||'—'}`:' — Toutes dates'} — ${items.length} opération(s) — Exporté le ${new Date().toLocaleDateString('fr-FR')}</p>
      <table><thead><tr>${thead}</tr></thead><tbody>${tbody}${totalsRow}</tbody></table>
      </body></html>`
    const blob = new Blob(['\uFEFF'+html], {type:'application/vnd.ms-excel;charset=utf-8'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download=`${title.toLowerCase().replace(/\s/g,'_')}${period}.xls`; a.click(); URL.revokeObjectURL(url)
  }

  const modeOptions = isBanque
    ? ['virement_entrant','virement_sortant','chèque_reçu','chèque_émis','prélèvement','carte','autre']
    : isMobile ? ['MTN_Money','Moov_Money','Celtis_Cash','Wave','autre']
    : ['espèces','autre']

  const operateurs = ['MTN Money','Moov Money','Celtis Cash','Wave','Orange Money','autre']

  return (
    <div>
      <PageHeader title={title} subtitle={`${items.length} opération(s)`}
        actions={<>
          <Btn sm variant="success" onClick={exportExcel}>📊 Excel</Btn>
          <Btn sm variant="danger" onClick={printPDF}>🖨️ PDF</Btn>
          {!readOnly && <Btn onClick={openAdd}>+ Nouvelle Opération</Btn>}
        </>} />

      {/* KPI */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[
          {label:'Total Entrées', val:fcfa(totalEntrees), c:'#16a34a', bg:'#dcfce7', icon:'⬇️'},
          {label:'Total Sorties', val:fcfa(totalSorties), c:'#dc2626', bg:'#fee2e2', icon:'⬆️'},
          {label:'Solde',         val:fcfa(solde), c:solde>=0?'#2563eb':'#dc2626', bg:solde>=0?'#dbeafe':'#fee2e2', icon:'⚖️'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'14px 18px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <span style={{fontSize:20}}>{k.icon}</span>
              <span style={{fontSize:11,color:'#64748b',fontWeight:600}}>{k.label}</span>
            </div>
            <div style={{fontSize:20,fontWeight:800,color:k.c}}>{k.val}</div>
          </Card>
        ))}
      </div>

      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <Card style={{marginBottom:16,padding:'10px 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontSize:12.5,fontWeight:700,color:'#374151'}}>🔍 Filtrer :</span>
          <select value={filterType} onChange={e=>setFilter(e.target.value)}
            style={{padding:'6px 12px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12.5,background:'white'}}>
            <option value=''>Toutes opérations</option>
            <option value='entree'>Entrées uniquement</option>
            <option value='sortie'>Sorties uniquement</option>
          </select>
          <span style={{fontSize:11,color:'#94a3b8',marginLeft:'auto'}}>{items.length} ligne(s)</span>
        </div>
      </Card>

      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
            <div style={{fontSize:40,marginBottom:8}}>{icon}</div>
            <p>Aucune opération enregistrée</p>
            {!readOnly && <Btn onClick={openAdd}>+ Enregistrer une opération</Btn>}
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5,minWidth:600}}>
            <thead><tr>
              <TH>Date</TH><TH>N° Pièce</TH><TH>Libellé</TH><TH>Tiers</TH>
              {isBanque && <TH>Mode</TH>}
              {isMobile && <><TH>Opérateur</TH><TH>N° Mobile</TH></>}
              <TH>Réf.</TH>
              <TH right><span style={{color:'#16a34a'}}>Entrée (FCFA)</span></TH>
              <TH right><span style={{color:'#dc2626'}}>Sortie (FCFA)</span></TH>
              <TH right>Solde cum.</TH>
              {!readOnly && <TH>Actions</TH>}
            </tr></thead>
            <tbody>
              {itemsAvecSolde.map(it=>(
                <TR key={it.id}>
                  <TD sm>{it.date_operation}</TD>
                  <TD sm>{it.numero_piece||'—'}</TD>
                  <TD bold>{it.libelle}</TD>
                  <TD sm>{it.tiers||'—'}</TD>
                  {isBanque && <TD sm>{it.mode_operation||'—'}</TD>}
                  {isMobile && <><TD sm>{it.operateur||'—'}</TD><TD sm>{it.numero_mobile||'—'}</TD></>}
                  <TD sm>{it.reference||'—'}</TD>
                  <TD right color="#16a34a" bold>{it.type_operation==='entree'?Math.round(it.montant||0).toLocaleString('fr-FR'):''}</TD>
                  <TD right color="#dc2626" bold>{it.type_operation==='sortie'?Math.round(it.montant||0).toLocaleString('fr-FR'):''}</TD>
                  <TD right bold color={it.soldeCum>=0?'#2563eb':'#dc2626'}>{Math.round(it.soldeCum||0).toLocaleString('fr-FR')}</TD>
                  {!readOnly && (
                    <TD><div style={{display:'flex',gap:4}}>
                      <Btn sm variant="secondary" onClick={()=>openEdit(it)}>✏️</Btn>
                      <Btn sm variant="danger" onClick={()=>del(it.id)}>🗑️</Btn>
                    </div></TD>
                  )}
                </TR>
              ))}
              <tr style={{background:'#f8fafc',fontWeight:700,fontSize:12}}>
                <td colSpan={4+(isBanque?1:0)+(isMobile?2:0)+1} style={{padding:'8px 10px',color:'#64748b',fontStyle:'italic'}}>
                  Totaux ({items.length} ligne{items.length>1?'s':''})
                </td>
                <td style={{padding:'8px 10px',textAlign:'right',color:'#16a34a'}}>{Math.round(totalEntrees).toLocaleString('fr-FR')}</td>
                <td style={{padding:'8px 10px',textAlign:'right',color:'#dc2626'}}>{Math.round(totalSorties).toLocaleString('fr-FR')}</td>
                <td style={{padding:'8px 10px',textAlign:'right',color:solde>=0?'#2563eb':'#dc2626'}}>{Math.round(solde).toLocaleString('fr-FR')}</td>
                {!readOnly && <td/>}
              </tr>
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={close} title={editItem?'Modifier l\'opération':'Nouvelle Opération'} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="Date *" name="date_operation" type="date" value={form.date_operation||''} onChange={set} required />
            <Input label="N° Pièce" name="numero_piece" value={form.numero_piece||''} onChange={set} placeholder="ex: PC-001" />
            <Span2><Input label="Libellé *" name="libelle" value={form.libelle||''} onChange={set} required placeholder="Description de l'opération" /></Span2>
            <Input label="Tiers" name="tiers" value={form.tiers||''} onChange={set} />
            <Sel label="Type d'opération *" name="type_operation" value={form.type_operation||'entree'} onChange={set}
              options={[{value:'entree',label:'⬇️ Entrée (Recette)'},{value:'sortie',label:'⬆️ Sortie (Dépense)'}]} required />
            <Input label="Montant (FCFA) *" name="montant" type="number" value={form.montant||0} onChange={set} required min="0" />
            {(isBanque||isMobile) && (
              <Sel label={isMobile?'Opérateur Mobile Money':'Mode d\'opération'} name={isMobile?'operateur':'mode_operation'} value={isMobile?(form.operateur||''):(form.mode_operation||'')} onChange={set}
                options={[{value:'',label:'— Choisir —'},...(isMobile?operateurs:modeOptions).map(m=>({value:m,label:m.replace(/_/g,' ')}))]} />
            )}
            {isMobile && <Input label="N° Mobile" name="numero_mobile" value={form.numero_mobile||''} onChange={set} placeholder="ex: 97000000" />}
            {!isMobile && <Input label={isBanque?'Réf. virement/chèque':'N° Reçu'} name="reference" value={form.reference||''} onChange={set} />}
            {isMobile && <Input label="Référence / ID transaction" name="reference" value={form.reference||''} onChange={set} placeholder="ID transaction" />}
            <Span2><Input label="Notes" name="notes" value={form.notes||''} onChange={set} /></Span2>
          </Grid>
          <Row>
            <Btn variant="secondary" onClick={close}>Annuler</Btn>
            <Btn type="submit" disabled={saving}>{saving?'...':(editItem?'Modifier':'Enregistrer')}</Btn>
          </Row>
        </form>
      </Modal>
    </div>
  )
}


// ── PAIEMENTS ÉTUVAGE ─────────────────────────────────────────────────────────
function PaiementsEtuvagePage({ companies, companyId, lots, toast, readOnly=false }) {
  const [items,     setItems]   = useState([])
  const [modal,     setModal]   = useState(false)
  const [form,      setForm]    = useState({})
  const [saving,    setSaving]  = useState(false)
  const [localLots, setLocalLots] = useState([])
  const [viewItem,  setViewItem]  = useState(null)

  useEffect(()=>{
    const fetchLots = async () => {
      const { data:ad } = await supabase.auth.getUser()
      const uid=ad?.user?.id; if (!uid) return
      const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
      let q = supabase.from('compta_etuvage').select('id,numero_lot,etuveuse_cooperative').order('created_at',{ascending:false})
      if (isAdmin && companyId) q=q.eq('company_id',companyId)
      else if (companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
      else q=q.eq('user_id',uid)
      const { data }=await q; setLocalLots(data||[])
    }
    fetchLots()
  },[companyId])

  const load = useCallback(async()=>{
    const { data:adage } = await supabase.auth.getUser(); const uidage=adage?.user?.id; const isAdmage=adage?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_paiements_etuvage').select('*,compta_companies(raison_sociale)').order('created_at',{ascending:false})
    q = isAdmage&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uidage); if(companyId&&!isAdmage) q=q.eq('company_id',companyId)
    const { data } = await q; setItems(data||[])
  },[companyId])

  useEffect(()=>{ load() },[load])

  const tb = items.reduce((s,r)=>s+(r.montant_brut||0),0)
  const tn = items.reduce((s,r)=>s+(r.net_a_payer||0),0)
  const ta = items.reduce((s,r)=>s+(r.retenue_aib||0),0)

  const calcAib = (brut,taux)=>{ const b=parseFloat(brut)||0,t=parseFloat(taux)||0.03; const ret=Math.round(b*t); return { ret, net:Math.round(b-ret) } }

  const set = e => {
    const { name, value } = e.target
    setForm(f => {
      const nf = {...f, [name]: value}
      if (name==='lot_id' && value) {
        const fiche = localLots.find(l=>l.id===value)
        if (fiche) { nf.numero_lot = fiche.numero_lot||''; nf.etuveuse_cooperative = fiche.etuveuse_cooperative||'' }
      }
      const qte = parseFloat(name==='qte_etuvee_kg'?value:nf.qte_etuvee_kg)||0
      const prix = parseFloat(name==='prix_unitaire'?value:nf.prix_unitaire)||0
      if (name==='qte_etuvee_kg'||name==='prix_unitaire') nf.montant_brut = Math.round(qte*prix)
      return nf
    })
  }

  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',lot_id:'',date_paiement:today(),numero_lot:'',etuveuse_cooperative:'',qte_etuvee_kg:0,prix_unitaire:0,montant_brut:0,taux_aib:'0.03',statut_paiement:'en_attente',mode_paiement:'caisse',reference_paiement:''}); setModal(true) }
  const close = ()=>setModal(false)

  const deleteEtuvage = async (id) => {
    if (!window.confirm('Supprimer ce paiement ?')) return
    const { error } = await supabase.from('compta_paiements_etuvage').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    await supprimerSortiesJournal('paiement_etuvage', id)
    toast.success('Paiement supprimé !'); load()
  }

  const save = async e=>{
    e.preventDefault()
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const compte = form.mode_paiement
    if (!JOURNAL_TABLE[compte]) { toast.error('Veuillez choisir un compte de règlement.'); return }
    const { ret, net } = calcAib(form.montant_brut, form.taux_aib)
    if (net <= 0) { toast.error('Le net à payer doit être supérieur à 0.'); return }
    const cid = form.company_id||companyId||companies[0]?.id
    setSaving(true)
    const soldeCompte = await getSoldeCompte(compte, cid)
    if (net > soldeCompte) {
      setSaving(false)
      toast.error(`Vous ne pouvez pas régler par ce compte : solde insuffisant (${JOURNAL_LABEL[compte]} : ${fcfa(soldeCompte)}).`)
      return
    }
    const year = new Date().getFullYear()
    const { count } = await supabase.from('compta_paiements_etuvage').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero = `PE-${year}-${String((count||0)+1).padStart(4,'0')}`
    const { data:ins, error } = await supabase.from('compta_paiements_etuvage').insert({
      company_id:cid, user_id:uid, numero,
      date_paiement:form.date_paiement,
      numero_lot:form.numero_lot, etuveuse_cooperative:form.etuveuse_cooperative,
      qte_etuvee_kg:+form.qte_etuvee_kg, prix_unitaire:+form.prix_unitaire,
      montant_brut:+form.montant_brut, taux_aib:+form.taux_aib,
      retenue_aib:ret, net_a_payer:net,
      statut_paiement:form.statut_paiement, mode_paiement:compte,
      reference_paiement:form.reference_paiement,
    }).select('id').single()
    if (error) { setSaving(false); toast.error(error.message); return }
    const { error:errJ } = await creerSortieJournal({
      compte, cid, uid, date:form.date_paiement, montant:net,
      libelle:`Paiement étuvage ${numero} — ${form.etuveuse_cooperative||''}${form.numero_lot?(' (lot '+form.numero_lot+')'):''}`.trim(),
      tiers:form.etuveuse_cooperative, reference:form.reference_paiement,
      sourceType:'paiement_etuvage', sourceId:ins.id,
    })
    setSaving(false)
    if (errJ) toast.error('Paiement enregistré, mais erreur sur le journal : '+errJ.message)
    else toast.success(`Paiement ${numero} enregistré — sortie ${JOURNAL_LABEL[compte]} : ${fcfa(net)}`)
    close(); load()
  }

  const { ret:prvRet, net:prvNet } = calcAib(form.montant_brut, form.taux_aib)

  return (
    <div>
      <PageHeader title="Paiements Étuvage" subtitle={`${items.length} paiement(s)`} actions={!readOnly ? <Btn onClick={openAdd}>+ Nouveau Paiement</Btn> : null} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[{l:'Total Brut',v:fcfa(tb),c:'#ea580c'},{l:'Total Retenue AIB',v:fcfa(ta),c:'#dc2626'},{l:'Total Net à Payer',v:fcfa(tn),c:'#16a34a'}].map(s=>(
          <Card key={s.l}><div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{s.l}</div><div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div></Card>
        ))}
      </div>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>🔥 Aucun paiement étuvage</div>
        ) : (
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N°</TH><TH>Date</TH><TH>N° Lot</TH><TH>Étuveuse</TH>
              <TH right>Qté (kg)</TH><TH right>Prix U.</TH><TH right>Montant brut</TH>
              <TH right>AIB</TH><TH right>Retenue AIB</TH><TH right>Net à payer</TH>
              <TH>Mode</TH><TH>Statut</TH><TH>Action</TH>
            </tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero}</TD><TD sm>{r.date_paiement}</TD>
                  <TD sm>{r.numero_lot||'—'}</TD><TD sm>{r.etuveuse_cooperative||'—'}</TD>
                  <TD right>{(r.qte_etuvee_kg||0).toFixed(2)}</TD>
                  <TD right sm>{fcfa(r.prix_unitaire||0)}</TD>
                  <TD right>{fcfa(r.montant_brut)}</TD>
                  <TD right sm>{((r.taux_aib||0)*100).toFixed(0)}%</TD>
                  <TD right color="#dc2626">{fcfa(r.retenue_aib)}</TD>
                  <TD right color="#16a34a" bold>{fcfa(r.net_a_payer)}</TD>
                  <TD sm>{r.mode_paiement||'—'}</TD>
                  <TD><Badge type={{en_attente:'warning',paye:'success',annule:'danger'}[r.statut_paiement]||'secondary'}>{r.statut_paiement}</Badge></TD>
                  <TD>
                    <div style={{display:'flex',gap:4}}>
                      <button title="Voir" onClick={()=>setViewItem(r)} style={{background:'#0ea5e9',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>👁️</button>
                      <button title="Imprimer" onClick={()=>printPaiementEtuvage(r)} style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🖨️</button>
                      {!readOnly && <button title="Supprimer" onClick={()=>deleteEtuvage(r.id)} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🗑️</button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      {viewItem && (
        <Modal open={!!viewItem} onClose={()=>setViewItem(null)} title={'Détail Paiement — '+(viewItem.numero||'—')} size="lg">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px',fontSize:14}}>
            {[
              ['N° Paiement', viewItem.numero||'—'],
              ['Date', viewItem.date_paiement||'—'],
              ['N° Lot', viewItem.numero_lot||'—'],
              ['Étuveuse / Coopérative', viewItem.etuveuse_cooperative||'—'],
              ['Quantité étuvée', (viewItem.qte_etuvee_kg||0).toFixed(2)+' kg'],
              ['Prix unitaire', fcfa(viewItem.prix_unitaire)],
              ['Montant brut', fcfa(viewItem.montant_brut)],
              ['Taux AIB', ((viewItem.taux_aib||0)*100).toFixed(0)+'%'],
              ['Retenue AIB', fcfa(viewItem.retenue_aib)],
              ['Mode paiement', viewItem.mode_paiement||'—'],
              ['Référence', viewItem.reference_paiement||'—'],
              ['Statut', viewItem.statut_paiement||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:8}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{l}</div>
                <div style={{fontWeight:600,color:'#1e293b'}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:20,padding:'14px 18px',background:'#f0fdf4',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,color:'#475569',fontWeight:600}}>NET À PAYER</span>
            <span style={{fontSize:20,fontWeight:800,color:'#16a34a'}}>{fcfa(viewItem.net_a_payer)}</span>
          </div>
          <Row style={{marginTop:16}}>
            <Btn variant="danger" onClick={()=>printPaiementEtuvage(viewItem)}>🖨️ Imprimer</Btn>
            <Btn variant="secondary" onClick={()=>setViewItem(null)}>Fermer</Btn>
          </Row>
        </Modal>
      )}

      <Modal open={modal} onClose={close} title="Nouveau Paiement Étuvage" size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Input label="Date" name="date_paiement" type="date" value={form.date_paiement||''} onChange={set} />
            <Sel label="Fiche étuvage liée" name="lot_id" value={form.lot_id||''} onChange={set}
              options={[{value:'',label:'— Sélectionner une fiche —'},...localLots.map(l=>({value:l.id,label:l.numero_lot||'Sans numéro'}))]} />
            <Input label="N° Lot" name="numero_lot" value={form.numero_lot||''} onChange={set} />
            <Input label="Étuveuse / Coopérative" name="etuveuse_cooperative" value={form.etuveuse_cooperative||''} onChange={set} />
            <Input label="Quantité étuvée (kg)" name="qte_etuvee_kg" type="number" value={form.qte_etuvee_kg||0} onChange={set} min="0" step="0.001" />
            <Input label="Prix unitaire (FCFA/kg) *" name="prix_unitaire" type="number" value={form.prix_unitaire||0} onChange={set} required min="0" />
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:8,padding:'10px 14px',fontSize:12.5}}>
              <div style={{color:'#64748b',marginBottom:2}}>Montant brut calculé :</div>
              <div style={{fontSize:18,fontWeight:800,color:'#16a34a'}}>{fcfa(form.montant_brut||0)}</div>
              <div style={{fontSize:11,color:'#94a3b8'}}>{form.qte_etuvee_kg||0} kg × {fcfa(form.prix_unitaire||0)}/kg</div>
            </div>
            <Sel label="Taux AIB" name="taux_aib" value={form.taux_aib||'0.03'} onChange={set}
              options={[{value:'0.03',label:'3% (Prestataire inscrit)'},{value:'0.05',label:'5% (Prestataire non inscrit)'}]} />
            <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',fontSize:12.5,gridColumn:'span 2'}}>
              <div style={{display:'flex',gap:32}}>
                <div>Retenue AIB : <strong style={{color:'#dc2626',fontSize:15}}>{fcfa(prvRet)}</strong></div>
                <div>Net à payer : <strong style={{color:'#16a34a',fontSize:15}}>{fcfa(prvNet)}</strong></div>
              </div>
            </div>
            <Sel label="Statut paiement" name="statut_paiement" value={form.statut_paiement||'en_attente'} onChange={set}
              options={['en_attente','paye','annule'].map(s=>({value:s,label:s.replace('_',' ')}))} />
            <Sel label="Compte de règlement *" name="mode_paiement" value={form.mode_paiement||'caisse'} onChange={set}
              options={COMPTE_OPTIONS} />
            <Input label="Référence paiement" name="reference_paiement" value={form.reference_paiement||''} onChange={set} />
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── SUIVI LOT — traçabilité complète d'un lot ────────────────────────────────
const SUIVI_STAGES = [
  { key:'etuvage',        table:'compta_etuvage',         title:'Étuvage',         icon:'🔥', accent:'#ea580c',
    kpis:[ {f:'paddy_envoye_kg',l:'Paddy envoyé',u:'kg'}, {f:'riz_etuve_recu_kg',l:'Riz étuvé reçu',u:'kg'}, {f:'taux_rendement',l:'Rendement',u:'%',dec:1}, {f:'controle_qualite',l:'Qualité'} ] },
  { key:'decorticage',    table:'compta_decorticage',     title:'Décorticage',     icon:'⚙️',  accent:'#7c3aed',
    kpis:[ {f:'poids_avant',l:'Poids avant',u:'kg'}, {f:'poids_apres',l:'Poids après',u:'kg'}, {f:'ecart',l:'Écart',u:'kg'}, {f:'taux_humidite',l:'Humidité',u:'%',dec:1} ] },
  { key:'calibrage',      table:'compta_calibrage',       title:'Calibrage',       icon:'📐', accent:'#0891b2',
    kpis:[ {f:'poids_avant',l:'Poids avant',u:'kg'}, {f:'poids_long_grain',l:'Long grain',u:'kg'}, {f:'poids_casses',l:'Cassés',u:'kg'}, {f:'ecart',l:'Écart',u:'kg'} ] },
  { key:'tri_optique',    table:'compta_tri_optique',     title:'Tri Optique',     icon:'🔍', accent:'#16a34a',
    kpis:[ {f:'poids_avant',l:'Poids avant',u:'kg'}, {f:'poids_apres_tri',l:'Après tri',u:'kg'}, {f:'taux_rouge',l:'Taux rouge',u:'%',dec:1}, {f:'taux_impurete',l:'Impureté',u:'%',dec:1} ] },
  { key:'conditionnement',table:'compta_conditionnement', title:'Conditionnement', icon:'🎁', accent:'#ca8a04',
    kpis:[ {f:'poids_recu',l:'Poids reçu',u:'kg'}, {f:'nb_sac_25kg',l:'Sacs 25 kg',u:''}, {f:'nb_sac_50kg',l:'Sacs 50 kg',u:''}, {f:'poids_total_conditionne',l:'Total conditionné',u:'kg'} ] },
]

function SuiviLotPage({ companies, companyId, toast }) {
  const [allLots,     setAllLots]    = useState([])
  const [selectedLot, setSelectedLot]= useState(null)
  const [stageData,   setStageData]  = useState({})
  const [loading,     setLoading]    = useState(false)

  // Charger tous les lots
  useEffect(()=>{
    const fetchLots = async () => {
      const { data:ad } = await supabase.auth.getUser()
      const uid=ad?.user?.id; if (!uid) return
      const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
      let q = supabase.from('compta_lots_production').select('*').order('created_at',{ascending:false})
      if (isAdmin && companyId) q=q.eq('company_id',companyId)
      else if (companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
      else q=q.eq('user_id',uid)
      const { data }=await q; setAllLots(data||[])
    }
    fetchLots()
  },[companyId])

  // Charger toutes les étapes pour le lot sélectionné
  const loadSuivi = async (lot) => {
    setSelectedLot(lot); setLoading(true)
    const { data:ad } = await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    const results = {}
    await Promise.all(SUIVI_STAGES.map(async s => {
      let q = supabase.from(s.table).select('*').eq('lot_id', lot.id).order('created_at',{ascending:false})
      if (!isAdmin) q=q.eq('user_id',uid)
      const { data } = await q; results[s.key] = data||[]
    }))
    setStageData(results); setLoading(false)
  }

  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''
  const stagesComplete = SUIVI_STAGES.filter(s=>(stageData[s.key]||[]).length>0).length

  const printSuivi = () => {
    if (!selectedLot) return
    const stagesHtml = SUIVI_STAGES.map(s => {
      const rows = stageData[s.key]||[]
      if (rows.length===0) return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:14px;opacity:.5">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:20px">${s.icon}</span>
            <span style="font-weight:700;color:${s.accent};font-size:12pt">${s.title}</span>
            <span style="background:#f1f5f9;color:#94a3b8;padding:2px 10px;border-radius:12px;font-size:9pt;margin-left:auto">Non traité</span>
          </div>
        </div>`
      return `
        <div style="border:2px solid ${s.accent};border-radius:8px;padding:14px 18px;margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:20px">${s.icon}</span>
            <span style="font-weight:700;color:${s.accent};font-size:12pt">${s.title}</span>
            <span style="background:${s.accent};color:white;padding:2px 10px;border-radius:12px;font-size:9pt;margin-left:auto">${rows.length} enregistrement(s)</span>
          </div>
          ${rows.map(r => `
            <div style="background:#f8fafc;border-radius:6px;padding:10px 14px;margin-bottom:8px;font-size:9.5pt">
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
                <div><span style="color:#64748b">Date : </span><strong>${r.date_etape||r.date_reception||'—'}</strong></div>
                ${s.kpis.map(k=>`<div><span style="color:#64748b">${k.l} : </span><strong>${r[k.f]!==undefined&&r[k.f]!==''?((k.dec?(+(r[k.f]||0)).toFixed(k.dec):(+(r[k.f]||0)).toFixed(2)))+(k.u?' '+k.u:''):r[k.f]||'—'}</strong></div>`).join('')}
                <div><span style="color:#64748b">Responsable : </span><strong>${r.responsable_section||'—'}</strong></div>
              </div>
              ${r.observation||r.observations?`<div style="margin-top:6px;color:#555;font-style:italic;font-size:9pt">📝 ${r.observation||r.observations}</div>`:''}
            </div>`).join('')}
        </div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Suivi Lot — ${selectedLot.numero_lot}</title>
      <style>${CSS_PRINT}
        body{font-size:10pt} h1{font-size:15pt;color:#0f2044;margin-bottom:4px}
        .lot-info{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0 16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
        .lot-info div{font-size:9.5pt} .lot-info strong{display:block;font-size:11pt;color:#0f2044}
        .progress{display:flex;align-items:center;gap:6px;margin-bottom:14px;padding:8px 12px;background:#dbeafe;border-radius:8px;font-size:10pt}
      </style></head><body>
      <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
      <div class="header">
        <div>
          <div class="company-name">${companyName}</div>
          <div class="company-info">Fiche de suivi de lot de production</div>
        </div>
        <div class="doc-title">
          <h1>SUIVI DE LOT</h1>
          <div class="doc-numero">Lot : ${selectedLot.numero_lot}</div>
          <div class="doc-date">Édité le ${new Date().toLocaleDateString('fr-FR')}</div>
        </div>
      </div>
      <div class="lot-info">
        <div><span style="color:#64748b">N° Lot</span><strong>${selectedLot.numero_lot}</strong></div>
        <div><span style="color:#64748b">Date début</span><strong>${selectedLot.date_debut||'—'}</strong></div>
        <div><span style="color:#64748b">Statut</span><strong>${selectedLot.statut||'—'}</strong></div>
        <div><span style="color:#64748b">Paddy entré (kg)</span><strong>${(selectedLot.qte_paddy_entree||0).toLocaleString('fr-FR')} kg</strong></div>
      </div>
      <div class="progress">
        <strong>Avancement :</strong> ${stagesComplete} / ${SUIVI_STAGES.length} étapes complétées
        &nbsp;—&nbsp; ${SUIVI_STAGES.filter(s=>(stageData[s.key]||[]).length>0).map(s=>s.title).join(' → ')||'Aucune étape'}
      </div>
      ${stagesHtml}
    </body></html>`
    openPrintWindow(html)
  }

  return (
    <div>
      <PageHeader title="Suivi de Lot" subtitle="Traçabilité complète du processus de production"
        actions={selectedLot && <Btn variant="danger" onClick={printSuivi}>🖨️ Imprimer PDF</Btn>} />

      {/* Sélecteur de lot */}
      <Card style={{marginBottom:20,padding:'16px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <span style={{fontWeight:700,fontSize:13,color:'#374151',whiteSpace:'nowrap'}}>🔎 Sélectionner un lot :</span>
          <select value={selectedLot?.id||''} onChange={e=>{
            const lot=allLots.find(l=>l.id===e.target.value)
            if (lot) loadSuivi(lot); else { setSelectedLot(null); setStageData({}) }
          }} style={{padding:'9px 14px',borderRadius:9,border:'1.5px solid #d1d5db',fontSize:13,flex:1,minWidth:240,background:'white'}}>
            <option value=''>— Choisir un lot de production —</option>
            {allLots.map(l=><option key={l.id} value={l.id}>{l.numero_lot} — {l.statut} {l.date_debut?`(${l.date_debut})`:''}</option>)}
          </select>
          {selectedLot && (
            <span style={{background:'#dbeafe',color:'#1d4ed8',padding:'4px 14px',borderRadius:20,fontSize:12,fontWeight:600}}>
              {stagesComplete}/{SUIVI_STAGES.length} étapes
            </span>
          )}
        </div>
      </Card>

      {!selectedLot && (
        <div style={{textAlign:'center',padding:'60px 24px',color:'#94a3b8'}}>
          <div style={{fontSize:56,marginBottom:12}}>🔎</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Sélectionnez un lot pour voir son suivi</div>
          <div style={{fontSize:13}}>Toutes les étapes de traitement seront affichées ici</div>
        </div>
      )}

      {selectedLot && !loading && (
        <div>
          {/* Infos lot */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:20}}>
            {[
              {l:'N° Lot',       v:selectedLot.numero_lot,                           c:'#0f2044'},
              {l:'Date début',   v:selectedLot.date_debut||'—',                      c:'#374151'},
              {l:'Date fin',     v:selectedLot.date_fin||'En cours',                 c:selectedLot.date_fin?'#374151':'#ca8a04'},
              {l:'Paddy entré',  v:`${(selectedLot.qte_paddy_entree||0).toLocaleString('fr-FR')} kg`, c:'#ea580c'},
              {l:'Statut',       v:selectedLot.statut||'—',                          c:selectedLot.statut==='termine'?'#16a34a':selectedLot.statut==='en_cours'?'#2563eb':'#64748b'},
            ].map(k=>(
              <Card key={k.l} style={{padding:'12px 16px',borderLeft:`3px solid ${k.c}`}}>
                <div style={{fontSize:11,color:'#64748b',marginBottom:3}}>{k.l}</div>
                <div style={{fontWeight:700,fontSize:14,color:k.c}}>{k.v}</div>
              </Card>
            ))}
          </div>

          {/* Barre de progression */}
          <Card style={{marginBottom:20,padding:'14px 20px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <span style={{fontWeight:700,fontSize:13}}>Progression du traitement</span>
              <span style={{marginLeft:'auto',fontWeight:700,color:stagesComplete===5?'#16a34a':'#2563eb'}}>{stagesComplete}/{SUIVI_STAGES.length}</span>
            </div>
            <div style={{display:'flex',gap:0}}>
              {SUIVI_STAGES.map((s,i)=>{
                const done = (stageData[s.key]||[]).length>0
                return (
                  <div key={s.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <div style={{width:'100%',height:6,background:done?s.accent:'#e2e8f0',borderRadius:i===0?'6px 0 0 6px':i===4?'0 6px 6px 0':'0',transition:'background .3s'}} />
                    <div style={{fontSize:10,color:done?s.accent:'#94a3b8',fontWeight:done?700:400,textAlign:'center',marginTop:4}}>
                      <div style={{fontSize:16,marginBottom:2}}>{s.icon}</div>
                      {s.title}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Étapes détaillées */}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {SUIVI_STAGES.map((s,idx)=>{
              const rows = stageData[s.key]||[]
              const done = rows.length>0
              return (
                <div key={s.key} style={{display:'flex',gap:0}}>
                  {/* Ligne timeline */}
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginRight:16,paddingTop:4}}>
                    <div style={{width:36,height:36,borderRadius:'50%',background:done?s.accent:'#e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,transition:'background .3s'}}>
                      {done?s.icon:'○'}
                    </div>
                    {idx<SUIVI_STAGES.length-1 && <div style={{width:2,flex:1,background:done?s.accent:'#e2e8f0',marginTop:4,minHeight:20,transition:'background .3s'}} />}
                  </div>
                  {/* Contenu */}
                  <div style={{flex:1,marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:done?10:0}}>
                      <span style={{fontWeight:700,fontSize:14,color:done?s.accent:'#94a3b8'}}>{s.title}</span>
                      <span style={{background:done?s.accent:'#f1f5f9',color:done?'white':'#94a3b8',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>
                        {done?`${rows.length} enregistrement${rows.length>1?'s':''}`:'Non traité'}
                      </span>
                    </div>
                    {done && rows.map((r,ri)=>(
                      <div key={ri} style={{background:'white',border:`1px solid ${s.accent}30`,borderLeft:`3px solid ${s.accent}`,borderRadius:8,padding:'12px 16px',marginBottom:8,boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                        <div style={{fontSize:11,color:'#64748b',marginBottom:8,fontWeight:600}}>
                          📅 {r.date_etape||r.date_reception||'Date non renseignée'}
                          {r.responsable_section && <span style={{marginLeft:12}}>👤 {r.responsable_section}</span>}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8}}>
                          {s.kpis.map(k=>{
                            const val = r[k.f]
                            const display = val!==undefined&&val!=='' ? (k.dec?(+(val||0)).toFixed(k.dec):(typeof val==='number'?(+(val||0)).toFixed(2):val))+(k.u?' '+k.u:'') : '—'
                            return (
                              <div key={k.f} style={{background:`${s.accent}08`,borderRadius:6,padding:'6px 10px'}}>
                                <div style={{fontSize:10,color:'#64748b',marginBottom:1}}>{k.l}</div>
                                <div style={{fontWeight:700,fontSize:13,color:s.accent}}>{display}</div>
                              </div>
                            )
                          })}
                        </div>
                        {(r.observation||r.observations||r.recommandation) && (
                          <div style={{marginTop:8,padding:'6px 10px',background:'#fffde7',borderRadius:6,fontSize:12,color:'#78716c'}}>
                            {(r.observation||r.observations) && <span>📝 {r.observation||r.observations}</span>}
                            {r.recommandation && <span style={{marginLeft:12}}>💡 {r.recommandation}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && (
        <div style={{textAlign:'center',padding:'48px',color:'#64748b'}}>
          <div style={{fontSize:32,marginBottom:8}}>⏳</div>Chargement du suivi...
        </div>
      )}
    </div>
  )
}

// ── SUPER ADMIN DASHBOARD ─────────────────────────────────────────────────────
function SuperAdminDashboard({ companies, onSelect, toast }) {
  const [stats, setStats] = useState({})

  useEffect(()=>{
    const loadStats = async () => {
      const s = {}
      for (const c of companies) {
        const [docs, lots, prest] = await Promise.all([
          supabase.from('compta_documents').select('montant_ttc').eq('company_id',c.id),
          supabase.from('compta_lots_production').select('id').eq('company_id',c.id),
          supabase.from('compta_prestations').select('montant').eq('company_id',c.id),
        ])
        s[c.id] = {
          ca: (docs.data||[]).reduce((a,d)=>a+(d.montant_ttc||0),0),
          lots: lots.data?.length||0,
          prest: (prest.data||[]).reduce((a,p)=>a+(p.montant||0),0),
        }
      }
      setStats(s)
    }
    if (companies.length) loadStats()
  },[companies])

  const totalCA   = Object.values(stats).reduce((a,s)=>a+(s.ca||0),0)
  const totalLots = Object.values(stats).reduce((a,s)=>a+(s.lots||0),0)

  return (
    <div>
      <PageHeader title="Vue Globale — Toutes les Sociétés"
        subtitle={`${companies.length} société(s) enregistrée(s) sur la plateforme`} />

      {/* KPIs globaux */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:24}}>
        {[
          {icon:'🏢',label:'Sociétés actives',val:companies.length,color:'#2563eb'},
          {icon:'💰',label:'CA total (toutes sociétés)',val:fcfa(totalCA),color:'#16a34a'},
          {icon:'📦',label:'Lots de production',val:totalLots,color:'#ea580c'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'18px 20px'}}>
            <div style={{fontSize:28,marginBottom:6}}>{k.icon}</div>
            <div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{k.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:k.color}}>{k.val}</div>
          </Card>
        ))}
      </div>

      {/* Liste des sociétés */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>
        {companies.map(c=>{
          const s = stats[c.id]||{}
          return (
            <div key={c.id} style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden',
              boxShadow:'0 1px 3px rgba(0,0,0,.06)',cursor:'pointer',transition:'all .2s'}}
              onClick={()=>onSelect(c)}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 8px 24px rgba(37,99,235,.15)';e.currentTarget.style.borderColor='#2563eb'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,.06)';e.currentTarget.style.borderColor='#e2e8f0'}}>
              <div style={{padding:'16px 20px',background:'linear-gradient(135deg,#0f2044,#1e3a6e)',color:'white'}}>
                <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{c.raison_sociale}</div>
                <div style={{fontSize:11,opacity:.7}}>{c.rccm||'RCCM non renseigné'}</div>
              </div>
              <div style={{padding:'14px 20px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                  <div style={{textAlign:'center',background:'#f8fafc',borderRadius:8,padding:'8px 4px'}}>
                    <div style={{fontSize:11,color:'#64748b'}}>CA Documents</div>
                    <div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fcfa(s.ca||0)}</div>
                  </div>
                  <div style={{textAlign:'center',background:'#f8fafc',borderRadius:8,padding:'8px 4px'}}>
                    <div style={{fontSize:11,color:'#64748b'}}>Lots production</div>
                    <div style={{fontSize:14,fontWeight:700,color:'#ea580c'}}>{s.lots||0}</div>
                  </div>
                </div>
                <button style={{width:'100%',padding:'9px',background:'#2563eb',color:'white',border:'none',
                  borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  👁️ Consulter les données →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function ComptaPro() {
  const [user,      setUser]      = useState(null)
  const [profile,   setProfile]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState('dashboard')
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [lots,      setLots]      = useState([])
  const [docId,     setDocId]     = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [adminViewCompany, setAdminViewCompany] = useState(null)
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false)
  const [theme, setTheme] = useState(getStoredTheme())
  useEffect(()=>{ applyTheme(theme) },[theme])
  const toggleTheme = () => { const next = theme==='dark'?'light':'dark'; setTheme(next); setStoredTheme(next) }
  const toast = useToast()
  const { isMobile, isTablet, isLandscape, isMobileLandscape } = useResponsive()
  // En paysage mobile : sidebar visible mais compacte, contenu plein écran
  const collapsed = isMobile || isMobileLandscape  // sidebar overlay en portrait ET paysage mobile

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL || profile?.role === 'super_admin'
  const isAdminSociete = profile?.role === 'admin_societe' || profile?.role === 'admin'
  const isUtilisateurSimple = profile?.role === 'utilisateur_simple'

  // Auth + Profile
  useEffect(()=>{
    const loadProfile = async (u) => {
      if (!u) { setProfile(null); setLoading(false); return }
      const { data } = await supabase.from('compta_profiles').select('*').eq('id', u.id).single()
      setProfile(data || null)
      setLoading(false)
    }
    // Détecter immédiatement un token recovery dans l'URL
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace('#',''))
    const tokenType = params.get('type')
    if (tokenType === 'recovery') {
      // Extraire le token et établir la session
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (accessToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken||'' })
          .then(({ data }) => {
            setUser(data?.user ?? null)
            setNeedsPasswordChange(true)
            setLoading(false)
            // Nettoyer l'URL
            window.history.replaceState(null, '', window.location.pathname)
          })
        return
      }
    }

    supabase.auth.getSession().then(({data:{session}})=>{
      // Vérifier si c'est un recovery depuis sessionStorage
      const isRecovery = sessionStorage.getItem('sb_recovery') === '1'
      if (isRecovery && session?.user) {
        sessionStorage.removeItem('sb_recovery')
        setUser(session.user)
        setNeedsPasswordChange(true)
        setLoading(false)
        return
      }
      setUser(session?.user??null)
      loadProfile(session?.user??null)
    })
    const { data:{subscription} } = supabase.auth.onAuthStateChange((event, session)=>{
      if (event === 'PASSWORD_RECOVERY') {
        // Forcer l'utilisateur à définir un nouveau mot de passe
        setUser(session?.user??null)
        setNeedsPasswordChange(true)
        return
      }
      setUser(session?.user??null)
      loadProfile(session?.user??null)
      // Enregistrer l'heure de connexion
      if (session?.user?.id) {
        supabase.from('compta_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then(()=>{})
      }
    })
    return ()=>subscription.unsubscribe()
  },[])

  // Load companies — super admin voit toutes, admin_societe voit la sienne, utilisateur_simple via son profil
  const loadCompanies = useCallback(async()=>{
    const { data:authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id
    if (!uid) return
    const isAdmin = authData?.user?.email === SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_companies').select('*').order('raison_sociale')
    if (!isAdmin) {
      // Récupérer le profil pour savoir si utilisateur_simple
      const { data:prof } = await supabase.from('compta_profiles').select('role,company_id').eq('id',uid).single()
      if (prof?.role === 'utilisateur_simple' && prof?.company_id) {
        // Charger uniquement la société rattachée au profil
        q = q.eq('id', prof.company_id)
      } else {
        q = q.eq('user_id', uid)
      }
    }
    const { data } = await q
    setCompanies(data||[])
    if (!companyId && data?.length>0) setCompanyId(data[0].id)
  },[companyId])

  // Load lots
  const loadLots = useCallback(async()=>{
    const { data:authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id
    if (!uid) return
    const isAdmin = authData?.user?.email === SUPER_ADMIN_EMAIL
    // Utiliser la société effectivement consultée (adminViewCompany si super admin)
    const effectiveCid = (isAdmin && adminViewCompany) ? adminViewCompany.id : companyId
    let q = supabase.from('compta_lots_production').select('*').order('created_at',{ascending:false})
    if (effectiveCid) q = q.eq('company_id', effectiveCid)
    else q = q.eq('user_id', uid)
    const { data } = await q; setLots(data||[])
  },[companyId, adminViewCompany])

  useEffect(()=>{ if(user){ loadCompanies(); loadLots() } },[user,loadCompanies,loadLots])

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f1f5f9'}}>
      <div style={{textAlign:'center',color:'#64748b'}}>
        <div style={{fontSize:40,marginBottom:12}}>📊</div>
        <div style={{fontWeight:600}}>Chargement Compta Pro…</div>
      </div>
    </div>
  )
  if (!user) return <LoginPage onLogin={setUser} />

  // Écran de changement de mot de passe après réinitialisation
  if (needsPasswordChange) return <PasswordChangePage onDone={async(newPwd)=>{
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) return error.message
    setNeedsPasswordChange(false)
    loadProfile(user)
    return null
  }} />
  if (profile?.statut === 'pending') return <PendingPage onLogout={()=>{ supabase.auth.signOut(); setUser(null); setProfile(null) }} />
  if (profile?.statut === 'suspended') return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f1f5f9'}}>
      <div style={{background:'white',borderRadius:16,padding:'48px 40px',maxWidth:400,textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:16}}>🚫</div>
        <h2 style={{color:'#dc2626'}}>Compte suspendu</h2>
        <p style={{color:'#64748b',marginBottom:24}}>Contactez l'administrateur pour réactiver votre compte.</p>
        <button onClick={()=>{ supabase.auth.signOut(); setUser(null); setProfile(null) }}
          style={{background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontWeight:600}}>
          Se déconnecter
        </button>
      </div>
    </div>
  )

  // companyId effectif : si super admin consulte une société, utiliser son id
  const effectiveCompanyId = isSuperAdmin && adminViewCompany ? adminViewCompany.id : companyId
  // readOnly uniquement si super admin consulte la société d'un AUTRE utilisateur
  const isOwnCompany = adminViewCompany ? adminViewCompany.user_id === user?.id : true
  const readOnly = isSuperAdmin && !!adminViewCompany && !isOwnCompany
  const readOnlyAdmin = readOnly
  const isSimple = profile?.role === 'utilisateur_simple'
  const pagePerms = profile?.permissions || {}
  const getReadOnly = (pid) => readOnly || (isSimple && pagePerms[pid] === 'read')

  const sp = { companies, companyId: effectiveCompanyId, toast, readOnly, profile, userPermissions:profile?.permissions||{} }

  // Production stages config
  const STAGES = {
    etuvage: { title:'Étuvage', accent:'#ea580c', fields:[
      {name:'numero_lot',    label:'N° Lot (libre)'},
      {name:'etuveuse_cooperative', label:'Étuveuse / Coopérative', summary:true},
      {name:'paddy_envoye_kg',  label:'Paddy envoyé (kg)',   type:'number', summary:true, unit:'kg'},
      {name:'riz_etuve_recu_kg',label:'Riz étuvé reçu (kg)', type:'number', summary:true, unit:'kg'},
      {name:'ecart_kg',         label:'Écart (kg)',           type:'number', unit:'kg', calc:true},
      {name:'taux_rendement',   label:'Rendement (%)',        type:'number', summary:true, dec:1, calc:true},
      {name:'controle_qualite', label:'Contrôle qualité', type:'select', options:[{value:'conforme',label:'Conforme'},{value:'non_conforme',label:'Non conforme'},{value:'a_verifier',label:'À vérifier'}]},
      {name:'observations',     label:'Observations'},
      {name:'responsable_section',label:'Responsable'},
    ]},
    decorticage: { title:'Décorticage', accent:'#7c3aed', fields:[
      {name:'responsable_section',label:'Responsable'},
      {name:'nom_produit',  label:'Nom produit'},
      {name:'poids_avant',  label:'Poids avant (kg)',  type:'number', summary:true, unit:'kg'},
      {name:'poids_apres',  label:'Poids après (kg)',  type:'number', summary:true, unit:'kg'},
      {name:'ecart',        label:'Écart (kg)',         type:'number', summary:true, unit:'kg', calc:true},
      {name:'taux_humidite',label:'Taux humidité (%)', type:'number', summary:true, dec:1},
      {name:'observation',  label:'Observation'},
      {name:'recommandation',label:'Recommandation'},
    ]},
    calibrage: { title:'Calibrage', accent:'#0891b2', fields:[
      {name:'responsable_section',label:'Responsable'},
      {name:'nom_produit',        label:'Nom produit'},
      {name:'poids_avant',        label:'Poids avant (kg)',   type:'number', summary:true, unit:'kg'},
      {name:'poids_long_grain',   label:'Long grain (kg)',    type:'number', summary:true, unit:'kg'},
      {name:'poids_casses',       label:'Cassés (kg)',        type:'number', summary:true, unit:'kg'},
      {name:'dechets',            label:'Déchets (kg)',       type:'number', summary:true, unit:'kg'},
      {name:'ecart',              label:'Écart (kg)',         type:'number', summary:true, unit:'kg', calc:true},
      {name:'observation',        label:'Observation'},
      {name:'recommandation',     label:'Recommandation'},
    ]},
    tri_optique: { title:'Tri Optique', accent:'#16a34a', fields:[
      {name:'responsable_section', label:'Responsable'},
      {name:'nom_produit',         label:'Nom produit'},
      {name:'poids_avant',         label:'Poids avant (kg)',      type:'number', summary:true, unit:'kg'},
      {name:'poids_apres_tri',     label:'Poids après tri (kg)',  type:'number', summary:true, unit:'kg'},
      {name:'hors_normes',         label:'Hors normes (kg)',      type:'number'},
      {name:'rouge_a_polir',       label:'Rouge à polir (kg)',    type:'number'},
      {name:'ecart',               label:'Écart (kg)',            type:'number', summary:true, calc:true},
      {name:'taux_rouge',          label:'Taux rouge (%)',        type:'number'},
      {name:'taux_impurete',       label:'Taux impureté (%)',     type:'number'},
      {name:'observation',         label:'Observation'},
      {name:'recommandation',      label:'Recommandation'},
    ]},
    conditionnement: { title:'Conditionnement', accent:'#ca8a04', fields:[
      {name:'responsable_section',      label:'Responsable'},
      {name:'nom_produit',              label:'Nom produit'},
      {name:'poids_recu',               label:'Poids reçu (kg)',        type:'number', summary:true, unit:'kg'},
      {name:'nb_sac_5kg',               label:'Sacs 5 kg',              type:'number', summary:true},
      {name:'nb_sac_25kg',              label:'Sacs 25 kg',             type:'number', summary:true},
      {name:'nb_sac_50kg',              label:'Sacs 50 kg',             type:'number', summary:true},
      {name:'nb_sac_5x5kg',             label:'Sacs 5×5 kg',           type:'number'},
      {name:'poids_total_conditionne',  label:'Total conditionné (kg)', type:'number', unit:'kg', calc:true},
      {name:'reste',                    label:'Reste (kg)',             type:'number'},
      {name:'ecart',                    label:'Écart (kg)',             type:'number', calc:true},
      {name:'observation',              label:'Observation'},
      {name:'recommandation',           label:'Recommandation'},
    ]},
  }

  const PAGE_TITLES = {
    chat:'Messagerie',
    controle_budget:'Contrôle Budgétaire',
    users:'Gestion des utilisateurs',
    fournisseurs:'Fournisseurs', stock:'Articles & Stock', 'stock-entree':'Entrée de stock',
    'stock-sortie':'Sortie de stock', mouvements:'Mouvements de stock', inventaire:'Inventaire',
    commercial:'Documents commerciaux', 'commercial-view':'Détail document', lots:'Lots Production',
    etuvage:'Étuvage', decorticage:'Décorticage', calibrage:'Calibrage',
    tri_optique:'Tri Optique', conditionnement:'Conditionnement',
    etv_repertoire:'Répertoire Étuveuses', etv_avances:'Avances sur Commande',
    etv_bc:'Bons de Commande', etv_br:'Bons de Réception',
    etv_entrees:'Entrées Magasin', etv_sorties:'Sorties Magasin', etv_inventaire:'Inventaire Étuveuses', etv_tresorerie:'Trésorerie Étuveuses',
    achats:'Achats Semi-finis', lots_semi_finis:'Lots Semi-finis', epierrage:'Épierrage', reglements_clients:'Règlements Clients', reglements_fourn:'Règlements Fournisseurs', etuvage_paiements:'Paiements Étuvage',
    docs_admin:'Documents administratifs', parametres:'Paramètres',
    prestations:'Prestations', journal_caisse:'Journal Caisse', journal_banque:'Journal Banque',
    suivi_lot:'Suivi de Lot', journal_mobile:'Journal Mobile Money', plan_comptable:'Plan Comptable', grand_livre:'Grand-Livre',
  }

  const renderPage = () => {
    // Super admin — dashboard global ou vue société
    if (isSuperAdmin) {
      if (!adminViewCompany) {
        return <SuperAdminDashboard companies={companies} toast={toast}
          onSelect={c=>{ setAdminViewCompany(c); setPage('dashboard') }} />
      }
    }

    // Commercial new: page = 'commercial-new-{type}'
    if (page.startsWith('commercial-new-')) {
      const typeDoc = page.replace('commercial-new-','')
      return <CommercialNewPage {...sp} typeDoc={typeDoc} setPage={setPage} />
    }
    // Production stages
    if (STAGES[page]) {
      const s = STAGES[page]
      return <ProductionStagePage tableName={`compta_${page}`} title={s.title} accentColor={s.accent}
        {...sp} lots={lots} fields={s.fields} />
    }
    switch (page) {
      case 'dashboard':     return <Dashboard {...sp} setPage={setPage} />
      case 'companies':     return <CompaniesPage companies={companies} refresh={loadCompanies} toast={toast} isSuperAdmin={isSuperAdmin} currentUserId={user?.id} />
      case 'clients':       return <TiersPage table="compta_clients" title="Clients" titleSingle="Client" icon="👥" {...sp}
                              extraFields={{ names:[], headers:[], fields:[], defaults:{type:'physique',nom_societe:''} }} />
      case 'fournisseurs':  return <TiersPage table="compta_fournisseurs" title="Fournisseurs" titleSingle="Fournisseur" icon="🚚" {...sp}
                              extraFields={{ names:['cooperative_affiliee'], headers:['Coopérative'], fields:[], defaults:{type:'physique',nom_societe:''} }} />
      case 'stock':         return <StockPage {...sp} setPage={setPage} />
      case 'stock-entree':  return <StockEntreePage {...sp} setPage={setPage} />
      case 'stock-sortie':  return <StockSortiePage {...sp} setPage={setPage} />
      case 'mouvements':    return <MouvementsPage {...sp} setPage={setPage} />
      case 'inventaire':    return <InventairePage companies={companies} companyId={effectiveCompanyId} setCompanyId={setCompanyId} />
      case 'commercial':    return <CommercialPage {...sp} setPage={setPage} setDocId={setDocId} />
      case 'commercial-view': return <CommercialViewPage docId={docId} setPage={setPage} toast={toast} />
      case 'lots':          return <LotsProductionPage {...sp} />
      case 'suivi_lot':     return <SuiviLotPage {...sp} />
      case 'etv_repertoire':  return <EtvRepertoirePage {...sp} readOnly={getReadOnly('etv_repertoire')} />
      case 'etv_avances':     return <EtvAvancesPage {...sp} readOnly={getReadOnly('etv_avances')} />
      case 'etv_bc':          return <EtvBCPage {...sp} readOnly={getReadOnly('etv_bc')} />
      case 'etv_br':          return <EtvBRPage {...sp} readOnly={getReadOnly('etv_br')} />
      case 'etv_entrees':     return <EtvEntreesPage {...sp} readOnly={getReadOnly('etv_entrees')} />
      case 'etv_sorties':     return <EtvSortiesPage {...sp} readOnly={getReadOnly('etv_sorties')} />
      case 'etv_inventaire':  return <EtvInventairePage {...sp} />
      case 'etv_tresorerie':  return <EtvTresoreriePage {...sp} />
      case 'achats':          return <AchatsSemisPage {...sp} />
      case 'lots_semi_finis': return <LotsSemiFinisPage {...sp} />
      case 'epierrage':      return <EpierragePage {...sp} lots={lots} />
      case 'docs_admin':     return <DocsAdminPage {...sp} profile={profile} />
      case 'reglements_clients': return <ReglementsPage {...sp} mode="clients" />
      case 'reglements_fourn':    return <ReglementsPage {...sp} mode="fournisseurs" />
      case 'prestations':   return <PrestationPage {...sp} />
      case 'etuvage_paiements': return <PaiementsEtuvagePage {...sp} lots={lots} />
      case 'journal_caisse':    return <JournalPage table="compta_journal_caisse" title="Journal Caisse" icon="🏦" journalType="caisse" {...sp} />
      case 'journal_banque':    return <JournalPage table="compta_journal_banque" title="Journal Banque" icon="🏛️" journalType="banque" {...sp} />
      case 'journal_mobile':    return <JournalPage table="compta_journal_mobile" title="Journal Mobile Money" icon="📱" journalType="mobile" {...sp} />
      case 'plan_comptable':    return <PlanComptablePage {...sp} readOnly={getReadOnly('plan_comptable')} />
      case 'grand_livre':       return <GrandLivrePage {...sp} readOnly={getReadOnly('grand_livre')} />
      case 'users':          return isSuperAdmin ? <UsersManagementPage toast={toast} /> : <Dashboard {...sp} setPage={setPage} />
      case 'controle_budget': return <ControleBudgetairePage {...sp} readOnly={getReadOnly('controle_budget')} />
      case 'chat':           return <ChatPage profile={profile} toast={toast} />
      case 'parametres':     return (isSuperAdmin||profile?.role==='admin_societe'||profile?.role==='admin') ? <ParametresPage toast={toast} companies={companies} companyId={companyId} /> : <Dashboard {...sp} setPage={setPage} />
      case 'mes_utilisateurs': return (profile?.role==='admin_societe'||profile?.role==='admin'||isSuperAdmin) ? <MesUtilisateursPage toast={toast} companies={companies} companyId={companyId} profile={profile} /> : <Dashboard {...sp} setPage={setPage} />
    }
  }

  const getTitle = () => {
    if (page.startsWith('commercial-new-')) return `Nouveau ${TYPE_DOC_LABELS[page.replace('commercial-new-','')] || 'Document'}`
    if (STAGES[page]) return STAGES[page].title
    return PAGE_TITLES[page] || 'Compta Pro'
  }

  const logout = async ()=>{ await supabase.auth.signOut(); setUser(null); setProfile(null) }

  // En paysage mobile, sidebar overlay (collapsed=true) mais marginLeft=0
  const sidebarCollapsed = isMobile || isMobileLandscape

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:'#f1f5f9', color:'#1e293b', minHeight:'100vh' }}>
      <Toasts toasts={toast.toasts} />
      <Sidebar page={page} setPage={setPage} user={user} profile={profile} onLogout={logout}
        open={sidebarOpen} onClose={()=>setSidebarOpen(false)} />
      <div style={{ marginLeft:sidebarCollapsed ? 0 : 260, minHeight:'100vh', display:'flex', flexDirection:'column', transition:'margin-left 0.2s ease' }}>
        {/* Topbar */}
        <div style={{ height:60, background:'white', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', position:'sticky', top:0, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {sidebarCollapsed && (
              <button onClick={()=>setSidebarOpen(true)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, padding:'4px 6px', color:'#374151', display:'flex', alignItems:'center' }}>
                ☰
              </button>
            )}
            <div style={{ fontSize:isMobile?14:18, fontWeight:700, color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:isMobile?140:300 }}>{getTitle()}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {!isMobile && <CompanySelector companies={companies}
              companyId={isSuperAdmin && adminViewCompany ? effectiveCompanyId : companyId}
              setCompanyId={id => {
                if (isSuperAdmin && adminViewCompany) {
                  // Super admin en mode consultation : changer de société directement
                  const newC = companies.find(c => c.id === id)
                  if (newC) { setAdminViewCompany(newC); setPage('dashboard') }
                } else {
                  setCompanyId(id)
                }
              }} />}
            {!isMobile && <span style={{ fontSize:12, color:'#94a3b8' }}>{new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</span>}
            <button onClick={toggleTheme} title={theme==='dark'?'Mode clair':'Mode sombre'}
              style={{ background:theme==='dark'?'#2a3942':'#f0f2f5', border:'none', borderRadius:20, cursor:'pointer', fontSize:18, padding:'6px 12px', display:'flex', alignItems:'center' }}>
              {theme==='dark'?'☀️':'🌙'}
            </button>
          </div>
        </div>
        {/* Bandeau super admin — société consultée */}
        {isSuperAdmin && adminViewCompany && (
          <div style={{background: isOwnCompany?'#dcfce7':'#fef3c7', borderBottom:`2px solid ${isOwnCompany?'#16a34a':'#f59e0b'}`, padding:'8px 16px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <span style={{fontSize:12,fontWeight:700,color: isOwnCompany?'#15803d':'#92400e'}}>
              {isOwnCompany ? '✏️ MODE ÉDITION — Votre société' : '👁️ MODE CONSULTATION — Lecture seule'}
            </span>
            <span style={{fontSize:13,fontWeight:600,color:'#0f2044',flex:1}}>{adminViewCompany.raison_sociale}</span>
            <button onClick={()=>{ setAdminViewCompany(null); setPage('dashboard') }}
              style={{background:'#0f2044',color:'white',border:'none',padding:'5px 14px',borderRadius:7,fontWeight:700,fontSize:12,cursor:'pointer'}}>
              ← Retour aux sociétés
            </button>
          </div>
        )}
        {/* Company selector mobile sous topbar */}
        {isMobile && (
          <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'8px 16px' }}>
            <CompanySelector companies={companies}
              companyId={isSuperAdmin && adminViewCompany ? effectiveCompanyId : companyId}
              setCompanyId={id => {
                if (isSuperAdmin && adminViewCompany) {
                  const newC = companies.find(c => c.id === id)
                  if (newC) { setAdminViewCompany(newC); setPage('dashboard') }
                } else { setCompanyId(id) }
              }} />
          </div>
        )}
        {/* Content */}
        <div style={{ padding:isMobile?12:24, flex:1 }}>
          {renderPage()}
        </div>
      </div>

      {/* ── Bouton Messagerie flottant (masqué sur la page chat) ─────────── */}
      {page!=='chat' && (
      <button
        onClick={()=>setPage('chat')}
        title="Ouvrir la messagerie"
        style={{
          position:'fixed', bottom:24, right:24, zIndex:9999,
          width:56, height:56, borderRadius:'50%',
          background:'#25D366', border:'none',
          boxShadow:'0 4px 24px rgba(37,211,102,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer',
          transition:'transform 0.18s, box-shadow 0.18s',
        }}
        onMouseEnter={e=>{ e.currentTarget.style.transform='scale(1.12)'; e.currentTarget.style.boxShadow='0 6px 32px rgba(37,211,102,0.7)' }}
        onMouseLeave={e=>{ e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='0 4px 24px rgba(37,211,102,0.55)' }}
      >
        <span style={{fontSize:26}}>💬</span>
      </button>
      )}
    </div>
  )
}
