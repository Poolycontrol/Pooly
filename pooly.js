/*
  POOLY — interface commune à tous les boîtiers (Uno, Mega, R4 WiFi)
  Version de l'interface : 1.4
  ------------------------------------------------------------------
  Deux chemins, un seul fichier :

  1. EN LIGNE (site GitHub Pages, index.html définit window.POOLY_SUPABASE)
     Connexion par e-mail via Supabase, accessible hors de la maison.
     - L'état est lu dans la table `etats` (colonne donnees).
     - Les commandes sont écrites dans la table `ordres`.
     - La fiche piscine est enregistrée dans `fiches_piscine`.

  2. EN LOCAL (page de lancement servie par le boîtier, pas de POOLY_SUPABASE)
     Fonctionnement d'origine : /login, /api/config, /api/etat…
     C'est le mode secours si internet est coupé.

  CONTRAT AVEC LA R4 (mode en ligne)
  - La R4 appelle boitier_synchroniser(p_serie, p_cle, p_etat) avec :
      p_etat = { "config": <même JSON que /api/config>,
                 "etat":   <même JSON que /api/etat> }
  - Ordres à exécuter (table ordres, colonnes type / cible / valeur) :
      mode       cible = null      valeur = { "mode": "pooly|auto|manuel|horsgel" }
      sortie     cible = id sortie valeur = { "on": true|false }
      programme  cible = id sortie valeur = { "v": [ ... ] }  (même format que /api/programme)
      entretien  cible = "0|1|2"   valeur = { "t": timestamp|null }
      profil     cible = null      valeur = { "v": [8 valeurs] }

  Onglets : Accueil · Programmes · Piscine · Compte
*/
(function () {
  'use strict';

  const WEB_VERSION = '1.4';

  // ------------------------------------------------------------------
  //  Réglages communs à toute la gamme
  // ------------------------------------------------------------------
  const MODES = {
    pooly:   { nom: 'Pooly',    aide: 'Filtration selon la température : {heures} h par jour, de {plage}.' },
    auto:    { nom: 'Auto',     aide: 'Filtration selon tes horaires : {auto}. Réglage dans l’onglet Programmes.' },
    manuel:  { nom: 'Manuel',   aide: 'Tu commandes la pompe toi-même.' },
    horsgel: { nom: 'Hors-gel', aide: 'Pompe en continu si l’eau descend sous {seuil} °C, sinon programme Pooly ({plage}).' }
  };

  // Fiche « Ma piscine » : 8 valeurs, 0 = non renseigné
  const P_VOLUME = 0, P_DESINF = 1, P_PH = 2, P_FILTRE = 3, P_REVET = 4, P_CHAUF = 5, P_COUV = 6;
  const CHOIX = {
    [P_DESINF]: { nom: 'Désinfectant', options: ['Chlore (galets ou granulés)', 'Chlore liquide', 'Électrolyseur au sel', 'Brome', 'Oxygène actif', 'PHMB (sans chlore)'] },
    [P_PH]:     { nom: 'Régulation du pH', options: ['Non, je corrige à la main', 'Oui, régulateur automatique'] },
    [P_FILTRE]: { nom: 'Filtre', options: ['Sable', 'Verre', 'Cartouche', 'Diatomée'] },
    [P_REVET]:  { nom: 'Revêtement', options: ['Liner', 'PVC armé', 'Carrelage / béton', 'Coque polyester'] },
    [P_CHAUF]:  { nom: 'Chauffage', options: ['Aucun', 'Pompe à chaleur', 'Réchauffeur électrique', 'Solaire'] },
    [P_COUV]:   { nom: 'Couverture', options: ['Aucune', 'Bâche', 'Volet roulant', 'Abri'] }
  };
  const FILTRE = { SABLE: 1, VERRE: 2, CARTOUCHE: 3, DIATOMEE: 4 };
  const DESINF = { CHLORE: 1, CHLORE_LIQUIDE: 2, ELECTROLYSEUR: 3 };

  // Entretiens : les deux premiers se comptent en heures de filtration, le troisième en années
  function entretiens(profil) {
    const f = profil ? profil[P_FILTRE] : 0;
    return [
      { nom: f === FILTRE.CARTOUCHE ? 'Nettoyage de la cartouche' : 'Contre-lavage du filtre', heures: 60 },
      { nom: 'Nettoyage du préfiltre', heures: 30 },
      f === FILTRE.DIATOMEE ? null
        : f === FILTRE.CARTOUCHE ? { nom: 'Changement de la cartouche', ans: 2 }
        : f === FILTRE.VERRE ? { nom: 'Changement du verre filtrant', ans: 10 }
        : { nom: 'Changement du sable', ans: 5 }
    ];
  }

  // Configuration utilisée en ligne tant que le boîtier n'a pas envoyé la sienne
  function configParDefaut() {
    return {
      modele: 'Pooly Simply',
      capteurs: [{ id: 'eau', nom: 'Température de l’eau', unite: '°C', decimales: 1, principal: true }],
      sorties: [
        { id: 'pompe', nom: 'Pompe', on: 'En marche', off: 'Arrêtée', pompe: true },
        { id: 'eclairage', nom: 'Éclairage', on: 'Allumé', off: 'Éteint' }
      ],
      modes: ['pooly', 'auto', 'manuel', 'horsgel'],
      programmes: true, profil: true, entretien: true
    };
  }

  // ------------------------------------------------------------------
  //  Apparence
  // ------------------------------------------------------------------
  const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#eef4f5;color:#0f2a33;font-family:Archivo,system-ui,sans-serif}
.px-cx{min-height:100vh;display:grid;place-items:center;background:#0e2f3a;color:#fff;padding:16px}
.px-cx form{width:100%;max-width:340px;display:flex;flex-direction:column;gap:14px}
.px-cx h1{margin:0;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:800;font-size:44px;letter-spacing:.06em}
.px-cx .sous{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9fd9df;margin:-10px 0 10px}
.px-cx p{margin:0;font-size:14px;line-height:1.45;color:#cfe9ec}
.px-cx label{font-size:13px;color:#9fd9df;display:flex;flex-direction:column;gap:6px}
.px-cx input{font:inherit;font-size:16px;padding:12px;border-radius:10px;border:1px solid #2c5866;background:#12394a;color:#fff}
.px-cx button{font:inherit;font-weight:600;font-size:16px;min-height:48px;border:0;border-radius:10px;background:#3cc3d2;color:#0e2f3a}
.px-cx button.px-second{background:none;border:1px solid #2c5866;color:#9fd9df}
.px-err{background:#5a2316;color:#ffd7c9;padding:10px 12px;border-radius:10px;font-size:14px}
.px-app{max-width:440px;margin:0 auto;padding:20px 18px calc(96px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:14px}
.px-vue{display:flex;flex-direction:column;gap:14px}
.px-haut{display:flex;align-items:center;justify-content:space-between;gap:10px}
.px-marque{display:flex;align-items:center;gap:10px}
.px-marque b{display:block;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:800;font-size:30px;letter-spacing:.06em;line-height:1}
.px-marque small,.px-titre{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5b7279}
.px-etat{display:flex;align-items:center;gap:6px;font-size:13px;padding:6px 10px;border-radius:999px;background:#dff3ea;color:#2b6b52;white-space:nowrap}
.px-etat i{width:8px;height:8px;border-radius:50%;background:#1f8a5b}
.px-etat.off{background:#fbe9e2;color:#8a3415}.px-etat.off i{background:#c2471d}
.px-carte{background:#0e2f3a;color:#fff;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:14px}
.px-lib{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9fd9df}
.px-grand{display:flex;align-items:baseline;gap:6px;font-family:'Barlow Condensed',sans-serif}
.px-grand b{font-weight:700;font-size:84px;line-height:.85}.px-grand span{font-size:30px;color:#9fd9df}
.px-tuiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.px-tuiles div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;background:rgba(255,255,255,.08);border-radius:10px;min-width:0}
.px-tuiles small{font-size:12px;color:#9fd9df}
.px-tuiles strong{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:15px;overflow-wrap:anywhere}
.px-conseils{display:flex;flex-direction:column;gap:8px}
.px-conseil{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:14px;line-height:1.4;background:#fff;border:1px solid #d6e1e4}
.px-conseil i{flex:none;width:10px;height:10px;border-radius:50%;margin-top:5px;background:#1f8a5b}
.px-conseil.info i{background:#0a7f8f}
.px-conseil.attention{background:#fdf3dc;border-color:#f0d79a}.px-conseil.attention i{background:#c58a00}
.px-conseil.alerte{background:#fbe9e2;border-color:#f0b9a5}.px-conseil.alerte i{background:#c2471d}
.px-modes{display:grid;gap:6px;background:#dbe6e8;padding:4px;border-radius:12px}
.px-modes button{font:inherit;min-height:44px;border:0;border-radius:9px;font-weight:600;font-size:14px;background:none;color:#3f5a61;padding:0 4px}
.px-modes button[aria-pressed=true]{background:#0e2f3a;color:#fff}
.px-aide{font-size:13px;color:#5b7279;min-height:18px}
.px-liste{display:flex;flex-direction:column;gap:8px}
.px-ligne{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #d6e1e4;border-radius:14px;padding:12px 14px}
.px-ligne>div{display:flex;flex-direction:column;gap:2px;min-width:0}
.px-ligne b{font-weight:600}.px-ligne small{font-size:13px;color:#5b7279}
.px-ligne small.du{color:#8a3415;font-weight:600}
.px-inter{flex:none;position:relative;width:56px;height:32px;border:0;border-radius:999px;padding:0;background:#c4d3d7}
.px-inter::after{content:"";position:absolute;top:4px;left:4px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .15s}
.px-inter[aria-pressed=true]{background:#0a7f8f}.px-inter[aria-pressed=true]::after{left:28px}
.px-fait{flex:none;font:inherit;font-weight:600;font-size:14px;min-height:40px;padding:0 14px;border:1px solid #0a7f8f;border-radius:10px;background:#fff;color:#0a7f8f}
.px-bloc{display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid #d6e1e4;border-radius:14px;padding:16px}
.px-bloc h3{margin:0;font-size:16px;font-weight:600}
.px-bloc p{margin:0;font-size:13px;color:#5b7279;line-height:1.4}
.px-bloc label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#5b7279}
.px-bloc input,.px-bloc select{font:inherit;font-size:16px;padding:10px;border:1px solid #c4d3d7;border-radius:10px;background:#fff;color:#0f2a33;width:100%}
.px-bloc .px-cocher{flex-direction:row;align-items:center;gap:10px;font-size:15px;color:#0f2a33}
.px-bloc .px-cocher input{width:22px;height:22px;accent-color:#0a7f8f}
.px-deux{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.px-ok{font:inherit;font-weight:600;min-height:44px;border:0;border-radius:10px;background:#0e2f3a;color:#fff}
.px-msg{font-size:13px;color:#1f6b4a;min-height:18px}.px-msg.erreur{color:#8a3415}
.px-sortir{font:inherit;font-weight:600;min-height:44px;border:1px solid #c2471d;border-radius:10px;background:#fff;color:#8a3415}
button{cursor:pointer}button:focus-visible,input:focus,select:focus{outline:2px solid #3cc3d2;outline-offset:2px}
button:disabled{opacity:.6}
.px-cam{background:#0e2f3a;border-radius:14px;overflow:hidden}
.px-cam img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
.px-cam p{margin:0;padding:8px 12px;font-size:13px;color:#9fd9df}
.px-nav{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;background:#fff;border-top:1px solid #d6e1e4;padding:6px max(8px,env(safe-area-inset-left,0px)) calc(6px + env(safe-area-inset-bottom,0px)) max(8px,env(safe-area-inset-right,0px));z-index:5}
.px-nav div{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;width:100%;max-width:440px}
.px-nav button{font:inherit;font-size:12px;font-weight:600;min-height:52px;border:0;border-radius:10px;background:none;color:#5b7279;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
.px-nav button svg{width:22px;height:22px}
.px-nav button[aria-current=page]{color:#0a7f8f;background:#e3f2f4}
`;
  const LOGO = '<svg width="34" height="34" viewBox="0 0 58 58" aria-hidden="true"><circle cx="29" cy="29" r="27" fill="#0e2f3a"/><path d="M11 32c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M11 41c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="#3cc3d2" stroke-width="3.5" stroke-linecap="round"/><circle cx="29" cy="19" r="5" fill="#3cc3d2"/></svg>';
  const ICONES = {
    accueil: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    programmes: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    piscine: '<path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M8 13V5a2 2 0 0 1 4 0M16 13V5a2 2 0 0 0-4 0"/>',
    compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
  };
  const icone = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONES[n] + '</svg>';

  const lien = document.createElement('link');
  lien.rel = 'stylesheet';
  lien.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700;800&family=Archivo:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap';
  document.head.appendChild(lien);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  let racine = document.getElementById('app');
  if (!racine) { racine = document.createElement('div'); document.body.appendChild(racine); }
  racine.removeAttribute('style');

  // ------------------------------------------------------------------
  //  Outils
  // ------------------------------------------------------------------
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  const $ = (id) => document.getElementById(id);
  const nb = (v, d) => (v === null || v === undefined || isNaN(v)) ? '--' : Number(v).toFixed(d).replace('.', ',');
  function hhmm(m) {
    m = ((m % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function versMinutes(txt) {
    const p = /^(\d{1,2}):(\d{2})$/.exec(txt || '');
    return p ? Math.min(1439, Number(p[1]) * 60 + Number(p[2])) : null;
  }
  const dureePlage = (d, f) => d === f ? 0 : ((f - d + 1440) % 1440);
  function champ(texte, type, id) {
    const l = el('label', '', texte), i = el('input');
    i.type = type; i.id = id; l.append(i);
    return [l, i];
  }
  function message(zone, texte, erreur) { zone.className = 'px-msg' + (erreur ? ' erreur' : ''); zone.textContent = texte; }
  function memoire(cle, val) {
    try {
      if (val === undefined) return localStorage.getItem(cle);
      localStorage.setItem(cle, val);
    } catch (x) { /* stockage indisponible : on fait sans */ }
    return null;
  }
  function dureeTexte(min) {
    if (min < 60) return min + ' min';
    const h = Math.round(min / 60);
    return h < 48 ? h + ' h' : Math.round(h / 24) + ' jours';
  }

  class NonConnecte extends Error {}
  class AucunBoitier extends Error {}
  class Refus extends Error {}

  // ------------------------------------------------------------------
  //  Aiguillage : en ligne (Supabase) ou en local (boîtier)
  // ------------------------------------------------------------------
  const SB_CFG = window.POOLY_SUPABASE || null;
  const EN_LIGNE = !!SB_CFG;
  let sb = null, utilisateur = null, boitier = null, fiche = null, attente = [];

  async function api(url, corps) {
    if (EN_LIGNE) return apiEnLigne(url, corps);
    const opts = { cache: 'no-store', credentials: 'same-origin' };
    if (corps !== undefined) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      opts.body = corps;
    }
    const r = await fetch(url, opts);
    if (r.status === 401) throw new NonConnecte();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ---------------------------- En ligne ----------------------------
  function initSupabase() {
    if (sb) return true;
    if (!window.supabase || !SB_CFG.url || !SB_CFG.cle || SB_CFG.cle.indexOf('COLLE') === 0) return false;
    sb = window.supabase.createClient(SB_CFG.url, SB_CFG.cle);
    return true;
  }

  function verifier(r) {
    if (r.error) {
      const st = r.error.status || 0;
      if (st === 401 || r.error.code === 'PGRST301') throw new NonConnecte();
      if (r.error.code === '42501') throw new Refus(r.error.message);
      throw new Error(r.error.message || 'erreur');
    }
    return r.data;
  }

  async function moi() {
    const r = await sb.auth.getSession();
    const s = r.data && r.data.session;
    if (!s) throw new NonConnecte();
    utilisateur = s.user;
    return s.user;
  }

  async function apiEnLigne(url, corps) {
    const p = new URLSearchParams(corps || '');
    switch (url) {
      case '/login': {
        const r = await sb.auth.signInWithPassword({ email: p.get('login'), password: p.get('mdp') });
        if (r.error) {
          if (r.error.code === 'email_not_confirmed') throw new Error('confirmer');
          if (r.error.status === 400) throw new NonConnecte();
          throw new Error(r.error.message);
        }
        return { ok: true };
      }
      case '/logout':
        await sb.auth.signOut();
        boitier = null; fiche = null; attente = [];
        return { ok: true };
      case '/api/config': return configEnLigne();
      case '/api/etat': return etatEnLigne();
      case '/api/motdepasse': {
        const u = await moi();
        const r1 = await sb.auth.signInWithPassword({ email: u.email, password: p.get('a') });
        if (r1.error) return { ok: false };
        const r2 = await sb.auth.updateUser({ password: p.get('n') });
        if (r2.error) throw new Error(r2.error.message);
        return { ok: true };
      }
      default: return ordreEnLigne(url, p);
    }
  }

  async function configEnLigne() {
    const u = await moi();
    const liens = verifier(await sb.from('membres').select('boitier_id, role').eq('user_id', u.id));
    if (!liens || !liens.length) throw new AucunBoitier();
    const choisi = memoire('pooly-boitier');
    const l = liens.find((x) => x.boitier_id === choisi) || liens[0];
    const b = verifier(await sb.from('boitiers').select('id, nom, modele, numero_serie').eq('id', l.boitier_id).maybeSingle());
    if (!b) throw new AucunBoitier();
    boitier = { id: b.id, nom: b.nom, modele: b.modele, serie: b.numero_serie, role: l.role };
    memoire('pooly-boitier', b.id);
    await chargerFiche();
    const et = verifier(await sb.from('etats').select('donnees').eq('boitier_id', b.id).maybeSingle());
    const c = (et && et.donnees && et.donnees.config) || configParDefaut();
    c.modele = b.nom || b.modele || c.modele;
    return c;
  }

  async function chargerFiche() {
    try {
      const f = verifier(await sb.from('fiches_piscine').select('donnees').eq('boitier_id', boitier.id).maybeSingle());
      fiche = f && f.donnees ? f.donnees : null;
    } catch (x) {
      if (x instanceof NonConnecte) throw x;
      fiche = null;
    }
  }

  async function etatEnLigne() {
    if (!boitier) throw new NonConnecte();
    const r = verifier(await sb.from('etats').select('donnees, maj_le').eq('boitier_id', boitier.id).maybeSingle());
    const brut = r && r.donnees && r.donnees.etat;
    const e = Object.assign({ mode: 'pooly', capteurs: {}, sorties: {}, heures: 0, seuil: 5 }, brut || {});
    e.capteurs = Object.assign({}, e.capteurs);
    e.sorties = Object.assign({}, e.sorties);
    const maj = r && r.maj_le ? Date.parse(r.maj_le) : 0;
    if (!brut) e._jamais = true;
    else if (Date.now() - maj > 120000) e._depuis = Math.round((Date.now() - maj) / 60000);
    if (fiche && Array.isArray(fiche.profil)) e.profil = fiche.profil;
    e.compte = utilisateur ? utilisateur.email : '';
    // Les commandes pas encore prises en compte par le boîtier restent affichées
    attente = attente.filter((a) => Date.now() - a.ajoute < 90000 && maj < a.t);
    attente.forEach((a) => a.patch(e));
    return e;
  }

  const ORDRES = {
    '/api/mode': (p) => {
      const m = p.get('m');
      return { type: 'mode', cible: null, valeur: { mode: m }, patch: (e) => { e.mode = m; } };
    },
    '/api/sortie': (p) => {
      const s = p.get('s');
      const on = !(dernierEtat && dernierEtat.sorties && dernierEtat.sorties[s]);
      return { type: 'sortie', cible: s, valeur: { on: on }, patch: (e) => { e.sorties[s] = on ? 1 : 0; } };
    },
    '/api/programme': (p) => {
      const s = p.get('s'), v = (p.get('v') || '').split(',').map(Number);
      const estPompe = !!(cfg && cfg.sorties.some((x) => x.id === s && x.pompe));
      return {
        type: 'programme', cible: s, valeur: { v: v },
        patch: (e) => { if (estPompe) e.pp = v; else { e.ps = Object.assign({}, e.ps); e.ps[s] = v; } }
      };
    },
    '/api/entretien': (p) => {
      const i = Number(p.get('e')), t = p.get('t') ? Number(p.get('t')) : null;
      return {
        type: 'entretien', cible: String(i), valeur: { t: t },
        patch: (e) => { if (!e.ent) return; e.ent = e.ent.slice(); e.ent[i] = i === 2 ? t : e.sp; }
      };
    },
    '/api/profil': (p) => {
      const v = (p.get('v') || '').split(',').map(Number);
      return { type: 'profil', cible: null, valeur: { v: v }, patch: (e) => { e.profil = v; } };
    }
  };

  async function ordreEnLigne(url, p) {
    const fab = ORDRES[url];
    if (!fab || !boitier) throw new Error('commande inconnue');
    const o = fab(p);
    await moi();
    if (url === '/api/profil') await enregistrerFiche(o.valeur.v);
    // cree_par est rempli par la base (auth.uid()) : on ne l'envoie pas
    const r = verifier(await sb.from('ordres')
      .insert({ boitier_id: boitier.id, type: o.type, cible: o.cible, valeur: o.valeur })
      .select('cree_le').single());
    attente.push({ t: Date.parse(r.cree_le), ajoute: Date.now(), patch: o.patch });
    const e = JSON.parse(JSON.stringify(dernierEtat || {}));
    e.capteurs = e.capteurs || {}; e.sorties = e.sorties || {};
    o.patch(e);
    return e;
  }

  // Colonnes autorisées par la base : insert (boitier_id, donnees), update (donnees, maj_le)
  async function enregistrerFiche(v) {
    const donnees = Object.assign({}, fiche || {}, { profil: v });
    const lignes = verifier(await sb.from('fiches_piscine')
      .update({ donnees: donnees, maj_le: new Date().toISOString() })
      .eq('boitier_id', boitier.id).select('boitier_id'));
    if (!lignes || !lignes.length) {
      verifier(await sb.from('fiches_piscine').insert({ boitier_id: boitier.id, donnees: donnees }));
    }
    fiche = donnees;
  }

  // ------------------------------------------------------------------
  //  Connexion
  // ------------------------------------------------------------------
  let minuteries = [];
  function arreterMinuteries() { minuteries.forEach(clearInterval); minuteries = []; }
  function retirerNav() { const nav = document.querySelector('.px-nav'); if (nav) nav.remove(); }

  function afficherConnexion() {
    arreterMinuteries();
    retirerNav();
    document.title = 'POOLY · Connexion';
    racine.innerHTML = '';
    racine.className = 'px-cx';
    const f = el('form');
    f.append(el('h1', '', 'POOLY'), el('div', 'sous', 'Pilotage piscine'));
    const err = el('div', 'px-err'); err.hidden = true;
    const l1 = el('label', '', EN_LIGNE ? 'Adresse e-mail' : 'Identifiant');
    const i1 = el('input'); i1.name = 'login'; i1.id = 'px-login'; i1.required = true;
    i1.type = EN_LIGNE ? 'email' : 'text';
    i1.autocomplete = EN_LIGNE ? 'email' : 'username';
    i1.autocapitalize = 'none'; l1.append(i1);
    const l2 = el('label', '', 'Mot de passe');
    const i2 = el('input'); i2.name = 'mdp'; i2.id = 'px-mdp'; i2.type = 'password'; i2.autocomplete = 'current-password'; i2.required = true;
    l2.append(i2);
    const b = el('button', '', 'Se connecter'); b.type = 'submit';
    f.append(err, l1, l2, b);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      b.disabled = true; b.textContent = 'Connexion…';
      try {
        await api('/login', 'login=' + encodeURIComponent(i1.value.trim()) + '&mdp=' + encodeURIComponent(i2.value));
        demarrer();
      } catch (x) {
        if (x instanceof NonConnecte) err.textContent = EN_LIGNE ? 'E-mail ou mot de passe incorrect.' : 'Identifiant ou mot de passe incorrect.';
        else if (x.message === 'confirmer') err.textContent = 'Confirme d’abord ton adresse e-mail avec le lien reçu par mail.';
        else err.textContent = EN_LIGNE ? 'Impossible de joindre le serveur POOLY. Vérifie ta connexion internet.' : 'Le boîtier ne répond pas. Vérifie que tu es sur le Wi-Fi de la maison.';
        err.hidden = false;
        b.disabled = false; b.textContent = 'Se connecter';
      }
    });
    racine.append(f);
    i1.focus();
  }

  // Compte en ligne sans boîtier : on le relie avec le numéro de série et le code d'installation
  function afficherReclamer() {
    arreterMinuteries();
    retirerNav();
    document.title = 'POOLY · Ajouter mon boîtier';
    racine.innerHTML = '';
    racine.className = 'px-cx';
    const f = el('form');
    f.append(el('h1', '', 'POOLY'), el('div', 'sous', 'Ajouter mon boîtier'),
      el('p', '', 'Ton compte n’est relié à aucun boîtier. Saisis le numéro de série et le code d’installation inscrits sur l’étiquette du boîtier.'));
    const err = el('div', 'px-err'); err.hidden = true;
    const l1 = el('label', '', 'Numéro de série');
    const i1 = el('input'); i1.required = true; i1.autocapitalize = 'characters'; i1.autocomplete = 'off'; l1.append(i1);
    const l2 = el('label', '', 'Code d’installation');
    const i2 = el('input'); i2.required = true; i2.autocomplete = 'off'; l2.append(i2);
    const b = el('button', '', 'Relier ce boîtier'); b.type = 'submit';
    const sortir = el('button', 'px-second', 'Se déconnecter'); sortir.type = 'button';
    sortir.onclick = async () => { try { await api('/logout', ''); } catch (x) { /* déjà sorti */ } afficherConnexion(); };
    f.append(err, l1, l2, b, sortir);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      b.disabled = true; b.textContent = 'Vérification…';
      try {
        verifier(await sb.rpc('reclamer_boitier', { p_serie: i1.value.trim(), p_code: i2.value.trim() }));
        demarrer();
      } catch (x) {
        if (x instanceof NonConnecte) { afficherConnexion(); return; }
        err.textContent = 'Numéro de série ou code incorrect, ou boîtier déjà relié à un autre compte.';
        err.hidden = false;
        b.disabled = false; b.textContent = 'Relier ce boîtier';
      }
    });
    racine.append(f);
    i1.focus();
  }

  // ------------------------------------------------------------------
  //  Construction des écrans
  // ------------------------------------------------------------------
  let cfg = null, dernierEtat = null, meteo = null, ongletActif = 'accueil';
  const vues = {};

  function normaliserModes(liste) {
    return (liste || []).map((m) => typeof m === 'string'
      ? { id: m, nom: (MODES[m] || {}).nom || m, aide: (MODES[m] || {}).aide || '' }
      : m);
  }

  function construire() {
    document.title = 'POOLY';
    retirerNav();
    racine.innerHTML = '';
    racine.className = 'px-app';
    cfg.modes = normaliserModes(cfg.modes);
    cfg.principal = cfg.capteurs.find((c) => c.principal) || cfg.capteurs[0];

    const haut = el('div', 'px-haut');
    const marque = el('div', 'px-marque');
    marque.innerHTML = LOGO;
    const nomBloc = el('div');
    nomBloc.append(el('b', '', 'POOLY'), el('small', '', cfg.modele || ''));
    marque.append(nomBloc);
    const etat = el('div', 'px-etat'); etat.id = 'px-etat';
    etat.append(el('i'), el('span', '', 'Connexion…'));
    haut.append(marque, etat);
    racine.append(haut);

    vues.accueil = vueAccueil();
    vues.programmes = cfg.programmes ? vueProgrammes() : null;
    vues.piscine = vuePiscine();
    vues.compte = vueCompte();
    Object.values(vues).forEach((v) => { if (v) { v.hidden = true; racine.append(v); } });

    const nav = el('nav', 'px-nav'); nav.setAttribute('aria-label', 'Rubriques');
    const rangee = el('div');
    [['accueil', 'Accueil'], ['programmes', 'Programmes'], ['piscine', 'Piscine'], ['compte', 'Compte']].forEach(([id, nom]) => {
      if (!vues[id]) return;
      const b = el('button'); b.type = 'button'; b.dataset.onglet = id;
      b.innerHTML = icone(id); b.append(el('span', '', nom));
      b.onclick = () => ouvrir(id);
      rangee.append(b);
    });
    rangee.style.gridTemplateColumns = 'repeat(' + rangee.children.length + ',minmax(0,1fr))';
    nav.append(rangee);
    document.body.append(nav);
    ouvrir(ongletActif);
  }

  function ouvrir(id) {
    if (!vues[id]) id = 'accueil';
    ongletActif = id;
    Object.entries(vues).forEach(([k, v]) => { if (v) v.hidden = k !== id; });
    document.querySelectorAll('[data-onglet]').forEach((b) => {
      if (b.dataset.onglet === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (dernierEtat) remplirFormulaires(dernierEtat);
    window.scrollTo(0, 0);
  }

  // ---------------------------- Accueil -----------------------------
  function vueAccueil() {
    const v = el('div', 'px-vue');
    const p = cfg.principal;
    const carte = el('div', 'px-carte');
    carte.append(el('div', 'px-lib', p ? p.nom : ''));
    const grand = el('div', 'px-grand');
    const gv = el('b', '', '--'); gv.id = 'px-principal';
    grand.append(gv, el('span', '', p ? p.unite : ''));
    const tuiles = el('div', 'px-tuiles');
    const tuile = (id, titre) => {
      const d = el('div'); d.append(el('small', '', titre));
      const s = el('strong', '', '--'); s.id = id; d.append(s); tuiles.append(d);
    };
    tuile('px-filtration', 'Filtration aujourd’hui');
    cfg.capteurs.filter((c) => c !== p).forEach((c) => tuile('px-c-' + c.id, c.nom));
    if (cfg.lat && cfg.lon && Number(cfg.lat) !== 0 && !cfg.capteurs.some((c) => c.id === 'air')) tuile('px-meteo', 'Air extérieur');
    carte.append(grand, tuiles);

    const conseils = el('div', 'px-conseils'); conseils.id = 'px-conseils';

    const modes = el('div', 'px-modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Mode de la pompe');
    modes.style.gridTemplateColumns = 'repeat(' + cfg.modes.length + ',minmax(0,1fr))';
    cfg.modes.forEach((m) => {
      const b = el('button', '', m.nom); b.type = 'button'; b.dataset.mode = m.id;
      b.onclick = () => envoyer('/api/mode', 'm=' + m.id);
      modes.append(b);
    });
    const aide = el('div', 'px-aide'); aide.id = 'px-aide';

    const sorties = el('div', 'px-liste');
    cfg.sorties.forEach((s) => {
      const ligne = el('div', 'px-ligne'), txt = el('div');
      const st = el('small', '', '--'); st.id = 'px-s-' + s.id;
      txt.append(el('b', '', s.nom), st);
      const b = el('button', 'px-inter'); b.type = 'button'; b.dataset.sortie = s.id;
      b.setAttribute('aria-label', s.nom);
      b.onclick = () => envoyer('/api/sortie', 's=' + s.id);
      ligne.append(txt, b);
      sorties.append(ligne);
    });

    v.append(carte, el('div', 'px-titre', 'Assistant'), conseils,
      el('div', 'px-titre', 'Mode de la pompe'), modes, aide, el('div', 'px-titre', 'Sorties'), sorties);

    if (cfg.cameras && cfg.cameras.length) {
      v.append(el('div', 'px-titre', 'Caméra'));
      cfg.cameras.forEach((c) => {
        const d = el('div', 'px-cam'), img = el('img'), legende = el('p', '', c.nom);
        img.src = c.url; img.alt = c.nom;
        img.onerror = () => { legende.textContent = c.nom + ' · caméra injoignable'; };
        d.append(img, legende);
        v.append(d);
      });
    }
    return v;
  }

  // --------------------------- Programmes ---------------------------
  function vueProgrammes() {
    const v = el('div', 'px-vue');
    v.append(el('div', 'px-titre', 'Programmes horaires'));

    const bloc = el('form', 'px-bloc');
    bloc.append(el('h3', '', 'Filtration en mode Auto'),
      el('p', '', 'Deux plages par jour. Mets la même heure au début et à la fin pour ne pas utiliser une plage.'));
    const entrees = [];
    [1, 2].forEach((n) => {
      const ligne = el('div', 'px-deux');
      const [l1, d] = champ('Plage ' + n + ' : début', 'time', 'px-pp-d' + n);
      const [l2, f] = champ('Plage ' + n + ' : fin', 'time', 'px-pp-f' + n);
      ligne.append(l1, l2); bloc.append(ligne); entrees.push(d, f);
    });
    const total = el('p'); total.id = 'px-pp-total';
    const msg = el('div', 'px-msg'); msg.setAttribute('role', 'status');
    const ok = el('button', 'px-ok', 'Enregistrer'); ok.type = 'submit';
    bloc.append(total, msg, ok);
    const majTotal = () => {
      const m = entrees.map((i) => versMinutes(i.value));
      if (m.some((x) => x === null)) { total.textContent = ''; return; }
      const h = (dureePlage(m[0], m[1]) + dureePlage(m[2], m[3])) / 60;
      total.textContent = 'Total : ' + nb(h, h % 1 ? 1 : 0) + ' h de filtration par jour.';
    };
    entrees.forEach((i) => i.addEventListener('input', majTotal));
    bloc.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const m = entrees.map((i) => versMinutes(i.value));
      if (m.some((x) => x === null)) { message(msg, 'Remplis les quatre heures.', true); return; }
      const pompe = cfg.sorties.find((s) => s.pompe);
      if (await envoyer('/api/programme', 's=' + pompe.id + '&v=' + encodeURIComponent(m.join(',')))) {
        message(msg, dernierEtat.mode === 'auto' ? 'Horaires enregistrés.' : 'Horaires enregistrés. Ils s’appliquent quand la pompe est en mode Auto.');
      } else message(msg, texteEchec(), true);
    });
    v.append(bloc);

    cfg.sorties.filter((s) => !s.pompe).forEach((s) => {
      const f = el('form', 'px-bloc');
      f.append(el('h3', '', s.nom));
      const lc = el('label', 'px-cocher');
      const actif = el('input'); actif.type = 'checkbox'; actif.id = 'px-ps-a-' + s.id;
      lc.append(actif, document.createTextNode('Allumer et éteindre automatiquement'));
      const ligne = el('div', 'px-deux');
      const [l1, d] = champ('Allumage', 'time', 'px-ps-d-' + s.id);
      const [l2, fi] = champ('Extinction', 'time', 'px-ps-f-' + s.id);
      ligne.append(l1, l2);
      const note = el('p', '', 'Tu peux toujours l’allumer ou l’éteindre depuis l’accueil : le programme reprend la main à l’heure suivante.');
      const m2 = el('div', 'px-msg'); m2.setAttribute('role', 'status');
      const b = el('button', 'px-ok', 'Enregistrer'); b.type = 'submit';
      f.append(lc, ligne, note, m2, b);
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const dm = versMinutes(d.value), fm = versMinutes(fi.value);
        if (dm === null || fm === null) { message(m2, 'Indique l’heure d’allumage et d’extinction.', true); return; }
        if (await envoyer('/api/programme', 's=' + s.id + '&v=' + encodeURIComponent([actif.checked ? 1 : 0, dm, fm].join(',')))) {
          message(m2, actif.checked ? 'Programme activé : ' + hhmm(dm) + ' à ' + hhmm(fm) + '.' : 'Programme désactivé.');
        } else message(m2, texteEchec(), true);
      });
      v.append(f);
    });
    return v;
  }

  // ---------------------------- Piscine -----------------------------
  function vuePiscine() {
    const v = el('div', 'px-vue');
    if (cfg.profil) {
      v.append(el('div', 'px-titre', 'Ma piscine'));
      const f = el('form', 'px-bloc');
      f.append(el('p', '', 'Ces informations servent à l’assistant pour te donner des conseils adaptés.'));
      const [lv, vol] = champ('Volume d’eau (m³)', 'number', 'px-profil-0');
      vol.min = 1; vol.max = 2000; vol.inputMode = 'numeric';
      f.append(lv);
      Object.keys(CHOIX).forEach((k) => {
        const c = CHOIX[k];
        const l = el('label', '', c.nom), s = el('select'); s.id = 'px-profil-' + k;
        s.append(new Option('Non renseigné', '0'));
        c.options.forEach((o, i) => s.append(new Option(o, String(i + 1))));
        l.append(s); f.append(l);
      });
      const msg = el('div', 'px-msg'); msg.setAttribute('role', 'status');
      const ok = el('button', 'px-ok', 'Enregistrer'); ok.type = 'submit';
      f.append(msg, ok);
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const valeurs = [0, 0, 0, 0, 0, 0, 0, 0];
        const vv = Math.round(Number(vol.value) || 0);
        if (vol.value && (vv < 1 || vv > 2000)) { message(msg, 'Le volume doit être entre 1 et 2000 m³.', true); return; }
        valeurs[P_VOLUME] = vv;
        Object.keys(CHOIX).forEach((k) => { valeurs[k] = Number($('px-profil-' + k).value); });
        if (dernierEtat && dernierEtat.profil) valeurs[7] = dernierEtat.profil[7] || 0;
        if (await envoyer('/api/profil', 'v=' + encodeURIComponent(valeurs.join(',')))) message(msg, 'Fiche enregistrée.');
        else message(msg, EN_LIGNE ? 'Fiche non enregistrée : seul le propriétaire peut la modifier, ou la connexion a échoué.' : texteEchec(), true);
      });
      v.append(f);
    }

    if (cfg.entretien) {
      v.append(el('div', 'px-titre', 'Entretien'));
      const liste = el('div', 'px-liste'); liste.id = 'px-entretien';
      v.append(liste);
    }
    return v;
  }

  function afficherEntretien(e) {
    const liste = $('px-entretien');
    if (!liste || !e.ent) return;
    liste.innerHTML = '';
    entretiens(e.profil).forEach((x, i) => {
      if (!x) return;
      const ligne = el('div', 'px-ligne'), txt = el('div'), st = el('small');
      if (x.heures) {
        const h = Math.max(0, (e.sp - e.ent[i]) / 3600);
        st.textContent = Math.round(h) + ' h de filtration depuis le dernier · tous les ' + x.heures + ' h';
        if (h >= x.heures) st.className = 'du';
      } else if (!e.ent[2]) {
        st.textContent = 'Date du dernier changement inconnue · tous les ' + x.ans + ' ans';
      } else {
        const d = new Date(e.ent[2] * 1000);
        const prochain = new Date(d); prochain.setFullYear(d.getFullYear() + x.ans);
        st.textContent = 'Fait le ' + d.toLocaleDateString('fr-FR') + ' · prochain en ' + prochain.getFullYear();
        if (Date.now() >= prochain.getTime()) st.className = 'du';
      }
      txt.append(el('b', '', x.nom), st);
      const fait = el('button', 'px-fait', 'Fait'); fait.type = 'button';
      fait.onclick = () => {
        if (!confirm('Enregistrer « ' + x.nom.toLowerCase() + ' » comme fait aujourd’hui ?')) return;
        envoyer('/api/entretien', 'e=' + i + (i === 2 ? '&t=' + Math.floor(Date.now() / 1000) : ''));
      };
      ligne.append(txt, fait);
      liste.append(ligne);
    });
    if (e.profil && !e.profil[P_FILTRE]) liste.append(el('div', 'px-aide', 'Choisis ton type de filtre dans la fiche pour des rappels adaptés.'));
  }

  // ----------------------------- Compte -----------------------------
  const ROLES = { proprietaire: 'propriétaire', famille: 'famille', location: 'location' };

  function vueCompte() {
    const v = el('div', 'px-vue');
    v.append(el('div', 'px-titre', 'Compte'));
    const info = el('div', 'px-bloc');
    const qui = el('h3'); qui.id = 'px-qui';
    const boitierTxt = el('p', '', (cfg.modele || 'POOLY') + (cfg.version ? ' · boîtier ' + cfg.version : '') + ' · interface ' + WEB_VERSION);
    info.append(qui, boitierTxt);
    if (EN_LIGNE && boitier) {
      info.append(el('p', '', 'Accès : ' + (ROLES[boitier.role] || boitier.role) + (boitier.serie ? ' · n° ' + boitier.serie : '')));
    }
    const heure = el('p'); heure.id = 'px-heure';
    info.append(heure);

    const mini = EN_LIGNE ? 8 : 6, maxi = EN_LIGNE ? 72 : 22;
    const f = el('form', 'px-bloc');
    f.append(el('h3', '', 'Changer mon mot de passe'));
    const champs = [['px-mdp-a', 'Mot de passe actuel', 'current-password'],
                    ['px-mdp-n', EN_LIGNE ? 'Nouveau (8 caractères minimum)' : 'Nouveau (6 à 22 caractères)', 'new-password'],
                    ['px-mdp-c', 'Nouveau, encore une fois', 'new-password']].map(([id, txt, ac]) => {
      const [l, i] = champ(txt, 'password', id);
      i.autocomplete = ac; i.required = true; f.append(l); return i;
    });
    const msg = el('div', 'px-msg'); msg.setAttribute('role', 'status');
    const b = el('button', 'px-ok', 'Enregistrer'); b.type = 'submit';
    f.append(msg, b);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const [a, n, c] = champs.map((i) => i.value);
      if (n.length < mini || n.length > maxi) {
        message(msg, EN_LIGNE ? 'Le nouveau mot de passe doit faire au moins 8 caractères.' : 'Le nouveau mot de passe doit faire entre 6 et 22 caractères.', true);
        return;
      }
      if (n !== c) { message(msg, 'Les deux nouveaux mots de passe ne sont pas identiques.', true); return; }
      b.disabled = true;
      try {
        const r = await api('/api/motdepasse', 'a=' + encodeURIComponent(a) + '&n=' + encodeURIComponent(n));
        if (r.ok) { message(msg, 'Mot de passe enregistré.'); champs.forEach((i) => { i.value = ''; }); }
        else message(msg, 'Le mot de passe actuel est incorrect.', true);
      } catch (x) {
        if (x instanceof NonConnecte) { afficherConnexion(); return; }
        message(msg, texteEchec(), true);
      }
      b.disabled = false;
    });

    const sortir = el('button', 'px-sortir', 'Se déconnecter'); sortir.type = 'button';
    sortir.onclick = async () => { try { await api('/logout', ''); } catch (x) { /* déjà déconnecté */ } afficherConnexion(); };
    v.append(info, f, sortir);
    return v;
  }

  function texteEchec() {
    return EN_LIGNE ? 'Envoi impossible : vérifie ta connexion internet et réessaie.' : 'Le boîtier ne répond pas, réessaie.';
  }

  // ------------------------------------------------------------------
  //  Mise à jour des écrans
  // ------------------------------------------------------------------
  function plageTexte(e) {
    if (e.plage) return e.plage;
    if (e.debut === undefined) return '';
    return hhmm(e.debut) + ' à ' + hhmm(e.debut + e.heures * 60);
  }
  function heureTexte(e) {
    if (e.heure) return e.heure;
    return (e.minutes === undefined || e.minutes < 0) ? 'heure en attente' : hhmm(e.minutes);
  }
  function autoTexte(e) {
    if (!e.pp) return '';
    const t = [];
    if (e.pp[0] !== e.pp[1]) t.push(hhmm(e.pp[0]) + '–' + hhmm(e.pp[1]));
    if (e.pp[2] !== e.pp[3]) t.push(hhmm(e.pp[2]) + '–' + hhmm(e.pp[3]));
    return t.length ? t.join(' et ') : 'aucune plage réglée';
  }
  function heuresAuto(e) { return e.pp ? (dureePlage(e.pp[0], e.pp[1]) + dureePlage(e.pp[2], e.pp[3])) / 60 : 0; }

  function afficher(e) {
    dernierEtat = e;
    const etat = $('px-etat');
    if (!etat) return;
    const absent = e._jamais || e._depuis !== undefined;
    etat.className = 'px-etat' + (absent ? ' off' : '');
    etat.lastChild.textContent = e._jamais ? 'En attente' : absent ? 'Boîtier hors ligne' : 'Connecté';
    const p = cfg.principal;
    if (p) $('px-principal').textContent = nb(e.capteurs[p.id], p.decimales);
    const hFiltre = e.mode === 'auto' ? heuresAuto(e) : e.heures;
    $('px-filtration').textContent = e.mode === 'manuel' ? 'manuelle' : nb(hFiltre, hFiltre % 1 ? 1 : 0) + ' h';
    cfg.capteurs.filter((c) => c !== p).forEach((c) => {
      const v = e.capteurs[c.id];
      let t = (v === null || v === undefined) ? '--' : nb(v, c.decimales) + ' ' + c.unite;
      if (e.details && e.details[c.id] && v !== null) t += ' · ' + e.details[c.id];
      $('px-c-' + c.id).textContent = t;
    });

    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === e.mode));
    const m = cfg.modes.find((x) => x.id === e.mode);
    $('px-aide').textContent = m ? m.aide.replace('{heures}', e.heures).replace(/\{plage\}/g, plageTexte(e))
      .replace('{seuil}', e.seuil).replace('{auto}', autoTexte(e)) : '';

    cfg.sorties.forEach((s) => {
      const on = !!e.sorties[s.id];
      const bouton = document.querySelector('[data-sortie="' + s.id + '"]');
      if (bouton) bouton.setAttribute('aria-pressed', on);
      let t = on ? s.on : s.off;
      if (s.pompe && e.mode !== 'manuel') t += ' · auto';
      const prog = e.ps && e.ps[s.id];
      if (prog && prog[0]) t += ' · programmé ' + hhmm(prog[1]) + '–' + hhmm(prog[2]);
      $('px-s-' + s.id).textContent = t;
    });

    afficherEntretien(e);
    const qui = $('px-qui'); if (qui) qui.textContent = 'Connecté en tant que « ' + (e.compte || '') + ' »';
    const heure = $('px-heure'); if (heure) heure.textContent = e._jamais ? '' : 'Heure du boîtier : ' + heureTexte(e);
    afficherConseils();
  }

  function remplirFormulaires(e) {
    if (e.pp) {
      ['px-pp-d1', 'px-pp-f1', 'px-pp-d2', 'px-pp-f2'].forEach((id, i) => { const c = $(id); if (c) c.value = hhmm(e.pp[i]); });
      const c = $('px-pp-d1'); if (c) c.dispatchEvent(new Event('input'));
    }
    if (e.ps) Object.keys(e.ps).forEach((id) => {
      const [a, d, f] = e.ps[id];
      if ($('px-ps-a-' + id)) { $('px-ps-a-' + id).checked = !!a; $('px-ps-d-' + id).value = hhmm(d); $('px-ps-f-' + id).value = hhmm(f); }
    });
    if (e.profil) {
      const vol = $('px-profil-0'); if (vol) vol.value = e.profil[P_VOLUME] || '';
      Object.keys(CHOIX).forEach((k) => {
        const s = $('px-profil-' + k);
        if (s) s.value = String(e.profil[k] <= CHOIX[k].options.length ? e.profil[k] : 0);
      });
    }
  }

  // ------------------------------------------------------------------
  //  Météo (c'est le téléphone qui la demande, pas le boîtier)
  // ------------------------------------------------------------------
  function texteMeteo(c) {
    if (c === null || c === undefined) return '';
    if (c === 0) return 'ensoleillé';
    if (c <= 2) return 'éclaircies';
    if (c === 3) return 'couvert';
    if (c <= 48) return 'brouillard';
    if (c <= 67) return 'pluie';
    if (c <= 77) return 'neige';
    if (c <= 82) return 'averses';
    return 'orage';
  }
  async function chargerMeteo() {
    if (!cfg || !cfg.lat || !cfg.lon || (Number(cfg.lat) === 0 && Number(cfg.lon) === 0)) return;
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.lat + '&longitude=' + cfg.lon +
        '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=3&timezone=auto';
      const r = await fetch(url);
      if (!r.ok) return;
      const j = await r.json();
      meteo = {
        t: j.current.temperature_2m, code: j.current.weather_code,
        max: j.daily.temperature_2m_max, min: j.daily.temperature_2m_min, codes: j.daily.weather_code
      };
      const tuile = $('px-meteo');
      if (tuile) tuile.textContent = Math.round(meteo.t) + ' °C · ' + texteMeteo(meteo.code);
      afficherConseils();
    } catch (x) { /* pas de météo : l'assistant fera sans */ }
  }

  // ------------------------------------------------------------------
  //  Assistant
  // ------------------------------------------------------------------
  function conseilChoc(e) {
    const pr = e.profil || [];
    if (pr[P_DESINF] === DESINF.CHLORE && pr[P_VOLUME]) {
      const v = pr[P_VOLUME];
      return ' Pour un traitement choc au chlore, on compte en général 10 à 20 g par m³, soit environ ' +
        Math.round(v * 10) + ' à ' + Math.round(v * 20) + ' g pour tes ' + v + ' m³ : suis la notice de ton produit.';
    }
    if (pr[P_DESINF] === DESINF.ELECTROLYSEUR) return ' Avec ton électrolyseur, lance le mode « boost » ou « choc » s’il en a un.';
    return '';
  }

  function calculerConseils(e) {
    if (e._jamais) {
      return [['alerte', 'Ton boîtier ne s’est encore jamais connecté. Branche-le et vérifie qu’il a accès au Wi-Fi : ses données apparaîtront ici.']];
    }
    const c = [];
    if (e._depuis !== undefined) {
      c.push(['alerte', 'Le boîtier ne donne plus de nouvelles depuis ' + dureeTexte(e._depuis) +
        ' : vérifie son alimentation et son Wi-Fi. Tes commandes seront appliquées à son retour.']);
    }
    const pr = e.profil || [];
    const eau = e.capteurs ? e.capteurs.eau : null;
    const pompe = cfg.sorties.find((s) => s.pompe);
    const pompeOn = pompe ? !!e.sorties[pompe.id] : false;

    if (eau === null || eau === undefined) {
      c.push(['alerte', 'La sonde d’eau ne répond pas : vérifie son câble et son branchement. En attendant, la filtration Pooly est de ' + e.heures + ' h par jour.']);
    } else {
      if (eau >= 28) c.push(['attention', 'Eau à ' + nb(eau, 1) + ' °C : risque d’algues. Contrôle le désinfectant et le pH plus souvent.' + conseilChoc(e)]);
      if (eau < 12 && e.mode !== 'horsgel') c.push(['info', 'Eau sous 12 °C : c’est le moment de penser à l’hivernage et au mode Hors-gel.']);
      if (eau < (e.seuil || 5) && e.mode === 'manuel' && !pompeOn) c.push(['alerte', 'Eau très froide et pompe arrêtée : passe en mode Hors-gel pour protéger les canalisations.']);
      if (pr[P_DESINF] === DESINF.ELECTROLYSEUR && eau < 15) c.push(['info', 'Eau sous 15 °C : la plupart des électrolyseurs produisent mal en dessous. Passe-le en mode hiver ou coupe-le, selon sa notice.']);
      if (pr[P_PH] === 1 && eau >= 20) c.push(['info', 'Saison de baignade : contrôle le pH et le désinfectant chaque semaine (pH idéal entre 7,0 et 7,4).']);
    }

    if (e.mode === 'auto') {
      const h = heuresAuto(e);
      if (h === 0) c.push(['alerte', 'Mode Auto sans aucune plage horaire : la pompe ne tournera pas. Règle tes horaires dans l’onglet Programmes.']);
      else if (eau !== null && eau !== undefined && h < e.heures - 2) {
        c.push(['attention', 'Tes horaires donnent ' + nb(h, h % 1 ? 1 : 0) + ' h de filtration par jour, alors qu’une eau à ' + nb(eau, 0) + ' °C en demande environ ' + e.heures + ' h.']);
      }
    }

    if (meteo) {
      const gel = Math.min.apply(null, meteo.min);
      const chaud = Math.max.apply(null, meteo.max);
      if (gel < 1 && e.mode !== 'horsgel') c.push(['alerte', 'Gel annoncé (' + Math.round(gel) + ' °C) dans les 3 jours : passe en mode Hors-gel.']);
      if (chaud >= 33) c.push(['info', 'Fortes chaleurs annoncées (' + Math.round(chaud) + ' °C) : l’eau va se réchauffer vite, surveille le désinfectant.']);
      if (meteo.codes.some((x) => x >= 95)) c.push(['info', 'Orage annoncé : après le passage, contrôle l’eau et fais un traitement choc si elle se trouble.' + conseilChoc(e)]);
    }

    if (e.mode === 'manuel' && pompe && !pompeOn) c.push(['attention', 'Pompe arrêtée en mode Manuel : pense à repasser en mode Pooly ou Auto pour que la filtration reprenne.']);

    if (cfg.entretien && e.ent) {
      entretiens(pr).forEach((x, i) => {
        if (!x) return;
        if (x.heures) {
          const h = (e.sp - e.ent[i]) / 3600;
          if (h >= x.heures) c.push(['attention', x.nom + ' à faire : ' + Math.round(h) + ' h de filtration depuis le dernier.']);
        } else if (e.ent[2]) {
          const ans = (Date.now() / 1000 - e.ent[2]) / 31557600;
          if (ans >= x.ans) c.push(['info', x.nom + ' : le dernier date de plus de ' + x.ans + ' ans, prévois-le.']);
        }
      });
    }

    if (cfg.profil && (!pr[P_VOLUME] || !pr[P_DESINF] || !pr[P_FILTRE])) {
      c.push(['info', 'Remplis la fiche « Ma piscine » (onglet Piscine) pour des conseils adaptés à ton bassin.']);
    }

    if (heureTexte(e) === 'heure en attente') c.push(['info', 'Le boîtier n’a pas encore reçu l’heure : vérifie son accès à internet. En attendant, la pompe filtre en continu.']);

    if (!c.some((x) => x[0] !== 'info')) c.unshift(['ok', 'Tout va bien. Rien d’urgent à faire.']);
    const ordre = { alerte: 0, attention: 1, ok: 2, info: 3 };
    return c.sort((a, b) => ordre[a[0]] - ordre[b[0]]);
  }

  function afficherConseils() {
    if (!dernierEtat) return;
    const zone = $('px-conseils');
    if (!zone) return;
    zone.innerHTML = '';
    calculerConseils(dernierEtat).forEach(([niveau, texte]) => {
      const d = el('div', 'px-conseil ' + niveau);
      d.append(el('i'), el('span', '', texte));
      zone.append(d);
    });
  }

  // ------------------------------------------------------------------
  //  Échanges
  // ------------------------------------------------------------------
  function horsLigne() {
    const etat = $('px-etat');
    if (etat) { etat.className = 'px-etat off'; etat.lastChild.textContent = EN_LIGNE ? 'Sans connexion' : 'Hors ligne'; }
  }
  async function charger() {
    try { afficher(await api('/api/etat')); }
    catch (x) { if (x instanceof NonConnecte) afficherConnexion(); else horsLigne(); }
  }
  // Renvoie vrai si la commande a été acceptée
  async function envoyer(url, corps) {
    try {
      const e = await api(url, corps);
      afficher(e);
      remplirFormulaires(e);
      return true;
    } catch (x) {
      if (x instanceof NonConnecte) afficherConnexion(); else charger();
      return false;
    }
  }

  async function demarrer() {
    if (EN_LIGNE && !initSupabase()) {
      racine.className = 'px-cx';
      racine.textContent = 'Configuration incomplète : la clé Supabase manque dans index.html.';
      return;
    }
    try {
      cfg = await api('/api/config');
    } catch (x) {
      if (x instanceof NonConnecte) { afficherConnexion(); return; }
      if (x instanceof AucunBoitier) { afficherReclamer(); return; }
      retirerNav();
      racine.className = 'px-app';
      racine.textContent = EN_LIGNE
        ? 'Impossible de joindre le serveur POOLY. Vérifie ta connexion internet, puis recharge la page.'
        : 'Le boîtier ne répond pas. Vérifie que tu es sur le Wi-Fi de la maison, puis recharge la page.';
      return;
    }
    construire();
    await charger();
    if (dernierEtat) remplirFormulaires(dernierEtat);
    chargerMeteo();
    arreterMinuteries();
    minuteries.push(setInterval(charger, 5000), setInterval(chargerMeteo, 30 * 60 * 1000));
  }

  demarrer();
})();
