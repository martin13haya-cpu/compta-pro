import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useCallback } from 'react'

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SUPABASE_URL       ='https://proehigsikgqdrxjltmq.supabase.co'
const SUPABASE_ANON_KEY  = 'sb_publishable_DqCGxDWGqJ5K0rnnzDv6Hg_gWG7wzfX'
const SUPER_ADMIN_EMAIL  = 'martin13haya@gmail.com'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
function useResponsive() {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return { isMobile: width < 768, isTablet: width >= 768 && width < 1024, isDesktop: width >= 1024, width }
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
      opacity:disabled?.6:1, display:'inline-flex', alignItems:'center', gap:6, ...sx,
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
  const [mode, setMode]     = useState('login') // login | register
  const [form, setForm]     = useState({ email:'', password:'', nom:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
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
    const { error:err } = await supabase.auth.signUp({ email:form.email, password:form.password })
    setLoading(false)
    if (err) { setError(err.message); return }
    // Update nom in profile
    setSuccess('Compte créé ! En attente de validation par l\'administrateur.')
    setMode('login')
    setForm({ email:'', password:'', nom:'' })
  }

  const panel = (
    <div style={{ width:'40%', background:'linear-gradient(160deg,#1d4ed8,#2563eb)', padding:'48px 40px', color:'white', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:32 }}>
          <div style={{ width:52, height:52, background:'rgba(255,255,255,.15)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>📊</div>
          <div><div style={{ fontSize:22, fontWeight:800 }}>Compta Pro</div><div style={{ fontSize:12, opacity:.75 }}>Gestion Commerciale & Stock</div></div>
        </div>
        {['Gestion multi-sociétés','Documents commerciaux','Stocks & Production riz','Clients & Fournisseurs','Paiements & Règlements'].map(f=>(
          <div key={f} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, fontSize:13.5, opacity:.85 }}>
            <span style={{ color:'#93c5fd' }}>✓</span>{f}
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, opacity:.4 }}>© Compta Pro — Bénin</div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f2044,#1a3a6e)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ display:'flex', width:'100%', maxWidth:860, borderRadius:20, overflow:'hidden', boxShadow:'0 30px 80px rgba(0,0,0,.4)' }}>
        {window.innerWidth >= 640 && panel}
        <div style={{ flex:1, background:'white', padding:'40px 32px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
          <h3 style={{ margin:'0 0 6px', fontSize:24, fontWeight:800, color:'#0f172a' }}>
            {mode==='login' ? 'Connexion' : 'Créer un compte'}
          </h3>
          <p style={{ margin:'0 0 20px', color:'#64748b', fontSize:13.5 }}>
            {mode==='login' ? 'Accédez à votre espace de gestion' : 'Votre compte sera activé par l\'administrateur'}
          </p>
          {error   && <div style={{ background:'#fee2e2', color:'#dc2626', padding:'10px 14px', borderRadius:10, marginBottom:16, fontSize:13 }}>{error}</div>}
          {success && <div style={{ background:'#dcfce7', color:'#16a34a', padding:'10px 14px', borderRadius:10, marginBottom:16, fontSize:13 }}>{success}</div>}
          <form onSubmit={mode==='login'?submitLogin:submitRegister}>
            {mode==='register' && (
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:12.5, fontWeight:700, color:'#374151', marginBottom:6 }}>Nom complet</label>
                <input type="text" name="nom" value={form.nom} onChange={set} required placeholder="Votre nom"
                  style={{ width:'100%', padding:'11px 16px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:14, boxSizing:'border-box' }} />
              </div>
            )}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:12.5, fontWeight:700, color:'#374151', marginBottom:6 }}>Email</label>
              <input type="email" name="email" value={form.email} onChange={set} required placeholder="votre@email.bj"
                style={{ width:'100%', padding:'11px 16px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', fontSize:12.5, fontWeight:700, color:'#374151', marginBottom:6 }}>Mot de passe</label>
              <input type="password" name="password" value={form.password} onChange={set} required placeholder="••••••••" minLength={6}
                style={{ width:'100%', padding:'11px 16px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width:'100%', background:ACCENT, color:'white', border:'none', borderRadius:10, padding:12, fontSize:15, fontWeight:700, cursor:'pointer', opacity:loading?.7:1 }}>
              {loading ? 'Chargement...' : mode==='login' ? '→ Se connecter' : '→ Créer mon compte'}
            </button>
          </form>
          <div style={{ marginTop:20, textAlign:'center', fontSize:13, color:'#64748b' }}>
            {mode==='login' ? (
              <span>Pas encore de compte ? <span onClick={()=>{setMode('register');setError('');setSuccess('')}} style={{ color:ACCENT, cursor:'pointer', fontWeight:600 }}>S'inscrire</span></span>
            ) : (
              <span>Déjà un compte ? <span onClick={()=>{setMode('login');setError('');setSuccess('')}} style={{ color:ACCENT, cursor:'pointer', fontWeight:600 }}>Se connecter</span></span>
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
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async()=>{
    setLoading(true)
    const { data } = await supabase.from('compta_profiles').select('*').order('created_at', { ascending:false })
    setUsers(data||[]); setLoading(false)
  },[])

  useEffect(()=>{ load() },[load])

  const updateStatut = async (id, statut) => {
    const { error } = await supabase.from('compta_profiles').update({ statut }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success(statut==='active' ? 'Compte activé !' : 'Compte suspendu.')
    load()
  }

  const updateRole = async (id, role) => {
    await supabase.from('compta_profiles').update({ role }).eq('id', id)
    toast.success('Rôle mis à jour !'); load()
  }

  const STATUT_STYLE = {
    pending:   { bg:'#fef9c3', c:'#ca8a04', label:'En attente' },
    active:    { bg:'#dcfce7', c:'#16a34a', label:'Actif' },
    suspended: { bg:'#fee2e2', c:'#dc2626', label:'Suspendu' },
  }

  return (
    <div>
      <PageHeader title="Gestion des utilisateurs" subtitle={`${users.length} compte(s)`} />
      {loading ? <div style={{padding:24}}>Chargement...</div> : (
        <div style={{ background:'white', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <TH>Email</TH><TH>Nom</TH><TH>Rôle</TH><TH>Statut</TH><TH>Inscrit le</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {users.map(u => {
                const s = STATUT_STYLE[u.statut] || STATUT_STYLE.pending
                const isSelf = u.email === SUPER_ADMIN_EMAIL
                return (
                  <TR key={u.id}>
                    <TD bold>{u.email}</TD>
                    <TD>{u.nom || '—'}</TD>
                    <TD>
                      {isSelf ? (
                        <span style={{ background:'#fef3c7', color:'#d97706', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>👑 Super Admin</span>
                      ) : (
                        <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)}
                          style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #d1d5db', fontSize:12 }}>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      )}
                    </TD>
                    <TD>
                      <span style={{ background:s.bg, color:s.c, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>{s.label}</span>
                    </TD>
                    <TD sm>{u.created_at?.slice(0,10)}</TD>
                    <TD>
                      {!isSelf && (
                        <div style={{ display:'flex', gap:6 }}>
                          {u.statut !== 'active' && (
                            <Btn sm variant="success" onClick={()=>updateStatut(u.id,'active')}>✓ Activer</Btn>
                          )}
                          {u.statut === 'active' && (
                            <Btn sm variant="danger" onClick={()=>updateStatut(u.id,'suspended')}>⊘ Suspendre</Btn>
                          )}
                          {u.statut === 'pending' && (
                            <Btn sm variant="danger" onClick={()=>updateStatut(u.id,'suspended')}>✕ Rejeter</Btn>
                          )}
                        </div>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </table>
          {users.filter(u=>u.statut==='pending').length > 0 && (
            <div style={{ padding:'12px 20px', background:'#fffbeb', borderTop:'1px solid #fde68a', fontSize:13, color:'#92400e' }}>
              ⚠️ {users.filter(u=>u.statut==='pending').length} compte(s) en attente de validation
            </div>
          )}
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
  { id:'lots',               icon:'🏭', label:'Lots Production' },
  { id:'etuvage',            icon:'🔥', label:'Étuvage' },
  { id:'decorticage',        icon:'⚙️',  label:'Décorticage' },
  { id:'calibrage',          icon:'📐', label:'Calibrage' },
  { id:'tri_optique',        icon:'🔍', label:'Tri optique' },
  { id:'conditionnement',    icon:'🎁', label:'Conditionnement' },
  { section:'Achats' },
  { id:'achats',             icon:'🛒', label:'Achats semi-finis' },
  { id:'etuvage_paiements',  icon:'💰', label:'Paiements étuvage' },
]

const NAV_ADMIN = [
  { section:'Administration' },
  { id:'users',              icon:'👤', label:'Utilisateurs' },
]

function Sidebar({ page, setPage, user, profile, onLogout, open, onClose }) {
  const { isMobile, isTablet } = useResponsive()
  const collapsed = isMobile || isTablet
  const isSuperAdmin = profile?.role === 'super_admin'
  const navItems = isSuperAdmin ? [...NAV, ...NAV_ADMIN] : NAV

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
              <div style={{ color:'rgba(255,255,255,.4)', fontSize:10 }}>{isSuperAdmin?'Super Admin':'Admin'}</div>
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
      const uid = (await supabase.auth.getUser()).data?.user?.id
      if (!uid) { setLoading(false); return }
      const base = (tbl,cid) => {
        let q = supabase.from(tbl).select('id',{count:'exact',head:true}).eq('user_id',uid)
        if (cid) q = q.eq('company_id',cid)
        return q
      }
      const [cli,fou,art,docs,lots,alerteRes] = await Promise.all([
        base('compta_clients',companyId).eq('actif',true),
        base('compta_fournisseurs',companyId).eq('actif',true),
        base('compta_articles',companyId).eq('actif',true),
        supabase.from('compta_documents').select('id,numero,type_doc,date_doc,montant_ttc,montant_paye,statut').eq('user_id',uid).order('created_at',{ascending:false}).limit(6),
        base('compta_lots_production',companyId).eq('statut','en_cours'),
        supabase.from('compta_articles').select('stock_actuel,stock_min').eq('user_id',uid).eq('actif',true),
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
        </Card>
      )}
    </div>
  )
}

// ── COMPANIES ────────────────────────────────────────────────────────────────
function CompaniesPage({ companies, refresh, toast }) {
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({})
  const [saving,setSaving]= useState(false)
  const set = e => setForm(f=>({...f,[e.target.name]:e.target.value}))

  const open = (c=null) => { setForm(c?{...c}:{raison_sociale:'',rccm:'',adresse:'',tel:'',email:''}); setModal(c?'edit':'add') }
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

  const del = async id => {
    if (!confirm('Supprimer cette société ?')) return
    const { error } = await supabase.from('compta_companies').delete().eq('id',id)
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
                <div style={{ width:48, height:48, background:'#dbeafe', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:ACCENT, fontWeight:800, fontSize:20 }}>{c.raison_sociale[0]}</div>
                <div><div style={{fontWeight:700,fontSize:15}}>{c.raison_sociale}</div>{c.rccm&&<div style={{fontSize:12,color:'#64748b'}}>{c.rccm}</div>}</div>
              </div>
              {c.adresse && <div style={{fontSize:12.5,color:'#64748b',marginBottom:4}}>📍 {c.adresse}</div>}
              {c.tel     && <div style={{fontSize:12.5,color:'#64748b',marginBottom:4}}>📞 {c.tel}</div>}
              {c.email   && <div style={{fontSize:12.5,color:'#64748b',marginBottom:12}}>✉️ {c.email}</div>}
              <div style={{display:'flex',gap:8,marginTop:12}}>
                <Btn sm variant="secondary" onClick={()=>open(c)}>Modifier</Btn>
                <Btn sm variant="danger" onClick={()=>del(c.id)}>🗑️</Btn>
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
function TiersPage({ table, title, titleSingle, icon, companies, companyId, toast, extraFields }) {
  const [items,  setItems]  = useState([])
  const [modal,  setModal]  = useState(null)
  const [form,   setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from(table).select('*,compta_companies(raison_sociale)').eq('user_id',uid).eq('actif',true).order('created_at',{ascending:false})
    if (companyId) q = q.eq('company_id',companyId)
    const { data } = await q; setItems(data||[])
  },[table,companyId])

  useEffect(()=>{ load() },[load])

  const filtered = items.filter(it => {
    if (!search) return true
    const s = (it.nom||'')+' '+(it.prenom||'')+' '+(it.nom_societe||'')
    return s.toLowerCase().includes(search.toLowerCase())
  })

  const set = e => setForm(f=>({...f,[e.target.name]:e.target.value}))

  const baseDefaults = { company_id:companyId||companies[0]?.id||'', nom:'', prenom:'', telephone:'', provenance:'', cip:'', ifu:'', email:'', adresse:'' }
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
    if (table==='compta_clients') pay.type = form.type||'physique'
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
        actions={<Btn onClick={()=>open()}>+ Nouveau(elle)</Btn>} />
      <Card style={{marginBottom:16,padding:'12px 20px'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..."
          style={{padding:'8px 14px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13,width:300}} />
      </Card>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>
            <div style={{fontSize:40,marginBottom:8}}>{icon}</div>
            <p>Aucun(e) {titleSingle}</p>
            <Btn onClick={()=>open()}>+ Ajouter</Btn>
          </div>
        ) : (
          <TableWrap>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              {table==='compta_clients' && <TH>Type</TH>}
              <TH>Nom</TH><TH>Téléphone</TH><TH>Provenance</TH>
              {extraFields?.headers?.map((h,i)=><TH key={i}>{h}</TH>)}
              <TH>IFU</TH><TH>CIP</TH><TH>Actions</TH>
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
                  <TD>
                    <div style={{display:'flex',gap:6}}>
                      <Btn sm variant="secondary" onClick={()=>open(it)}>Edit</Btn>
                      <Btn sm variant="danger" onClick={()=>archive(it.id)}>🗑️</Btn>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          </TableWrap>
        )}
      </div>
      <Modal open={!!modal} onClose={close} title={modal==='add'?`Nouveau(elle) ${titleSingle}`:`Modifier ${titleSingle}`} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
            {table==='compta_clients' && (
              <Sel label="Type" name="type" value={form.type} onChange={set}
                options={[{value:'physique',label:'Personne physique'},{value:'morale',label:'Personne morale'}]} />
            )}
            {table==='compta_clients' && form.type==='morale' ? (
              <Span2><Input label="Nom société" name="nom_societe" value={form.nom_societe} onChange={set} /></Span2>
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
function StockPage({ companies, companyId, setPage, toast }) {
  const [articles, setArticles] = useState([])
  const [modal,   setModal]    = useState(null)
  const [form,    setForm]     = useState({})
  const [saving,  setSaving]   = useState(false)
  const [catFilter,setCat]     = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_articles').select('*,compta_companies(raison_sociale)').eq('user_id',uid).eq('actif',true).order('designation')
    if (companyId) q=q.eq('company_id',companyId)
    if (catFilter) q=q.eq('categorie',catFilter)
    const { data } = await q; setArticles(data||[])
  },[companyId,catFilter])

  useEffect(()=>{ load() },[load])

  const valeur = articles.reduce((s,a)=>s+(a.stock_actuel||0)*(a.prix_achat||0),0)
  const set = e=>setForm(f=>({...f,[e.target.name]:e.target.value}))

  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',code:'',designation:'',categorie:'riz_paddy',unite:'kg',prix_achat:0,prix_vente:0,stock_min:0,stock_actuel:0}); setModal('add') }
  const openEdit = a=>{ setForm({...a}); setModal('edit') }
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

  const archive = async id=>{ if(!confirm('Archiver ?')) return; await supabase.from('compta_articles').update({actif:false}).eq('id',id); toast.success('Archivé.'); load() }

  return (
    <div>
      <PageHeader title="Articles & Stock" subtitle={`Valeur totale : ${fcfa(valeur)}`}
        actions={<>
          <Btn sm variant="success" onClick={()=>setPage('stock-entree')}>↓ Entrée</Btn>
          <Btn sm variant="warning" onClick={()=>setPage('stock-sortie')}>↑ Sortie</Btn>
          <Btn sm variant="secondary" onClick={()=>setPage('mouvements')}>↕ Mouvements</Btn>
          <Btn sm variant="info" onClick={()=>setPage('inventaire')}>📋 Inventaire</Btn>
          <Btn onClick={openAdd}>+ Nouvel Article</Btn>
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
            <Btn onClick={openAdd}>+ Créer un article</Btn>
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
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
                        <Btn sm variant="secondary" onClick={()=>openEdit(a)}>✏️ Modifier</Btn>
                        <Btn sm variant="danger" onClick={()=>archive(a.id)}>🗑️ Supprimer</Btn>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={!!modal} onClose={close} title={modal==='add'?'Nouvel Article':'Modifier Article'} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
            <Input label="Code article" name="code" value={form.code} onChange={set} placeholder="RIZ-PAD-001" />
            <Span2><Input label="Désignation *" name="designation" value={form.designation} onChange={set} required /></Span2>
            <Sel label="Catégorie" name="categorie" value={form.categorie} onChange={set}
              options={Object.entries(CAT_LABELS).map(([v,l])=>({value:v,label:l}))} />
            <Sel label="Unité" name="unite" value={form.unite} onChange={set}
              options={['kg','tonne','sac','carton','litre','unité','m²'].map(u=>({value:u,label:u}))} />
            <Input label="Prix achat (FCFA)" name="prix_achat" type="number" value={form.prix_achat} onChange={set} min="0" />
            <Input label="Prix vente (FCFA)" name="prix_vente" type="number" value={form.prix_vente} onChange={set} min="0" />
            <Input label="Stock minimum (alerte)" name="stock_min" type="number" value={form.stock_min} onChange={set} min="0" step="0.01" />
            {modal==='add' && <Input label="Stock initial" name="stock_actuel" type="number" value={form.stock_actuel} onChange={set} min="0" step="0.01" />}
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
                <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
                  options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
              </Span2>
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
                <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
                  options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
              </Span2>
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
function MouvementsPage({ companies, companyId, setPage }) {
  const [items, setItems] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_mouvements_stock').select('*,compta_articles(designation,unite)').eq('user_id',uid).order('date_mvt',{ascending:false}).limit(500)
    if (companyId) q=q.eq('company_id',companyId)
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
          <Btn sm variant="success" onClick={()=>setPage('stock-entree')}>↓ Entrée</Btn>
          <Btn sm variant="warning" onClick={()=>setPage('stock-sortie')}>↑ Sortie</Btn>
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
          <table style={{width:'100%',borderCollapse:'collapse'}}>
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
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { data } = await supabase.from('compta_articles').select('*').eq('user_id',uid).eq('company_id',companyId).eq('actif',true).order('categorie,designation')
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
                <table style={{width:'100%',borderCollapse:'collapse'}}>
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
            )
          })}
        </>
      )}
    </div>
  )
}

// ── COMMERCIAL — LISTE ────────────────────────────────────────────────────────
function CommercialPage({ companies, companyId, setPage, setDocId, toast }) {
  const [docs, setDocs] = useState([])
  const [typeF, setTypeF]   = useState('')
  const [statF, setStatF]   = useState('')
  const [preview, setPreview] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_documents').select('*,compta_clients(nom,prenom,nom_societe,type),compta_companies(raison_sociale)').eq('user_id',uid).order('date_doc',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
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
          <table style={{width:'100%',borderCollapse:'collapse'}}>
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
                <Sel label="Société *" name="company_id" value={form.company_id} onChange={setF}
                  options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
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
                <table style={{width:'100%',borderCollapse:'collapse'}}>
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
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12,fontSize:13}}>
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
function LotsProductionPage({ companies, companyId, toast }) {
  const [lots, setLots]     = useState([])
  const [modal, setModal]   = useState(null)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_lots_production').select('*,compta_companies(raison_sociale)').eq('user_id',uid).order('date_debut',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
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
    const { company_id,numero_lot,date_debut,date_fin,statut,qte_paddy_entree,notes } = form
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
          <Btn onClick={()=>open()}>+ Nouveau Lot</Btn>
        </>}
      />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {lots.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>🏭 Aucun lot de production</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr><TH>N° Lot</TH><TH>Date début</TH><TH>Date fin</TH><TH right>Qté paddy (kg)</TH><TH>Statut</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {lots.map(l=>(
                <TR key={l.id}>
                  <TD bold>{l.numero_lot}</TD><TD>{l.date_debut}</TD><TD>{l.date_fin||'—'}</TD>
                  <TD right>{(l.qte_paddy_entree||0).toFixed(2)}</TD>
                  <TD><Badge type={{en_cours:'warning',termine:'success',annule:'danger'}[l.statut]||'secondary'}>{l.statut}</Badge></TD>
                  <TD><Btn sm variant="secondary" onClick={()=>open(l)}>Edit</Btn></TD>
                </TR>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={!!modal} onClose={close} title={modal==='add'?'Nouveau Lot':'Modifier Lot'}>
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
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

// ── PRODUCTION STAGE — GÉNÉRIQUE ──────────────────────────────────────────────
function ProductionStagePage({ tableName, title, accentColor, companies, companyId, lots, toast, fields }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from(tableName).select('*,compta_lots_production(numero_lot)').eq('user_id',uid).order('date_etape',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
    if (dateFrom)  q=q.gte('date_etape',dateFrom)
    if (dateTo)    q=q.lte('date_etape',dateTo)
    const { data } = await q; setItems(data||[])
  },[tableName,companyId,dateFrom,dateTo])

  useEffect(()=>{ load() },[load])

  useEffect(()=>{
    if (tableName==='compta_conditionnement' && modal) {
      const total = (+(form.nb_sac_5kg||0)*5) + (+(form.nb_sac_25kg||0)*25) + (+(form.nb_sac_50kg||0)*50) + (+(form.nb_sac_5x5kg||0)*25)
      const ecart = (+(form.poids_recu||0)) - total - (+(form.reste||0))
      setForm(f=>({...f, poids_total_conditionne: Math.round(total*1000)/1000, ecart: Math.round(ecart*1000)/1000}))
    }
  },[form.nb_sac_5kg, form.nb_sac_25kg, form.nb_sac_50kg, form.nb_sac_5x5kg, form.poids_recu, form.reste, tableName, modal])

  const calcConditionnement = (f) => {
    const total = (+(f.nb_sac_5kg||0)*5) + (+(f.nb_sac_25kg||0)*25) + (+(f.nb_sac_50kg||0)*50) + (+(f.nb_sac_5x5kg||0)*25)
    const ecart = (+(f.poids_recu||0)) - total - (+(f.reste||0))
    return { ...f, poids_total_conditionne: Math.round(total*1000)/1000, ecart: Math.round(ecart*1000)/1000 }
  }

  const set = e=>{
    const { name, value } = e.target
    setForm(f=>{
      const nf = {...f, [name]:value}
      if (tableName==='compta_conditionnement' &&
        ['nb_sac_5kg','nb_sac_25kg','nb_sac_50kg','nb_sac_5x5kg','poids_recu','reste'].includes(name)) {
        return calcConditionnement(nf)
      }
      return nf
    })
  }

  const openAdd = ()=>{
    const df = { company_id:companyId||companies[0]?.id||'', lot_id:'', date_etape:today() }
    fields.forEach(f=>{ df[f.name]=f.type==='number'?0:'' })
    if (tableName==='compta_conditionnement') Object.assign(df, calcConditionnement(df))
    setForm(df); setModal(true)
  }
  const close = ()=>setModal(false)

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const pay = { company_id:form.company_id, lot_id:form.lot_id||null, date_etape:form.date_etape, user_id:uid }
    fields.forEach(f=>{ pay[f.name]=f.type==='number'?+form[f.name]:form[f.name] })
    const { error } = await supabase.from(tableName).insert(pay)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Enregistrement réussi !'); close(); load()
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
          <Btn sm variant="danger" onClick={printFiltered}>🖨️ PDF</Btn>
          <Btn onClick={openAdd}>+ Nouveau</Btn>
        </>}
      />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>{title} — Aucun enregistrement</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
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
                  <TD><Btn sm variant="danger" onClick={()=>del(it.id)}>Sup</Btn></TD>
                </TR>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={modal} onClose={close} title={`Nouveau — ${title}`} size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
            <Sel label="Lot de production" name="lot_id" value={form.lot_id} onChange={set}
              options={[{value:'',label:'— Aucun —'},...lots.map(l=>({value:l.id,label:l.numero_lot}))]} />
            <Input label="Date" name="date_etape" type="date" value={form.date_etape} onChange={set} />
            {fields.map(f=> f.type==='select'
              ? <Sel key={f.name} label={f.label} name={f.name} value={form[f.name]} onChange={set} options={f.options||[]} />
              : f.calc
                ? <div key={f.name}>
                    <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'#374151',marginBottom:5}}>{f.label} <span style={{color:ACCENT,fontSize:10,fontWeight:700}}>calculé</span></label>
                    <div style={{padding:'9px 12px',background:'#eff6ff',borderRadius:8,border:'1px solid #bfdbfe',fontSize:13.5,fontWeight:700,color:ACCENT}}>
                      {(+(form[f.name]||0)).toFixed(3)}{f.unit?` ${f.unit}`:''}
                    </div>
                  </div>
                : <Input key={f.name} label={f.label} name={f.name} type={f.type||'text'} value={form[f.name]} onChange={set} min={f.type==='number'?'0':undefined} step={f.type==='number'?'0.001':undefined} placeholder={f.placeholder} />
            )}
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
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

function PrestationPage({ companies, companyId, toast }) {
  const [items,  setItems]  = useState([])
  const [modal,  setModal]  = useState(false)
  const [form,   setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_prestations').select('*,compta_companies(raison_sociale)').eq('user_id',uid).order('date_prestation',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
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
          <Btn onClick={openAdd}>+ Nouvelle Prestation</Btn>
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
          <table style={{width:'100%',borderCollapse:'collapse'}}>
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
        )}
      </div>

      <PrestationPreviewModal open={!!preview} onClose={()=>setPreview(null)} row={preview} companyName={companyName} />

      <Modal open={modal} onClose={close} title="Nouvelle Prestation" size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
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
function AchatsSemisPage({ companies, companyId, toast }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_achats_semi_finis').select('*,compta_companies(raison_sociale)').eq('user_id',uid).order('date_achat',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
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
          <Btn onClick={openAdd}>+ Nouvel Achat</Btn>
        </>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>🛒 Aucun achat semi-fini</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              <TH>N° Fact.</TH><TH>Date</TH><TH>Entité</TH><TH>Fournisseur</TH><TH>Provenance</TH>
              <TH>Produit</TH><TH right>Qté (kg)</TH><TH right>P.U</TH><TH right>Montant</TH><TH>Statut</TH>
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
                </TR>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={modal} onClose={close} title="Nouvel Achat Semi-fini" size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
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
function ReglementsPage({ companies, companyId, toast }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_reglements').select('*,compta_companies(raison_sociale)').eq('user_id',uid).order('date_paiement',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
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
          <Btn onClick={openAdd}>+ Nouveau Règlement</Btn>
        </>} />
      <PeriodFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onReset={()=>{setDateFrom('');setDateTo('')}} />
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>💳 Aucun règlement enregistré</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
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
        )}
      </div>
      <Modal open={modal} onClose={close} title="Nouveau Règlement" size="xl">
        <form onSubmit={save}>
          <Grid cols={3} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
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

// ── PAIEMENTS ÉTUVAGE ─────────────────────────────────────────────────────────
function PaiementsEtuvagePage({ companies, companyId, lots, toast }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form,  setForm]    = useState({})
  const [saving,setSaving]  = useState(false)

  const load = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    let q = supabase.from('compta_paiements_etuvage').select('*,compta_companies(raison_sociale)').eq('user_id',uid).order('created_at',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
    const { data } = await q; setItems(data||[])
  },[companyId])

  useEffect(()=>{ load() },[load])

  const tb = items.reduce((s,r)=>s+(r.montant_brut||0),0)
  const tn = items.reduce((s,r)=>s+(r.net_a_payer||0),0)
  const ta = items.reduce((s,r)=>s+(r.retenue_aib||0),0)

  const calcAib = (brut,taux)=>{ const b=parseFloat(brut)||0,t=parseFloat(taux)||0.03; const ret=Math.round(b*t); return { ret, net:Math.round(b-ret) } }

  const set = e=>setForm(f=>({...f,[e.target.name]:e.target.value}))
  const openAdd = ()=>{ setForm({company_id:companyId||companies[0]?.id||'',lot_id:'',date_paiement:today(),numero_lot:'',etuveuse_cooperative:'',qte_etuvee_kg:0,montant_brut:0,taux_aib:'0.03',statut_paiement:'en_attente',mode_paiement:'espèce',reference_paiement:''}); setModal(true) }
  const close = ()=>setModal(false)

  const save = async e=>{
    e.preventDefault(); setSaving(true)
    const uid = (await supabase.auth.getUser()).data?.user?.id
    const { ret, net } = calcAib(form.montant_brut,form.taux_aib)
    const year = new Date().getFullYear()
    const { count } = await supabase.from('compta_paiements_etuvage').select('id',{count:'exact',head:true}).eq('user_id',uid)
    const numero = `PE-${year}-${String((count||0)+1).padStart(4,'0')}`
    const { error } = await supabase.from('compta_paiements_etuvage').insert({
      company_id:form.company_id, user_id:uid, numero, date_paiement:form.date_paiement,
      lot_id:form.lot_id||null, numero_lot:form.numero_lot, etuveuse_cooperative:form.etuveuse_cooperative,
      qte_etuvee_kg:+form.qte_etuvee_kg, montant_brut:+form.montant_brut, taux_aib:+form.taux_aib,
      retenue_aib:ret, net_a_payer:net,
      statut_paiement:form.statut_paiement, mode_paiement:form.mode_paiement, reference_paiement:form.reference_paiement,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Paiement ${numero} enregistré. Net : ${fcfa(net)}`); close(); load()
  }

  const { ret:prvRet, net:prvNet } = calcAib(form.montant_brut,form.taux_aib)

  return (
    <div>
      <PageHeader title="Paiements Étuvage" subtitle={`${items.length} paiement(s)`} actions={<Btn onClick={openAdd}>+ Nouveau Paiement</Btn>} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[{l:'Total Brut',v:fcfa(tb),c:'#ea580c'},{l:'Total Retenue AIB',v:fcfa(ta),c:'#dc2626'},{l:'Total Net à Payer',v:fcfa(tn),c:'#16a34a'}].map(s=>(
          <Card key={s.l}><div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{s.l}</div><div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div></Card>
        ))}
      </div>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden'}}>
        {items.length===0 ? (
          <div style={{textAlign:'center',padding:'48px 24px',color:'#64748b'}}>🔥 Aucun paiement étuvage</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              <TH>N°</TH><TH>Date</TH><TH>N° Lot</TH><TH>Étuveuse</TH>
              <TH right>Qté (kg)</TH><TH right>Montant brut</TH>
              <TH right>Taux AIB</TH><TH right>Retenue AIB</TH><TH right>Net à payer</TH>
              <TH>Mode</TH><TH>Statut</TH><TH>PDF</TH>
            </tr></thead>
            <tbody>
              {items.map(r=>(
                <TR key={r.id}>
                  <TD bold sm>{r.numero}</TD><TD sm>{r.date_paiement}</TD>
                  <TD sm>{r.numero_lot||'—'}</TD><TD sm>{r.etuveuse_cooperative||'—'}</TD>
                  <TD right>{(r.qte_etuvee_kg||0).toFixed(2)}</TD>
                  <TD right>{fcfa(r.montant_brut)}</TD>
                  <TD right sm>{((r.taux_aib||0)*100).toFixed(0)}%</TD>
                  <TD right color="#dc2626">{fcfa(r.retenue_aib)}</TD>
                  <TD right color="#16a34a" bold>{fcfa(r.net_a_payer)}</TD>
                  <TD sm>{r.mode_paiement||'—'}</TD>
                  <TD><Badge type={{en_attente:'warning',paye:'success',annule:'danger'}[r.statut_paiement]||'secondary'}>{r.statut_paiement}</Badge></TD>
                  <TD><Btn sm variant="danger" onClick={()=>printPaiementEtuvage(r)}>PDF</Btn></TD>
                </TR>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={modal} onClose={close} title="Nouveau Paiement Étuvage" size="lg">
        <form onSubmit={save}>
          <Grid cols={2} gap={14} style={{marginBottom:16}}>
            <Sel label="Société *" name="company_id" value={form.company_id} onChange={set}
              options={[{value:'',label:'— Choisir —'},...companies.map(c=>({value:c.id,label:c.raison_sociale}))]} required />
            <Input label="Date" name="date_paiement" type="date" value={form.date_paiement} onChange={set} />
            <Sel label="Fiche étuvage liée" name="lot_id" value={form.lot_id} onChange={set}
              options={[{value:'',label:'— Aucun —'},...lots.map(l=>({value:l.id,label:l.numero_lot}))]} />
            <Input label="N° Lot" name="numero_lot" value={form.numero_lot} onChange={set} />
            <Input label="Étuveuse / Coopérative" name="etuveuse_cooperative" value={form.etuveuse_cooperative} onChange={set} />
            <Input label="Quantité étuvée (kg)" name="qte_etuvee_kg" type="number" value={form.qte_etuvee_kg} onChange={set} min="0" step="0.001" />
            <Input label="Montant brut (FCFA) *" name="montant_brut" type="number" value={form.montant_brut} onChange={set} required min="0" />
            <Sel label="Taux AIB" name="taux_aib" value={form.taux_aib} onChange={set}
              options={[{value:'0.03',label:'3% (Prestataire inscrit)'},{value:'0.05',label:'5% (Prestataire non inscrit)'}]} />
            <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:12,fontSize:12.5}}>
              <div>Retenue AIB : <strong style={{color:'#dc2626'}}>{fcfa(prvRet)}</strong></div>
              <div>Net à payer : <strong style={{color:'#16a34a',fontSize:14}}>{fcfa(prvNet)}</strong></div>
            </div>
            <Sel label="Statut paiement" name="statut_paiement" value={form.statut_paiement} onChange={set}
              options={['en_attente','paye','annule'].map(s=>({value:s,label:s.replace('_',' ')}))} />
            <Sel label="Mode de paiement" name="mode_paiement" value={form.mode_paiement} onChange={set}
              options={['espèce','mobile_money','virement','chèque'].map(m=>({value:m,label:m}))} />
            <Input label="Référence paiement" name="reference_paiement" value={form.reference_paiement} onChange={set} />
          </Grid>
          <Row><Btn variant="secondary" onClick={close}>Annuler</Btn><Btn type="submit" disabled={saving}>{saving?'...':'Enregistrer'}</Btn></Row>
        </form>
      </Modal>
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
  const toast = useToast()
  const { isMobile, isTablet } = useResponsive()
  const collapsed = isMobile || isTablet
  const isSuperAdmin = profile?.role === 'super_admin'

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
    })
    return ()=>subscription.unsubscribe()
  },[])

  // Load companies
  const loadCompanies = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    if (!uid) return
    const { data } = await supabase.from('compta_companies').select('*').eq('user_id',uid).order('raison_sociale')
    setCompanies(data||[])
    if (!companyId && data?.length>0) setCompanyId(data[0].id)
  },[companyId])

  // Load lots (used by production stages and paiements etuvage)
  const loadLots = useCallback(async()=>{
    const uid = (await supabase.auth.getUser()).data?.user?.id
    if (!uid) return
    let q = supabase.from('compta_lots_production').select('*').eq('user_id',uid).order('created_at',{ascending:false})
    if (companyId) q=q.eq('company_id',companyId)
    const { data } = await q; setLots(data||[])
  },[companyId])

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

  const sp = { companies, companyId, toast }

  // Production stages config
  const STAGES = {
    etuvage: { title:'Étuvage', accent:'#ea580c', fields:[
      {name:'numero_lot',    label:'N° Lot (libre)'},
      {name:'etuveuse_cooperative', label:'Étuveuse / Coopérative', summary:true},
      {name:'paddy_envoye_kg',  label:'Paddy envoyé (kg)',   type:'number', summary:true, unit:'kg'},
      {name:'riz_etuve_recu_kg',label:'Riz étuvé reçu (kg)', type:'number', summary:true, unit:'kg'},
      {name:'ecart_kg',     label:'Écart (kg)',  type:'number'},
      {name:'taux_rendement',label:'Rendement (%)',type:'number', summary:true, dec:1},
      {name:'controle_qualite',label:'Contrôle qualité', type:'select', options:[{value:'conforme',label:'Conforme'},{value:'non_conforme',label:'Non conforme'},{value:'a_verifier',label:'À vérifier'}]},
      {name:'observations', label:'Observations'},
      {name:'responsable_section',label:'Responsable'},
    ]},
    decorticage: { title:'Décorticage', accent:'#7c3aed', fields:[
      {name:'responsable_section',label:'Responsable'},
      {name:'nom_produit',  label:'Nom produit'},
      {name:'poids_avant',  label:'Poids avant (kg)',  type:'number', summary:true, unit:'kg'},
      {name:'poids_apres',  label:'Poids après (kg)',  type:'number', summary:true, unit:'kg'},
      {name:'ecart',        label:'Écart (kg)',         type:'number', summary:true, unit:'kg'},
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
      {name:'ecart',               label:'Écart (kg)',            type:'number', summary:true},
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
    achats:'Achats Semi-finis', reglements:'Règlements', etuvage_paiements:'Paiements Étuvage',
    prestations:'Prestations',
  }

  const renderPage = () => {
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
      case 'companies':     return <CompaniesPage companies={companies} refresh={loadCompanies} toast={toast} />
      case 'clients':       return <TiersPage table="compta_clients" title="Clients" titleSingle="Client" icon="👥" {...sp}
                              extraFields={{ names:[], headers:[], fields:[], defaults:{type:'physique',nom_societe:''} }} />
      case 'fournisseurs':  return <TiersPage table="compta_fournisseurs" title="Fournisseurs" titleSingle="Fournisseur" icon="🚚" {...sp}
                              extraFields={{ names:['cooperation'], headers:['Coopérative'], fields:[{name:'cooperation',label:'Coopérative affiliée'}], defaults:{} }} />
      case 'stock':         return <StockPage {...sp} setPage={setPage} />
      case 'stock-entree':  return <StockEntreePage {...sp} setPage={setPage} />
      case 'stock-sortie':  return <StockSortiePage {...sp} setPage={setPage} />
      case 'mouvements':    return <MouvementsPage {...sp} setPage={setPage} />
      case 'inventaire':    return <InventairePage companies={companies} companyId={companyId} setCompanyId={setCompanyId} />
      case 'commercial':    return <CommercialPage {...sp} setPage={setPage} setDocId={setDocId} />
      case 'commercial-view': return <CommercialViewPage docId={docId} setPage={setPage} toast={toast} />
      case 'lots':          return <LotsProductionPage {...sp} />
      case 'achats':        return <AchatsSemisPage {...sp} />
      case 'reglements':    return <ReglementsPage {...sp} />
      case 'prestations':   return <PrestationPage {...sp} />
      case 'etuvage_paiements': return <PaiementsEtuvagePage {...sp} lots={lots} />
      case 'users':          return isSuperAdmin ? <UsersManagementPage toast={toast} /> : <Dashboard {...sp} setPage={setPage} />
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
            {!isMobile && <CompanySelector companies={companies} companyId={companyId} setCompanyId={setCompanyId} />}
            {!isMobile && <span style={{ fontSize:12, color:'#94a3b8' }}>{new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</span>}
          </div>
        </div>
        {/* Company selector mobile sous topbar */}
        {isMobile && (
          <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'8px 16px' }}>
            <CompanySelector companies={companies} companyId={companyId} setCompanyId={setCompanyId} />
          </div>
        )}
        {/* Content */}
        <div style={{ padding:isMobile?12:24, flex:1 }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
