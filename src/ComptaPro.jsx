import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useCallback } from 'react'

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SUPABASE_URL       ='https://proehigsikgqdrxjltmq.supabase.co'
const SUPABASE_ANON_KEY  = 'sb_publishable_DqCGxDWGqJ5K0rnnzDv6Hg_gWG7wzfX'
const SUPER_ADMIN_EMAIL    = 'martin13haya@gmail.com'
const SUPER_ADMIN_WHATSAPP = '2290196078696' // ← Mettre ici votre vrai numéro WhatsApp (sans +, ex: 22997000000)
const APP_VERSION        = 'v2.1.0' // force rebuild
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Helper : retourne un filtre uid ou company selon le rôle
async function buildQuery(q, uid, companyId, isAdmin) {
  if (isAdmin && companyId) return q.eq('company_id', companyId)
  return q.eq('user_id', uid)
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
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', () => {
      // Délai pour laisser le navigateur finir la rotation
      setTimeout(() => setSize(getSize()), 100)
    })
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }, [])

  const { width, height, isLandscape } = size
  // En paysage sur mobile (ex: 667px large), traiter comme tablette
  const isMobile  = width < 768 && !isLandscape
  const isMobileLandscape = width < 1024 && isLandscape && height < 500
  const isTablet  = (width >= 768 && width < 1024) || isMobileLandscape
  const isDesktop = width >= 1024 && !isMobileLandscape

  return { isMobile, isTablet, isDesktop, isLandscape, isMobileLandscape, width, height }
}

