/*
  POOLY — interface commune à tous les boîtiers (Uno, Mega, R4 WiFi)
  ------------------------------------------------------------------
  Ce fichier est hébergé sur internet (GitHub Pages). Le boîtier ne sert
  qu'une page de lancement qui le charge ; le téléphone le garde en cache.
  Tout se passe ici : connexion, écran, assistant, entretien, météo.
  Le boîtier ne fournit que ses données (/api/config, /api/etat).
*/
(function () {
  'use strict';

  // ------------------------------------------------------------------
  //  Réglages communs à toute la gamme
  // ------------------------------------------------------------------
  const MODES = {
    pooly:   { nom: 'Pooly',    aide: 'Filtration automatique : {heures} h par jour, de {plage}.' },
    manuel:  { nom: 'Manuel',   aide: 'Tu commandes la pompe toi-même.' },
    horsgel: { nom: 'Hors-gel', aide: 'Pompe en continu si l’eau descend sous {seuil} °C, sinon programme Pooly ({plage}).' }
  };
  const ENTRETIENS = [
    { nom: 'Contre-lavage du filtre', heures: 60 },
    { nom: 'Nettoyage du préfiltre',  heures: 30 },
    { nom: 'Changement du média filtrant' }   // sable 5 ans, verre 10 ans
  ];
  const DUREE_MEDIA = [5, 10];               // années : sable, verre
  const NOM_MEDIA = ['sable', 'verre'];

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
.px-cx label{font-size:13px;color:#9fd9df;display:flex;flex-direction:column;gap:6px}
.px-cx input{font:inherit;font-size:16px;padding:12px;border-radius:10px;border:1px solid #2c5866;background:#12394a;color:#fff}
.px-cx button{font:inherit;font-weight:600;font-size:16px;min-height:48px;border:0;border-radius:10px;background:#3cc3d2;color:#0e2f3a}
.px-err{background:#5a2316;color:#ffd7c9;padding:10px 12px;border-radius:10px;font-size:14px}
.px-app{max-width:440px;margin:0 auto;padding:20px 18px 28px;display:flex;flex-direction:column;gap:14px}
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
.px-modes button{font:inherit;min-height:44px;border:0;border-radius:9px;font-weight:600;font-size:15px;background:none;color:#3f5a61}
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
.px-media{display:flex;gap:6px;margin-top:4px}
.px-media button{font:inherit;font-size:13px;min-height:32px;padding:0 10px;border:1px solid #c4d3d7;border-radius:8px;background:#fff;color:#3f5a61}
.px-media button[aria-pressed=true]{background:#0e2f3a;border-color:#0e2f3a;color:#fff}
button{cursor:pointer}button:focus-visible,input:focus{outline:2px solid #3cc3d2;outline-offset:2px}
.px-cam{background:#0e2f3a;border-radius:14px;overflow:hidden}
.px-cam img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
.px-cam p{margin:0;padding:8px 12px;font-size:13px;color:#9fd9df}
.px-pied{font-size:12px;color:#5b7279;display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.px-pied button{font:inherit;font-size:12px;border:0;background:none;color:#0a7f8f;text-decoration:underline;padding:0}
`;
  const LOGO = '<svg width="34" height="34" viewBox="0 0 58 58" aria-hidden="true"><circle cx="29" cy="29" r="27" fill="#0e2f3a"/><path d="M11 32c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M11 41c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="#3cc3d2" stroke-width="3.5" stroke-linecap="round"/><circle cx="29" cy="19" r="5" fill="#3cc3d2"/></svg>';

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
  const nb = (v, d) => (v === null || v === undefined || isNaN(v)) ? '--' : Number(v).toFixed(d).replace('.', ',');
  function hhmm(m) {
    m = ((m % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  class NonConnecte extends Error {}
  async function api(url, corps) {
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

  // ------------------------------------------------------------------
  //  Connexion
  // ------------------------------------------------------------------
  let minuteries = [];
  function arreterMinuteries() { minuteries.forEach(clearInterval); minuteries = []; }

  function afficherConnexion() {
    arreterMinuteries();
    document.title = 'POOLY · Connexion';
    racine.innerHTML = '';
    racine.className = 'px-cx';
    const f = el('form');
    f.append(el('h1', '', 'POOLY'), el('div', 'sous', 'Pilotage piscine'));
    const err = el('div', 'px-err', 'Identifiant ou mot de passe incorrect.');
    err.hidden = true;
    const l1 = el('label', '', 'Identifiant');
    const i1 = el('input'); i1.name = 'login'; i1.id = 'px-login'; i1.autocomplete = 'username'; i1.required = true;
    l1.append(i1);
    const l2 = el('label', '', 'Mot de passe');
    const i2 = el('input'); i2.name = 'mdp'; i2.id = 'px-mdp'; i2.type = 'password'; i2.autocomplete = 'current-password'; i2.required = true;
    l2.append(i2);
    const b = el('button', '', 'Se connecter'); b.type = 'submit';
    f.append(err, l1, l2, b);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      b.disabled = true; b.textContent = 'Connexion…';
      try {
        await api('/login', 'login=' + encodeURIComponent(i1.value) + '&mdp=' + encodeURIComponent(i2.value));
        demarrer();
      } catch (x) {
        err.textContent = x instanceof NonConnecte ? 'Identifiant ou mot de passe incorrect.' : 'Le boîtier ne répond pas. Vérifie que tu es sur le Wi-Fi de la maison.';
        err.hidden = false;
        b.disabled = false; b.textContent = 'Se connecter';
      }
    });
    racine.append(f);
    i1.focus();
  }

  // ------------------------------------------------------------------
  //  Écran principal
  // ------------------------------------------------------------------
  let cfg = null, dernierEtat = null, meteo = null;
  const $ = (id) => document.getElementById(id);

  function normaliserModes(liste) {
    return (liste || []).map((m) => typeof m === 'string'
      ? { id: m, nom: (MODES[m] || {}).nom || m, aide: (MODES[m] || {}).aide || '' }
      : m);
  }

  function construire() {
    document.title = 'POOLY';
    racine.innerHTML = '';
    racine.className = 'px-app';
    cfg.modes = normaliserModes(cfg.modes);
    const principal = cfg.capteurs.find((c) => c.principal) || cfg.capteurs[0];
    cfg.principal = principal;

    const haut = el('div', 'px-haut');
    const marque = el('div', 'px-marque');
    marque.innerHTML = LOGO;
    const nomBloc = el('div');
    nomBloc.append(el('b', '', 'POOLY'), el('small', '', cfg.modele || ''));
    marque.append(nomBloc);
    const etat = el('div', 'px-etat'); etat.id = 'px-etat';
    etat.append(el('i'), el('span', '', 'Connexion…'));
    haut.append(marque, etat);

    const carte = el('div', 'px-carte');
    carte.append(el('div', 'px-lib', principal ? principal.nom : ''));
    const grand = el('div', 'px-grand');
    const gv = el('b', '', '--'); gv.id = 'px-principal';
    grand.append(gv, el('span', '', principal ? principal.unite : ''));
    const tuiles = el('div', 'px-tuiles');
    const ajouterTuile = (id, titre) => {
      const d = el('div'); d.append(el('small', '', titre));
      const s = el('strong', '', '--'); s.id = id; d.append(s); tuiles.append(d);
    };
    ajouterTuile('px-filtration', 'Filtration conseillée');
    cfg.capteurs.filter((c) => c !== principal).forEach((c) => ajouterTuile('px-c-' + c.id, c.nom));
    if (cfg.lat && cfg.lon && !cfg.capteurs.some((c) => c.id === 'air')) ajouterTuile('px-meteo', 'Air extérieur');
    carte.append(grand, tuiles);

    const conseils = el('div', 'px-conseils'); conseils.id = 'px-conseils';

    const modes = el('div', 'px-modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Mode de fonctionnement');
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

    racine.append(haut, carte, el('div', 'px-titre', 'Assistant'), conseils,
      el('div', 'px-titre', 'Mode'), modes, aide, el('div', 'px-titre', 'Sorties'), sorties);

    if (cfg.entretien) {
      const ent = el('div', 'px-liste'); ent.id = 'px-entretien';
      ENTRETIENS.forEach((x, i) => {
        const ligne = el('div', 'px-ligne'), txt = el('div');
        const st = el('small', '', '--'); st.id = 'px-e-' + i;
        txt.append(el('b', '', x.nom), st);
        if (i === 2) {
          const choix = el('div', 'px-media');
          NOM_MEDIA.forEach((nom, k) => {
            const b = el('button', '', nom.charAt(0).toUpperCase() + nom.slice(1)); b.type = 'button'; b.dataset.media = k;
            b.onclick = () => envoyer('/api/media', 'm=' + k);
            choix.append(b);
          });
          txt.append(choix);
        }
        const fait = el('button', 'px-fait', 'Fait'); fait.type = 'button';
        fait.onclick = () => {
          if (!confirm('Enregistrer « ' + x.nom.toLowerCase() + ' » comme fait aujourd’hui ?')) return;
          envoyer('/api/entretien', 'e=' + i + (i === 2 ? '&t=' + Math.floor(Date.now() / 1000) : ''));
        };
        ligne.append(txt, fait);
        ent.append(ligne);
      });
      racine.append(el('div', 'px-titre', 'Entretien'), ent);
    }

    if (cfg.cameras && cfg.cameras.length) {
      racine.append(el('div', 'px-titre', 'Caméra'));
      cfg.cameras.forEach((c) => {
        const d = el('div', 'px-cam'), img = el('img'), p = el('p', '', c.nom);
        img.src = c.url; img.alt = c.nom;
        img.onerror = () => { p.textContent = c.nom + ' · caméra injoignable'; };
        d.append(img, p);
        racine.append(d);
      });
    }

    const pied = el('div', 'px-pied');
    const qui = el('span'); qui.id = 'px-qui';
    const heure = el('span'); heure.id = 'px-heure';
    const sortir = el('button', '', 'Se déconnecter'); sortir.type = 'button';
    sortir.onclick = async () => { try { await api('/logout', ''); } catch (x) { /* déjà déconnecté */ } afficherConnexion(); };
    pied.append(qui, heure, sortir);
    racine.append(pied);
  }

  // Valeurs communes, quel que soit le boîtier
  function plageTexte(e) {
    if (e.plage) return e.plage;
    if (e.debut === undefined) return '';
    return hhmm(e.debut) + ' à ' + hhmm(e.debut + e.heures * 60);
  }
  function heureTexte(e) {
    if (e.heure) return e.heure;
    return (e.minutes === undefined || e.minutes < 0) ? 'heure en attente' : hhmm(e.minutes);
  }

  function afficher(e) {
    dernierEtat = e;
    const etat = $('px-etat');
    etat.className = 'px-etat'; etat.lastChild.textContent = 'Connecté';
    const p = cfg.principal;
    if (p) $('px-principal').textContent = nb(e.capteurs[p.id], p.decimales);
    $('px-filtration').textContent = e.heures + ' h / jour';
    cfg.capteurs.filter((c) => c !== p).forEach((c) => {
      const v = e.capteurs[c.id];
      let t = (v === null || v === undefined) ? '--' : nb(v, c.decimales) + ' ' + c.unite;
      if (e.details && e.details[c.id] && v !== null) t += ' · ' + e.details[c.id];
      $('px-c-' + c.id).textContent = t;
    });

    const plage = plageTexte(e);
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === e.mode));
    const m = cfg.modes.find((x) => x.id === e.mode);
    $('px-aide').textContent = m ? m.aide.replace('{heures}', e.heures).replace(/\{plage\}/g, plage).replace('{seuil}', e.seuil) : '';

    cfg.sorties.forEach((s) => {
      const on = !!e.sorties[s.id];
      document.querySelector('[data-sortie="' + s.id + '"]').setAttribute('aria-pressed', on);
      let t = on ? s.on : s.off;
      if (s.pompe && e.mode !== 'manuel') t += ' · auto';
      $('px-s-' + s.id).textContent = t;
    });

    if (cfg.entretien && e.ent) afficherEntretien(e);
    $('px-qui').textContent = e.compte || '';
    $('px-heure').textContent = heureTexte(e);
    afficherConseils();
  }

  function afficherEntretien(e) {
    ENTRETIENS.forEach((x, i) => {
      const st = $('px-e-' + i);
      if (i < 2) {
        const h = Math.max(0, (e.sp - e.ent[i]) / 3600);
        st.textContent = Math.round(h) + ' h de filtration depuis le dernier · tous les ' + x.heures + ' h';
        st.className = h >= x.heures ? 'du' : '';
      } else {
        const duree = DUREE_MEDIA[e.media] || 5;
        if (!e.ent[2]) {
          st.textContent = 'Date du dernier changement inconnue · tous les ' + duree + ' ans';
          st.className = '';
        } else {
          const d = new Date(e.ent[2] * 1000);
          const prochain = new Date(d); prochain.setFullYear(d.getFullYear() + duree);
          st.textContent = 'Changé le ' + d.toLocaleDateString('fr-FR') + ' · prochain en ' + prochain.getFullYear();
          st.className = Date.now() >= prochain.getTime() ? 'du' : '';
        }
      }
    });
    document.querySelectorAll('[data-media]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.media) === e.media));
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
  function calculerConseils(e) {
    const c = [];
    const eau = e.capteurs ? e.capteurs.eau : null;
    const pompe = cfg.sorties.find((s) => s.pompe);
    const pompeOn = pompe ? !!e.sorties[pompe.id] : false;

    if (eau === null || eau === undefined) {
      c.push(['alerte', 'La sonde d’eau ne répond pas : vérifie son câble et son branchement. En attendant, la filtration est de ' + e.heures + ' h par jour.']);
    } else {
      if (eau >= 28) c.push(['attention', 'Eau à ' + nb(eau, 1) + ' °C : risque d’algues. Contrôle le chlore et le pH plus souvent.']);
      if (eau < 12 && e.mode !== 'horsgel') c.push(['info', 'Eau sous 12 °C : c’est le moment de penser à l’hivernage.']);
      if (eau < 5 && e.mode === 'manuel' && !pompeOn) c.push(['alerte', 'Eau très froide et pompe arrêtée : passe en mode Hors-gel pour protéger les canalisations.']);
    }

    if (meteo) {
      const gel = Math.min.apply(null, meteo.min);
      const chaud = Math.max.apply(null, meteo.max);
      if (gel < 1 && e.mode !== 'horsgel') c.push(['alerte', 'Gel annoncé (' + Math.round(gel) + ' °C) dans les 3 jours : passe en mode Hors-gel.']);
      if (chaud >= 33) c.push(['info', 'Fortes chaleurs annoncées (' + Math.round(chaud) + ' °C) : surveille le chlore, l’eau va se réchauffer vite.']);
      if (meteo.codes.some((x) => x >= 95)) c.push(['info', 'Orage annoncé : après le passage, contrôle l’eau et fais un traitement choc si elle se trouble.']);
    }

    if (e.mode === 'manuel' && pompe && !pompeOn) c.push(['attention', 'Pompe arrêtée en mode Manuel : pense à repasser en mode Pooly pour que la filtration reprenne.']);

    if (cfg.entretien && e.ent) {
      ENTRETIENS.forEach((x, i) => {
        if (i < 2) {
          const h = (e.sp - e.ent[i]) / 3600;
          if (h >= x.heures) c.push(['attention', x.nom + ' à faire : ' + Math.round(h) + ' h de filtration depuis le dernier.']);
        } else if (e.ent[2]) {
          const ans = (Date.now() / 1000 - e.ent[2]) / 31557600;
          const duree = DUREE_MEDIA[e.media] || 5;
          if (ans >= duree) c.push(['info', 'Le ' + NOM_MEDIA[e.media] + ' du filtre a plus de ' + duree + ' ans : prévois de le changer.']);
        }
      });
    }

    if (heureTexte(e) === 'heure en attente') c.push(['info', 'Le boîtier n’a pas encore reçu l’heure : vérifie son accès à internet. En attendant, la pompe filtre en continu.']);

    if (!c.length) c.push(['ok', 'Tout va bien. Rien à faire pour le moment.']);
    const ordre = { alerte: 0, attention: 1, info: 2, ok: 3 };
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
  //  Échanges avec le boîtier
  // ------------------------------------------------------------------
  function horsLigne() {
    const etat = $('px-etat');
    if (etat) { etat.className = 'px-etat off'; etat.lastChild.textContent = 'Hors ligne'; }
  }
  async function charger() {
    try { afficher(await api('/api/etat')); }
    catch (x) { if (x instanceof NonConnecte) afficherConnexion(); else horsLigne(); }
  }
  async function envoyer(url, corps) {
    try { afficher(await api(url, corps)); }
    catch (x) { if (x instanceof NonConnecte) afficherConnexion(); else charger(); }
  }

  async function demarrer() {
    try {
      cfg = await api('/api/config');
    } catch (x) {
      if (x instanceof NonConnecte) { afficherConnexion(); return; }
      racine.className = 'px-app';
      racine.textContent = 'Le boîtier ne répond pas. Vérifie que tu es sur le Wi-Fi de la maison, puis recharge la page.';
      return;
    }
    construire();
    await charger();
    chargerMeteo();
    arreterMinuteries();
    minuteries.push(setInterval(charger, 5000), setInterval(chargerMeteo, 30 * 60 * 1000));
  }

  demarrer();
})();