// ── UTILITIES ───────────────────────────────────────────────────────────────
const fcfa    = v => Math.round(v || 0).toLocaleString('fr-FR') + ' FCFA'
const today   = () => new Date().toISOString().slice(0, 10)
const ACCENT  = '#2563eb'
const SIDEBAR = '#0f2044'

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
  const cli  = doc.compta_clients
  const comp = doc.compta_companies
  const cliNom = cli ? (cli.type==='morale' ? cli.nom_societe : `${cli.nom||''} ${cli.prenom||''}`.trim()) : null

  const lignesHtml = (lignes||[]).length > 0
    ? (lignes||[]).map((l,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${l.designation||''}</td>
      <td class="r">${l.unite||''}</td>
      <td class="r">${(+(l.quantite)||0).toFixed(3)}</td>
      <td class="r">${Math.round(+(l.prix_unitaire)||0).toLocaleString('fr-FR')}</td>
      <td class="r"><strong>${Math.round(+(l.montant_ligne)||0).toLocaleString('fr-FR')}</strong></td>
    </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#888;padding:16px">Aucune ligne enregistrée</td></tr>`

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${doc.numero}</title>
    <style>${CSS_PRINT}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
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
    ${cliNom ? `<div class="client-box"><strong>Client :</strong> ${cliNom}${cli?.telephone?` &mdash; T&eacute;l : ${cli.telephone}`:''}${cli?.ifu?` &mdash; IFU : ${cli.ifu}`:''}</div>` : ''}
    <table>
      <thead><tr>
        <th style="width:30px">#</th>
        <th>D&eacute;signation</th>
        <th class="r" style="width:55px">Unit&eacute;</th>
        <th class="r" style="width:80px">Quantit&eacute;</th>
        <th class="r" style="width:110px">Prix U. (FCFA)</th>
        <th class="r" style="width:120px">Montant (FCFA)</th>
      </tr></thead>
      <tbody>${lignesHtml}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Montant HT</span><span>${Math.round(doc.montant_ht||0).toLocaleString('fr-FR')} FCFA</span></div>
      ${(doc.tva_pct||0)>0 ? `<div class="row"><span>TVA (${doc.tva_pct}%)</span><span>${Math.round(doc.montant_tva||0).toLocaleString('fr-FR')} FCFA</span></div>` : ''}
      <div class="ttc"><span>TOTAL TTC</span><span>${Math.round(doc.montant_ttc||0).toLocaleString('fr-FR')} FCFA</span></div>
      ${(doc.montant_paye||0)>0 ? `<div class="row" style="margin-top:4px"><span>Pay&eacute;</span><span style="color:#16a34a">${Math.round(doc.montant_paye||0).toLocaleString('fr-FR')} FCFA</span></div>` : ''}
    </div>
    ${doc.notes ? `<div class="notes"><strong>Notes :</strong> ${doc.notes}</div>` : ''}
    <div class="signatures">
      <div class="sig-box">Signature du vendeur</div>
      <div class="sig-box">Signature du client${cliNom?`<br><small>${cliNom}</small>`:''}</div>
    </div>
  </body></html>`
}

function printCommercialDoc(doc, lignes) {
  const html = buildCommercialDocHtml(doc, lignes)
  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
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
  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
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
  const w = window.open('', '_blank'); w.document.write(html); w.document.close()
}

function printExpressionBesoin(fiche, lignes, budgets, companyInfo) {
  const totalTTC = lignes.reduce((s,l)=>{
    const pu=parseFloat(l.prix_unitaire)||0, qty=parseFloat(l.quantite)||0, tva=parseFloat(l.tva)||0
    return s + Math.round(pu*qty*(1+tva/100))
  },0)
  const lignesHtml = lignes.map((l,i)=>{
    const pu=parseFloat(l.prix_unitaire)||0, qty=parseFloat(l.quantite)||0, tva=parseFloat(l.tva)||0
    const montant=Math.round(pu*qty*(1+tva/100))
    return `<tr>
      <td>${l.numero_ordre||i+1}</td>
      <td>${l.description||''}</td>
      <td class="r">${qty}</td>
      <td class="r">${pu.toLocaleString('fr-FR')}</td>
      <td class="r">${tva}%</td>
      <td class="r">${montant.toLocaleString('fr-FR')}</td>
    </tr>`
  }).join('')
  const budgetsHtml = (fiche.codes_budget||[]).map(cb=>{
    const b=budgets.find(x=>x.id===cb)||{}
    return `<tr><td>${b.code||cb}</td><td>${b.libelle||'—'}</td><td class="r">${Math.round(b.montant||0).toLocaleString('fr-FR')} FCFA</td></tr>`
  }).join('')
  const css = CSS_PRINT + `
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; margin-bottom:14px; font-size:10pt; }
    .info-item { border-bottom:1px solid #ccc; padding:4px 0; }
    .info-label { font-size:8.5pt; color:#666; }
    .section-title { font-size:10pt; font-weight:700; text-transform:uppercase; color:#0f2044; border-bottom:2px solid #0f2044; padding-bottom:4px; margin:14px 0 8px; }
  `
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Expression de Besoin ${fiche.reference||''}</title>
    <style>${css}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
    <div class="header">
      <div>
        <div class="company-name">${companyInfo?.raison_sociale||'ComptaPro'}</div>
        <div class="company-info">
          ${companyInfo?.rccm?`RCCM : ${companyInfo.rccm}<br>`:''}
          ${companyInfo?.adresse||''} ${companyInfo?.tel?`— Tél : ${companyInfo.tel}`:''}
        </div>
      </div>
      <div class="doc-title">
        <h1>Fiche d'Expression de Besoin</h1>
        <div class="doc-numero">Réf. ${fiche.reference||'—'}</div>
        <div class="doc-date">Date : ${fiche.date_fiche||'—'}</div>
      </div>
    </div>
    <div style="font-size:9pt;color:#555;font-style:italic;margin-bottom:10px">
      NB: La fiche doit être validée par le supérieur hiérarchique.
    </div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Réalisé par</div><strong>${fiche.realise_par||'—'}</strong></div>
      <div class="info-item"><div class="info-label">Direction d'exploitation</div><strong>${fiche.direction||'—'}</strong></div>
      <div class="info-item"><div class="info-label">Fonction</div><strong>${fiche.fonction||'—'}</strong></div>
      <div class="info-item"><div class="info-label">Référence</div><strong>${fiche.reference||'—'}</strong></div>
      <div class="info-item" style="grid-column:1/-1"><div class="info-label">Expression / Description du besoin</div><strong>${fiche.expression||'—'}</strong></div>
    </div>
    <div class="section-title">Lignes budgétaires concernées</div>
    <table><thead><tr><th>Code</th><th>Ligne budgétaire</th><th class="r">Montant</th></tr></thead>
    <tbody>${budgetsHtml||'<tr><td colspan="3" style="text-align:center;color:#999">Aucune ligne</td></tr>'}</tbody></table>
    <div class="section-title">Détail des besoins</div>
    <table><thead><tr><th>N°</th><th>Description</th><th class="r">Quantité</th><th class="r">Prix U.</th><th class="r">TVA</th><th class="r">Montant</th></tr></thead>
    <tbody>${lignesHtml||'<tr><td colspan="6" style="text-align:center;color:#999">Aucune ligne</td></tr>'}</tbody></table>
    <div class="totals">
      <div class="ttc"><span>TOTAL TTC</span><span>${totalTTC.toLocaleString('fr-FR')} FCFA</span></div>
    </div>
    <div class="signatures" style="margin-top:50px">
      <div class="sig-box">Signature de l'agent<br><small>${fiche.realise_par||''}</small></div>
      <div class="sig-box">Signature du gérant</div>
      <div class="sig-box">Visa du DG</div>
    </div>
    <div style="text-align:center;margin-top:30px;font-size:9pt;color:#888;font-style:italic">NOUS COMPTONS SUR VOTRE DISPONIBILITÉ !!!!</div>
  </body></html>`
  const w = window.open('', '_blank'); w.document.write(html); w.document.close()
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

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
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

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
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

  const w2 = window.open('', '_blank')
  w2.document.write(html)
  w2.document.close()
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

function Input({ label, name, value, onChange, type='text', required, placeholder, min, step, readOnly }) {
  return (
    <div>
      {label && <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#374151', marginBottom:5 }}>
        {label}{required&&' *'}
      </label>}
      <input type={type} name={name} value={value||''} onChange={onChange}
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
  const w = window.open('','_blank'); w.document.write(html); w.document.close()
}

// ── AUTH PAGES ──────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [mode, setMode]       = useState('login')
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
            {mode==='login'?'Connexion':'Créer un compte'}
          </h3>
          <p style={{margin:'0 0 20px',color:'#64748b',fontSize:13.5}}>
            {mode==='login'?'Accédez à votre espace de gestion':'Votre compte sera activé par l\'administrateur'}
          </p>
          {error   && <div style={{background:'#fee2e2',color:'#dc2626',padding:'10px 14px',borderRadius:10,marginBottom:16,fontSize:13}}>{error}</div>}
          {success && <div style={{background:'#dcfce7',color:'#16a34a',padding:'10px 14px',borderRadius:10,marginBottom:16,fontSize:13}}>{success}</div>}
          <form onSubmit={mode==='login'?submitLogin:submitRegister}>
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
            {inp('Mot de passe','password','password','••••••••',true,{minLength:6})}
            <button type="submit" disabled={loading}
              style={{width:'100%',background:ACCENT,color:'white',border:'none',borderRadius:10,padding:12,fontSize:15,fontWeight:700,cursor:'pointer',opacity:(loading?0.7:1)}}>
              {loading?'Chargement...':mode==='login'?'→ Se connecter':'→ Créer mon compte'}
            </button>
          </form>
          <div style={{marginTop:20,textAlign:'center',fontSize:13,color:'#64748b'}}>
            {mode==='login' ? (
              <span>Pas encore de compte ? <span onClick={()=>{setMode('register');setError('');setSuccess('')}} style={{color:ACCENT,cursor:'pointer',fontWeight:600}}>S'inscrire</span></span>
            ) : (
              <span>Déjà un compte ? <span onClick={()=>{setMode('login');setError('');setSuccess('')}} style={{color:ACCENT,cursor:'pointer',fontWeight:600}}>Se connecter</span></span>
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
  { id:'reglements',         icon:'💳', label:'Règlements' },
  { id:'prestations',        icon:'🛠️',  label:'Prestations' },
  { section:'Production' },
  { id:'suivi_lot',          icon:'🔎', label:'Suivi de lot' },
  { id:'lots',               icon:'🏭', label:'Lots Production' },
  { id:'etuvage',            icon:'🔥', label:'Étuvage' },
  { id:'decorticage',        icon:'⚙️',  label:'Décorticage' },
  { id:'calibrage',          icon:'📐', label:'Calibrage' },
  { id:'tri_optique',        icon:'🔍', label:'Tri optique' },
  { id:'conditionnement',    icon:'🎁', label:'Conditionnement' },
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
  const collapsed = isMobile && !isLandscape
  const isSuperAdmin = profile?.role === 'super_admin' || user?.email === SUPER_ADMIN_EMAIL
  const isAdminSociete = profile?.role === 'admin_societe' || profile?.role === 'admin'
  const isUtilisateurSimple = profile?.role === 'utilisateur_simple'
  const permissions = profile?.permissions || {}

  // Filter NAV based on permissions for utilisateur_simple
  const filteredNAV = isUtilisateurSimple
    ? NAV.filter(item => !item.id || (permissions[item.id] && permissions[item.id] !== 'none'))
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
    setForm(c?{...c}:{raison_sociale:'',rccm:'',adresse:'',tel:'',email:''})
    setModal(c?'edit':'add')
  }
  const close = () => setModal(null)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const pay = { raison_sociale:form.raison_sociale, rccm:form.rccm, adresse:form.adresse, tel:form.tel, email:form.email }
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
                <div style={{ width:48, height:48, background: isOwn(c)?'#dbeafe':'#f1f5f9', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color: isOwn(c)?ACCENT:'#94a3b8', fontWeight:800, fontSize:20 }}>{c.raison_sociale[0]}</div>
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
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
    </div>
  )
}

// ── TIERS GENERIQUE (Clients + Fournisseurs partagent la même logique) ───────
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

  const baseDefaults = { company_id:companyId||companies[0]?.id||'', nom:'', prenom:'', nom_societe:'', telephone:'', provenance:'', cip:'', ifu:'', email:'', adresse:'' }
  const open = (it=null) => {
    const defaults = extraFields ? extraFields.defaults : {}
    setForm(it?{...it}:{...baseDefaults,...defaults}); setModal(it?'edit':'add')
  }
  const close = ()=>setModal(null)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const fields = ['company_id','nom','prenom','telephone','provenance','cip','ifu','email','adresse', ...(extraFields?.names||[])]
    const pay = {}; fields.forEach(k=>{ if(form[k]!==undefined) pay[k]=form[k] })
    // Fix: ensure company_id is a valid non-empty value
    if (!pay.company_id) {
      const cid = companyId || companies[0]?.id
      if (!cid) { toast.error('Veuillez sélectionner une société avant d\'enregistrer.'); setSaving(false); return }
      pay.company_id = cid
    }
    if (table==='compta_clients') {
      pay.type = form.type||'physique'
      // Fix: include nom_societe for "personne morale" clients
      if (form.type==='morale') pay.nom_societe = form.nom_societe||''
    }
    const { error } = modal==='add'
      ? await supabase.from(table).insert({...pay,user_id:uid})
      : await supabase.from(table).update(pay).eq('id',form.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(`${titleSingle} enregistré(e) !`); close(); load()
  }

  const archive = async id => {
    if (!confirm(`Archiver ce(tte) ${titleSingle} ?`)) return
    await supabase.from(table).update({actif:false}).eq('id',id)
    toast.success('Archivé.'); load()
  }

  const displayName = it => table==='compta_clients'
    ? (it.type==='morale' ? it.nom_societe : `${it.nom||''} ${it.prenom||''}`)
    : `${it.nom||''} ${it.prenom||''}`

  return (
    <div>
      <PageHeader title={title} subtitle={`${filtered.length} enregistrement(s)`}
        actions={!readOnly && <Btn onClick={()=>open()}>+ Nouveau(elle)</Btn>} />
      <Card style={{marginBottom:16,padding:'12px 20px'}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher par nom..."
            style={{padding:'8px 14px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13,flex:1,minWidth:180}} />
          {table==='compta_clients' && (
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
              {table==='compta_clients' && <TH>Type</TH>}
              <TH>Nom</TH><TH>Téléphone</TH><TH>Provenance</TH>
              {extraFields?.headers?.map((h,i)=><TH key={i}>{h}</TH>)}
              <TH>IFU</TH><TH>CIP</TH>{!readOnly && <TH>Actions</TH>}
            </tr></thead>
            <tbody>
              {filtered.map(it=>(
                <TR key={it.id}>
                  {table==='compta_clients' && <TD><Badge type={it.type==='morale'?'info':'success'}>{it.type==='morale'?'Société':'Physique'}</Badge></TD>}
                  <TD bold>{displayName(it)}</TD>
                  <TD>{it.telephone||'—'}</TD>
                  <TD>{it.provenance||'—'}</TD>
                  {extraFields?.names?.map(k=><TD key={k}>{it[k]||'—'}</TD>)}
                  <TD sm>{it.ifu||'—'}</TD>
                  <TD sm>{it.cip||'—'}</TD>
                  {!readOnly && (
                  <TD>
                    <div style={{display:'flex',gap:6}}>
                      <Btn sm variant="secondary" onClick={()=>open(it)}>Edit</Btn>
                      <Btn sm variant="danger" onClick={()=>archive(it.id)}>🗑️</Btn>
                    </div>
                  </TD>
                  )}
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
            {table==='compta_clients' && (
              <Sel label="Type" name="type" value={form.type} onChange={set}
                options={[{value:'physique',label:'Personne physique'},{value:'morale',label:'Personne morale'}]} />
            )}
            {table==='compta_clients' && form.type==='morale' ? (
              <Span2><Input label="Nom société *" name="nom_societe" value={form.nom_societe} onChange={set} required /></Span2>
            ) : (
              <><Input label="Nom *" name="nom" value={form.nom} onChange={set} required />
              <Input label="Prénom" name="prenom" value={form.prenom} onChange={set} /></>
            )}
            <Input label="Téléphone" name="telephone" value={form.telephone} onChange={set} />
            <Input label="Provenance" name="provenance" value={form.provenance} onChange={set} />
            {extraFields?.fields?.map(f=>(
              <Input key={f.name} label={f.label} name={f.name} value={form[f.name]} onChange={set} />
            ))}
            <Input label="N° IFU" name="ifu" value={form.ifu} onChange={set} />
            <Input label="N° CIP" name="cip" value={form.cip} onChange={set} />
            <Input label="Email" name="email" type="email" value={form.email} onChange={set} />
            <Input label="Adresse" name="adresse" value={form.adresse} onChange={set} />
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
    let q = supabase.from('compta_documents').select('*,compta_clients(nom,prenom,nom_societe,type),compta_companies(raison_sociale)').order('date_doc',{ascending:false})
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
  const cliName = d => { const c=d.compta_clients; return c?(c.type==='morale'?c.nom_societe:`${c.nom||''} ${c.prenom||''}`):null }
  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''

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
  const [form, setForm]     = useState({ company_id:companyId||'', type_doc:typeDoc||'facture', date_doc:today(), date_echeance:'', client_id:'', tva_pct:0, notes:'' })
  const [clients, setClients]   = useState([])
  const [articles, setArticles] = useState([])
  const [lignes, setLignes]     = useState([{ designation:'', unite:'kg', quantite:0, prix_unitaire:0, montant_ligne:0 }])
  const [saving, setSaving]     = useState(false)

  const loadCli = useCallback(async cid=>{ if(!cid) return; const {data}=await supabase.from('compta_clients').select('*').eq('company_id',cid).eq('actif',true); setClients(data||[]) },[])
  const loadArt = useCallback(async cid=>{ if(!cid) return; const {data}=await supabase.from('compta_articles').select('*').eq('company_id',cid).eq('actif',true); setArticles(data||[]) },[])

  useEffect(()=>{ if(form.company_id){ loadCli(form.company_id); loadArt(form.company_id) } },[form.company_id,loadCli,loadArt])

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
      client_id:form.client_id||null, statut:'brouillon',
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
  const cliName = c => c.type==='morale'?c.nom_societe:`${c.nom||''} ${c.prenom||''}`

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
                <Sel label="Client" name="client_id" value={form.client_id} onChange={setF}
                  options={[{value:'',label:'— Aucun —'},...clients.map(c=>({value:c.id,label:cliName(c)}))]} />
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
      const { data:d } = await supabase.from('compta_documents').select('*,compta_clients(*),compta_companies(*)').eq('id',docId).single()
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
  const cliNom = cli?(cli.type==='morale'?cli.nom_societe:`${cli.nom||''} ${cli.prenom||''}`):null
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
          {cliNom && (
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13}}>
              <strong>Client :</strong> {cliNom}
              {cli?.telephone && ` — Tél : ${cli.telephone}`}
              {cli?.ifu       && ` — IFU : ${cli.ifu}`}
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
    const company_id = form.company_id || companyId || companies[0]?.id
    if (!company_id) { toast.error('Veuillez sélectionner une société.'); setSaving(false); return }
    const pay = { company_id,numero_lot,date_debut,date_fin:date_fin||null,statut,qte_paddy_entree:+qte_paddy_entree,notes }
    const { error } = modal==='add' ? await supabase.from('compta_lots_production').insert({...pay,user_id:uid}) : await supabase.from('compta_lots_production').update(pay).eq('id',form.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Lot enregistré !'); close(); load()
  }

  const companyName = companies.find(c=>c.id===companyId)?.raison_sociale||''

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
                  <div class="header"><div><div class="company-name">${companyName}</div><div class="company-info">Lot de Production</div></div>
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
                      <Btn sm variant="danger" onClick={()=>{ const w=window.open('','_blank'); w.document.write(lotHtml); w.document.close() }}>🖨️</Btn>
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
                <button onClick={()=>{ const w=window.open('','_blank'); w.document.write(rowPreview.html); w.document.close() }}
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
            <button onClick={()=>{ const w=window.open('','_blank'); w.document.write(html); w.document.close() }}
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

  const openAdd = () => {
    const cid = companyId||companies[0]?.id||''
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
                      <Btn sm variant="danger" onClick={()=>{ const html=buildProductionRowHtml(it,title,fields,companyName); const w=window.open('','_blank'); w.document.write(html); w.document.close() }}>🖨️</Btn>
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
            <button onClick={()=>{ const w=window.open('','_blank'); w.document.write(html); w.document.close() }}
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
                      <Btn sm variant="danger" onClick={()=>{ const html=buildPrestationHtml(r,companyName); const w=window.open('','_blank'); w.document.write(html); w.document.close() }}>🖨️ PDF</Btn>
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
  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',numero_fact:'',date_achat:today(),entite:'',nom_fournisseur:'',provenance:'',nom_acheteur:'',id_produit:'',nature_produit:'',quantite:0,prix_unitaire:0,montant:0,statut:'en_cours'}); setModal(true) }
  const close = ()=>setModal(false)

  const deleteAchat = async (id) => {
    if (!window.confirm('Supprimer cet achat ?')) return
    const { error } = await supabase.from('compta_achats_semi_finis').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Achat supprimé !'); load()
  }

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { company_id,numero_fact,date_achat,entite,nom_fournisseur,provenance,nom_acheteur,id_produit,nature_produit,quantite,prix_unitaire,statut } = form
    const montant = Math.round((parseFloat(quantite)||0)*(parseFloat(prix_unitaire)||0))
    const { error } = await supabase.from('compta_achats_semi_finis').insert({ company_id,user_id:uid,numero_fact,date_achat,entite,nom_fournisseur,provenance,nom_acheteur,id_produit,nature_produit,quantite:+quantite,prix_unitaire:+prix_unitaire,montant,statut })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Achat enregistré !'); close(); load()
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
            <Input label="Nom fournisseur" name="nom_fournisseur" value={form.nom_fournisseur} onChange={set} />
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
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
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
    const company_id=form.company_id||companyId||companies[0]?.id
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
                      <Btn sm variant="danger"  onClick={()=>{ const w=window.open('','_blank'); w.document.write(buildHtml(l)); w.document.close() }}>🖨️</Btn>
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
                <button onClick={()=>{ const w=window.open('','_blank'); w.document.write(rowPreview.html); w.document.close() }}
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
  ['inventaire','Inventaire'],['commercial','Documents commerciaux'],['reglements','Règlements'],
  ['prestations','Prestations'],['suivi_lot','Suivi de lot'],['lots','Lots Production'],
  ['etuvage','Étuvage'],['decorticage','Décorticage'],['calibrage','Calibrage'],
  ['tri_optique','Tri optique'],['conditionnement','Conditionnement'],
  ['achats','Achats semi-finis'],['lots_semi_finis','Lots Semi-finis'],
  ['epierrage','Épierrage'],['etuvage_paiements','Paiements étuvage'],
  ['docs_admin','Documents administratifs'],
  ['journal_caisse','Journal Caisse'],['journal_banque','Journal Banque'],
  ['journal_mobile','Journal Mobile Money'],
]

const SECTION_GROUPS = [
  {group:'Référentiel', ids:['companies','clients','fournisseurs']},
  {group:'Stock', ids:['stock','mouvements','inventaire']},
  {group:'Commercial', ids:['commercial','reglements','prestations']},
  {group:'Production', ids:['suivi_lot','lots','etuvage','decorticage','calibrage','tri_optique','conditionnement']},
  {group:'Achats', ids:['achats','lots_semi_finis','epierrage','etuvage_paiements']},
  {group:'Documents', ids:['docs_admin']},
  {group:'Comptabilité', ids:['journal_caisse','journal_banque','journal_mobile']},
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

  const defaultPerms=()=>Object.fromEntries(ALL_SECTIONS.map(([id])=>[id,'read']))

  const openAdd=()=>{
    setEditItem(null)
    setForm({nom:'',email:'',whatsapp:'',mot_de_passe:'',signataire_id:''})
    setPerms(defaultPerms()); setModal(true)
  }

  const openEdit=(u)=>{
    setEditItem(u)
    setForm({nom:u.nom||'',email:u.email||'',whatsapp:u.whatsapp||'',mot_de_passe:'',signataire_id:u.signataire_id||''})
    setPerms(u.permissions||defaultPerms()); setModal(true)
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
      const {data:authData,error:authErr}=await supabase.auth.signUp({
        email:form.email, password:form.mot_de_passe,
        options:{emailRedirectTo:window.location.origin}
      })
      if(authErr){ toast.error(authErr.message); setSaving(false); return }
      const newUid=authData?.user?.id
      if(!newUid){ toast.error('Erreur création compte'); setSaving(false); return }
      const {error:profErr}=await supabase.from('compta_profiles').upsert({
        id:newUid, nom:form.nom, email:form.email, whatsapp:form.whatsapp,
        role:'utilisateur_simple', statut:'active', company_id:companyId,
        created_by:uid, permissions:perms, signataire_id:form.signataire_id||null,
      })
      if(profErr){ toast.error(profErr.message); setSaving(false); return }
      toast.success('Utilisateur '+form.nom+' créé !')
      if(form.whatsapp) sendWelcomeWA(form.nom,form.whatsapp,form.email,form.mot_de_passe)
    } else {
      await supabase.from('compta_profiles').update({
        nom:form.nom, whatsapp:form.whatsapp,
        permissions:perms, signataire_id:form.signataire_id||null,
      }).eq('id',editItem.id)
      toast.success('Utilisateur mis à jour !')
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
            <Input label="WhatsApp (notification bienvenue)" value={form.whatsapp||''} onChange={e=>setForm(f=>({...f,whatsapp:e.target.value}))} placeholder="0196078696" />
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


// ── PARAMÈTRES (Super Admin) ──────────────────────────────────────────────────
const DOCUMENTS_TYPES = [
  'Expression de besoin','Fiche épierrage','Achat semi-fini',
  'Paiement étuvage','Bon de commande','Facture','Proforma',
  'Journal caisse','Journal banque','Journal Mobile Money',
  'Lot de production','Lot semi-fini','Bon livraison','Règlement'
]

function ParametresPage({ toast, companies, companyId }) {
  const [signataires, setSignataires] = useState([])
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
      <PageHeader title="Paramètres" subtitle="Gestion des signataires de documents" />
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
    if(isAdmin&&companyId) q=q.eq('company_id',companyId)
    else if(companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
    else q=q.eq('user_id',uid)
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
function DocsAdminPage({ companies, companyId, toast, readOnly=false, profile }) {
  const [subPage, setSubPage] = useState('fiches') // 'fiches' | 'budgets'
  return (
    <div>
      <PageHeader title="Documents administratifs" subtitle="Fiches & Budget" />
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {[{id:'fiches',label:'📋 Expressions de besoin'},{id:'budgets',label:'💼 Gestion Budget'}].map(t=>(
          <button key={t.id} onClick={()=>setSubPage(t.id)} style={{
            padding:'8px 18px',borderRadius:8,border:'none',fontWeight:600,fontSize:13,cursor:'pointer',
            background:subPage===t.id?ACCENT:'#f1f5f9',color:subPage===t.id?'white':'#475569'
          }}>{t.label}</button>
        ))}
      </div>
      {subPage==='fiches'    && <ExpressionBesoinPage companies={companies} companyId={companyId} toast={toast} readOnly={readOnly} profile={profile} />}
      {subPage==='budgets'   && <BudgetPage companies={companies} companyId={companyId} toast={toast} readOnly={readOnly} />}
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
    if(isAdmin&&companyId) q=q.eq('company_id',companyId)
    else if(companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
    else q=q.eq('user_id',uid)
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

  useEffect(()=>{
    supabase.auth.getUser().then(async ({data:ad})=>{
      const isSuper = ad?.user?.email===SUPER_ADMIN_EMAIL
      setIsSuperAdmin(isSuper)
    })
  },[])

  const load=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_expression_besoin').select('*,compta_companies(raison_sociale,rccm,adresse,tel)').order('created_at',{ascending:false})
    if(isAdmin&&companyId) q=q.eq('company_id',companyId)
    else if(companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
    else q=q.eq('user_id',uid)
    const { data }=await q; setFiches(data||[])
  },[companyId])

  const loadBudgets=useCallback(async()=>{
    const { data:ad }=await supabase.auth.getUser()
    const uid=ad?.user?.id; const isAdmin=ad?.user?.email===SUPER_ADMIN_EMAIL
    let q=supabase.from('compta_budget').select('*').order('code',{ascending:true})
    if(isAdmin&&companyId) q=q.eq('company_id',companyId)
    else if(companyId) q=q.eq('user_id',uid).eq('company_id',companyId)
    else q=q.eq('user_id',uid)
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
    const { error }=await supabase.from('compta_expression_besoin').update({
      lignes:validLignes,
      total_autorise:totalAutorise,
      statut_validation:validLignes.every(l=>l.validation!=='en_attente')?'traitee':'en_cours'
    }).eq('id',validModal.id)
    if(error){ toast.error(error.message); return }
    toast.success('Validation enregistrée !'); setValidModal(null); load()
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
              <TH>Référence</TH><TH>Date</TH><TH>Réalisé par</TH><TH>Direction</TH>
              <TH right>Total demandé</TH><TH right>Total autorisé</TH><TH>Statut</TH><TH>Action</TH>
            </tr></thead>
            <tbody>
              {fiches.map(r=>(
                <TR key={r.id}>
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
                      <button title="Imprimer" onClick={()=>printExpressionBesoin(r,r.lignes||[],budgets,r.compta_companies)} style={{background:'#f59e0b',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'white',fontSize:13}}>🖨️</button>
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
            <Btn variant="danger" onClick={()=>printExpressionBesoin(viewItem,viewItem.lignes||[],budgets,viewItem.compta_companies)}>🖨️ Imprimer</Btn>
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
function ReglementsPage({ companies, companyId, toast, readOnly=false }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { data:adnts } = await supabase.auth.getUser(); const uidnts=adnts?.user?.id; const isAdmnts=adnts?.user?.email===SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_reglements').select('*,compta_companies(raison_sociale)').order('date_paiement',{ascending:false})
    q = isAdmnts&&companyId ? q.eq('company_id',companyId) : q.eq('user_id',uidnts); if(companyId&&!isAdmnts) q=q.eq('company_id',companyId)
    if (dateFrom)  q=q.gte('date_paiement',dateFrom)
    if (dateTo)    q=q.lte('date_paiement',dateTo)
    const { data } = await q; setItems(data||[])
  },[companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  const total = items.reduce((s,r)=>s+(r.montant_paye||0),0)
  const set = e=>setForm(f=>({...f,[e.target.name]:e.target.value}))
  const companyNameR = companies.find(c=>c.id===companyId)?.raison_sociale||''

  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',numero_facture:'',date_paiement:today(),entite:'',tiers_type:'client',tiers_nom:'',provenance:'',acheteur_vendeur:'',nature_produit:'',montant_paye:0,solde:0,mode_paiement:'espèce',reference_paiement:'',notes:''}); setModal(true) }
  const close = ()=>setModal(false)

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { company_id,numero_facture,date_paiement,entite,tiers_type,tiers_nom,provenance,acheteur_vendeur,nature_produit,montant_paye,solde,mode_paiement,reference_paiement,notes } = form
    const { error } = await supabase.from('compta_reglements').insert({ company_id,user_id:uid,numero_facture,date_paiement,entite,tiers_type,tiers_nom,provenance,acheteur_vendeur,nature_produit,montant_paye:+montant_paye,solde:+solde,mode_paiement,reference_paiement,notes })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Règlement enregistré !'); close(); load()
  }

  const printFilteredR = () => {
    const headers = [{label:'N° Fact.'},{label:'Date'},{label:'Entité'},{label:'Type'},{label:'Tiers'},{label:'Provenance'},{label:'Produit'},{label:'Mode'},{label:'Montant payé',r:true},{label:'Solde',r:true}]
    const rows = items.map(r=>[r.numero_facture||'—',r.date_paiement,r.entite||'—',r.tiers_type==='client'?'Client':'Fourn.',r.tiers_nom||'—',r.provenance||'—',r.nature_produit||'—',r.mode_paiement||'—',Math.round(r.montant_paye||0).toLocaleString('fr-FR')+' FCFA',Math.round(r.solde||0).toLocaleString('fr-FR')+' FCFA'])
    printFilteredList({ title:'Règlements Clients / Fournisseurs', companyName:companyNameR, headers, rows, dateFrom, dateTo,
      totals:[{label:'Total payé', value:Math.round(total).toLocaleString('fr-FR')+' FCFA'}]})
  }

  return (
    <div>
      <PageHeader title="Règlements Clients / Fournisseurs"
        subtitle={`${items.length} règlement(s) — Total payé : ${fcfa(total)}`}
        actions={<>
          <Btn sm variant="danger" onClick={printFilteredR}>🖨️ PDF liste</Btn>
          {!readOnly && <Btn onClick={openAdd}>+ Nouveau Règlement</Btn>}
        </>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>💳 Aucun règlement enregistré</div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
            <thead><tr>
              <TH>N° Fact.</TH><TH>Date</TH><TH>Entité</TH><TH>Type</TH>
              <TH>Tiers</TH><TH>Provenance</TH><TH>Produit</TH>
              <TH right>Montant payé</TH><TH right>Solde</TH><TH>Mode</TH><TH>PDF</TH>
            </tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero_facture||'—'}</TD><TD sm>{r.date_paiement}</TD>
                  <TD sm>{r.entite||'—'}</TD>
                  <TD><Badge type={r.tiers_type==='client'?'success':'warning'}>{r.tiers_type==='client'?'Client':'Fourn.'}</Badge></TD>
                  <TD sm>{r.tiers_nom||'—'}</TD><TD sm>{r.provenance||'—'}</TD><TD sm>{r.nature_produit||'—'}</TD>
                  <TD right color="#16a34a" bold>{fcfa(r.montant_paye)}</TD>
                  <TD right color={(r.solde||0)>0?'#dc2626':'#16a34a'}>{fcfa(r.solde)}</TD>
                  <TD sm>{r.mode_paiement||'—'}</TD>
                  <TD><Btn sm variant="danger" onClick={()=>printReglement(r)}>PDF</Btn></TD>
                </TR>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <Modal open={modal} onClose={close} title="Nouveau Règlement" size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Input label="N° Facture" name="numero_facture" value={form.numero_facture} onChange={set} />
            <Input label="Date *" name="date_paiement" type="date" value={form.date_paiement} onChange={set} required />
            <Input label="Entité" name="entite" value={form.entite} onChange={set} />
            <Sel label="Type tiers" name="tiers_type" value={form.tiers_type} onChange={set}
              options={[{value:'client',label:'Client'},{value:'fournisseur',label:'Fournisseur'}]} />
            <Input label="Nom du tiers" name="tiers_nom" value={form.tiers_nom} onChange={set} />
            <Input label="Provenance" name="provenance" value={form.provenance} onChange={set} />
            <Input label="Acheteur / Vendeur" name="acheteur_vendeur" value={form.acheteur_vendeur} onChange={set} />
            <Input label="Nature du produit" name="nature_produit" value={form.nature_produit} onChange={set} />
            <Input label="Montant payé (FCFA) *" name="montant_paye" type="number" value={form.montant_paye} onChange={set} required min="0" />
            <Input label="Solde restant (FCFA)" name="solde" type="number" value={form.solde} onChange={set} min="0" />
            <Sel label="Mode de paiement" name="mode_paiement" value={form.mode_paiement} onChange={set}
              options={['espèce','virement','mobile_money','chèque','autre'].map(m=>({value:m,label:m.charAt(0).toUpperCase()+m.slice(1)}))} />
            <Input label="Référence de paiement" name="reference_paiement" value={form.reference_paiement} onChange={set} />
            <Input label="Notes" name="notes" value={form.notes} onChange={set} />
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
    const cid = form.company_id || companyId || companies[0]?.id
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

  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',lot_id:'',date_paiement:today(),numero_lot:'',etuveuse_cooperative:'',qte_etuvee_kg:0,prix_unitaire:0,montant_brut:0,taux_aib:'0.03',statut_paiement:'en_attente',mode_paiement:'espèce',reference_paiement:''}); setModal(true) }
  const close = ()=>setModal(false)

  const deleteEtuvage = async (id) => {
    if (!window.confirm('Supprimer ce paiement ?')) return
    const { error } = await supabase.from('compta_paiements_etuvage').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Paiement supprimé !'); load()
  }

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { ret, net } = calcAib(form.montant_brut, form.taux_aib)
    const year = new Date().getFullYear()
    const { count } = await supabase.from('compta_paiements_etuvage').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero = `PE-${year}-${String((count||0)+1).padStart(4,'0')}`
    const { error } = await supabase.from('compta_paiements_etuvage').insert({
      company_id:form.company_id||companyId, user_id:uid, numero,
      date_paiement:form.date_paiement,
      numero_lot:form.numero_lot, etuveuse_cooperative:form.etuveuse_cooperative,
      qte_etuvee_kg:+form.qte_etuvee_kg, prix_unitaire:+form.prix_unitaire,
      montant_brut:+form.montant_brut, taux_aib:+form.taux_aib,
      retenue_aib:ret, net_a_payer:net,
      statut_paiement:form.statut_paiement, mode_paiement:form.mode_paiement,
      reference_paiement:form.reference_paiement,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Paiement ${numero} enregistré. Net : ${fcfa(net)}`); close(); load()
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
            <Sel label="Mode de paiement" name="mode_paiement" value={form.mode_paiement||'espèce'} onChange={set}
              options={['espèce','mobile_money','virement','chèque'].map(m=>({value:m,label:m}))} />
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
    const w=window.open('','_blank'); w.document.write(html); w.document.close()
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
  const toast = useToast()
  const { isMobile, isTablet, isLandscape, isMobileLandscape } = useResponsive()
  // En paysage mobile : sidebar visible mais compacte, contenu plein écran
  const collapsed = isMobile && !isLandscape

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
    supabase.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user??null)
      loadProfile(session?.user??null)
    })
    const { data:{subscription} } = supabase.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user??null)
      loadProfile(session?.user??null)
      // Enregistrer l'heure de connexion
      if (session?.user?.id) {
        supabase.from('compta_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then(()=>{})
      }
    })
    return ()=>subscription.unsubscribe()
  },[])

  // Load companies — super admin voit toutes les sociétés
  const loadCompanies = useCallback(async()=>{
    const { data:authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id
    if (!uid) return
    const isAdmin = authData?.user?.email === SUPER_ADMIN_EMAIL
    let q = supabase.from('compta_companies').select('*').order('raison_sociale')
    if (!isAdmin) q = q.eq('user_id', uid)
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
    users:'Gestion des utilisateurs',
    fournisseurs:'Fournisseurs', stock:'Articles & Stock', 'stock-entree':'Entrée de stock',
    'stock-sortie':'Sortie de stock', mouvements:'Mouvements de stock', inventaire:'Inventaire',
    commercial:'Documents commerciaux', 'commercial-view':'Détail document', lots:'Lots Production',
    etuvage:'Étuvage', decorticage:'Décorticage', calibrage:'Calibrage',
    tri_optique:'Tri Optique', conditionnement:'Conditionnement',
    achats:'Achats Semi-finis', lots_semi_finis:'Lots Semi-finis', epierrage:'Épierrage', reglements:'Règlements', etuvage_paiements:'Paiements Étuvage',
    docs_admin:'Documents administratifs', parametres:'Paramètres',
    prestations:'Prestations', journal_caisse:'Journal Caisse', journal_banque:'Journal Banque',
    suivi_lot:'Suivi de Lot', journal_mobile:'Journal Mobile Money',
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
                              extraFields={{ names:['cooperation'], headers:['Coopérative'], fields:[{name:'cooperation',label:'Coopérative affiliée'}], defaults:{} }} />
      case 'stock':         return <StockPage {...sp} setPage={setPage} />
      case 'stock-entree':  return <StockEntreePage {...sp} setPage={setPage} />
      case 'stock-sortie':  return <StockSortiePage {...sp} setPage={setPage} />
      case 'mouvements':    return <MouvementsPage {...sp} setPage={setPage} />
      case 'inventaire':    return <InventairePage companies={companies} companyId={effectiveCompanyId} setCompanyId={setCompanyId} />
      case 'commercial':    return <CommercialPage {...sp} setPage={setPage} setDocId={setDocId} />
      case 'commercial-view': return <CommercialViewPage docId={docId} setPage={setPage} toast={toast} />
      case 'lots':          return <LotsProductionPage {...sp} />
      case 'suivi_lot':     return <SuiviLotPage {...sp} />
      case 'achats':        return <AchatsSemisPage {...sp} />
      case 'lots_semi_finis': return <LotsSemiFinisPage {...sp} />
      case 'epierrage':      return <EpierragePage {...sp} lots={lots} />
      case 'docs_admin':     return <DocsAdminPage {...sp} profile={profile} />
      case 'reglements':    return <ReglementsPage {...sp} />
      case 'prestations':   return <PrestationPage {...sp} />
      case 'etuvage_paiements': return <PaiementsEtuvagePage {...sp} lots={lots} />
      case 'journal_caisse':    return <JournalPage table="compta_journal_caisse" title="Journal Caisse" icon="🏦" journalType="caisse" {...sp} />
      case 'journal_banque':    return <JournalPage table="compta_journal_banque" title="Journal Banque" icon="🏛️" journalType="banque" {...sp} />
      case 'journal_mobile':    return <JournalPage table="compta_journal_mobile" title="Journal Mobile Money" icon="📱" journalType="mobile" {...sp} />
      case 'users':          return isSuperAdmin ? <UsersManagementPage toast={toast} /> : <Dashboard {...sp} setPage={setPage} />
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

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:'#f1f5f9', color:'#1e293b', minHeight:'100vh' }}>
      <Toasts toasts={toast.toasts} />
      <Sidebar page={page} setPage={setPage} user={user} profile={profile} onLogout={logout}
        open={sidebarOpen} onClose={()=>setSidebarOpen(false)} />
      <div style={{ marginLeft:collapsed ? 0 : 260, minHeight:'100vh', display:'flex', flexDirection:'column' }}>
        {/* Topbar */}
        <div style={{ height:60, background:'white', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', position:'sticky', top:0, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {collapsed && (
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

      {/* ── Bouton WhatsApp flottant ─────────────────────────────────────── */}
      <a
        href={`https://wa.me/${SUPER_ADMIN_WHATSAPP}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Contacter l'administrateur sur WhatsApp"
        style={{
          position:'fixed', bottom:24, right:24, zIndex:9999,
          width:56, height:56, borderRadius:'50%',
          background:'#25d366',
          boxShadow:'0 4px 24px rgba(37,211,102,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center',
          textDecoration:'none', cursor:'pointer',
          transition:'transform 0.18s, box-shadow 0.18s',
        }}
        onMouseEnter={e=>{ e.currentTarget.style.transform='scale(1.12)'; e.currentTarget.style.boxShadow='0 6px 32px rgba(37,211,102,0.7)' }}
        onMouseLeave={e=>{ e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='0 4px 24px rgba(37,211,102,0.55)' }}
      >
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 3C8.832 3 3 8.832 3 16c0 2.29.614 4.437 1.682 6.29L3 29l6.9-1.655A12.93 12.93 0 0 0 16 29c7.168 0 13-5.832 13-13S23.168 3 16 3Z" fill="white"/>
          <path d="M21.75 19.25c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.71.16-.21.32-.82 1.04-.99 1.25-.17.21-.35.24-.65.08-.32-.16-1.33-.49-2.53-1.56-.94-.83-1.57-1.86-1.75-2.18-.18-.32-.02-.49.13-.65.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.1-.21.05-.39-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.32-1.1 1.07-1.1 2.62s1.13 3.04 1.29 3.25c.16.21 2.22 3.38 5.38 4.74.75.32 1.34.52 1.8.66.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.16-1.52.26-.75.26-1.39.18-1.52-.08-.13-.29-.21-.61-.37Z" fill="#25d366"/>
        </svg>
      </a>
    </div>
  )
}
