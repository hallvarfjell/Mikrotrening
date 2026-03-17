<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0, user-scalable=no" name="viewport"/>
<title>Øktbygger – Intervall PWA</title>
<link href="style.css" rel="stylesheet"/>
<script src="https://unpkg.com/phosphor-icons@1.4.2"></script>
</head>
<body>
<header class="topbar">
<div class="nav">
<span><strong>INTZ</strong></span>
<a href="index.html">Hovedside</a>
<a href="builder.html">Øktbygger</a>
<a href="log.html">Logg</a>
<a href="settings.html">Innstillinger</a>
<a href="help.html">Hjelp</a>
<span id="cloud-status" class="tag">Sky: offline</span>
<button id="cloud-sync" class="ghost" title="Synkroniser nå">Synk</button>
<button id="cloud-auth" class="secondary" title="Logg inn">Logg inn</button>
</div>
</header>
<main class="layout">
<section class="leftcol">
<div class="card">
<h3>Øktinformasjon</h3>
<div class="row" style="display:grid;gap:8px">
<label>Øktnavn
 <input id="b-name" placeholder="f.eks. Terskel – 4×10 min" type="text"/>
</label>
<label>Beskrivelse (fritekst)
 <textarea id="b-desc" placeholder="Hva er hensikten med økta?" rows="3"></textarea>
</label>
<div class="small">Total varighet: <strong id="b-total">0:00</strong></div>
</div>
</div>
<div class="card">
<h3>Øktinnhold</h3>
<div class="toolbar" style="display:flex;gap:6px;flex-wrap:wrap">
<button class="secondary" id="add-warmup"><i class="ph-thermometer-simple"></i> Oppvarming</button>
<button class="secondary" id="add-series"><i class="ph-rows"></i> Serie</button>
<button class="secondary" id="add-single"><i class="ph-timer"></i> Enkeltdrag</button>
<button class="secondary" id="add-pause"><i class="ph-coffee"></i> Pause</button>
<button class="secondary" id="add-seriepause"><i class="ph-arrows-in-line-horizontal"></i> Seriepause</button>
<button class="secondary" id="add-cooldown"><i class="ph-thermometer-cold"></i> Nedjogg</button>
<button class="secondary" id="gen-fartlek"><i class="ph-wave-sine"></i> Fartlek</button>
<button class="secondary" id="gen-pyramid"><i class="ph-triangle"></i> Pyramide</button>
<button class="ghost" id="undo" title="Angre (opptil 20)"><i class="ph-arrow-arc-left"></i> Angre</button>
<button class="ghost" id="redo" title="Gjør om"><i class="ph-arrow-arc-right"></i> Gjør om</button>
</div>
<div class="steps" id="steps" style="display:grid;gap:8px"></div>
<p class="small">Fartlek/pyramide genereres som en <em>sammendragsrad</em> med segmenter under. Sammendragsraden har <strong>Vis/Skjul</strong> og <strong>Dupliser</strong>.</p>
</div>
<div class="card">
<div class="row" style="display:flex;gap:8px;flex-wrap:wrap">
<button class="primary" id="b-save"><i class="ph-floppy-disk"></i> Lagre som ny</button>
<button class="secondary hidden" id="b-update"><i class="ph-floppy-disk"></i> Oppdater mal</button>
<button class="ghost" id="b-clear"><i class="ph-trash"></i> Nullstill</button>
</div>
</div>
</section>
<section class="rightcol">
<div class="card">
<h3>Lagrede maler</h3>
<div id="b-list"></div>
</div>
</section>
</main>
<!-- Generator Modal -->
<div aria-labelledby="gen-title" aria-modal="true" class="modal" id="gen-modal" role="dialog">
<div class="modalpanel">
<h3 id="gen-title">Generator</h3>
<div class="modalgrid">
<label>Segmenter (sek, kommadelt)
 <textarea id="gen-segments" placeholder="f.eks. 60,90,60,120" rows="5"></textarea>
</label>
<div>
<label>Hurtig: bygg pyramide fra stigende sekvenser (kommaseparert)
 <input id="gen-asc" placeholder="f.eks. 60,120,180" type="text"/>
</label>
<label><input checked id="gen-mirror" type="checkbox"/> Speil stigende side (pyramide)</label>
<label>Pause mellom segmenter (s)
 <input id="gen-pause" min="0" step="5" type="number" value="0"/>
</label>
<label><input checked id="gen-group" type="checkbox"/> Start som sammendragsgruppe</label>
<label><input id="gen-absorb" type="checkbox"/> Slå sammen til <em>Serie</em> når mulig</label>
</div>
</div>
<div class="small" id="gen-preview">Forhåndsvisning: 0 segmenter, 0:00</div>
<div class="modalactions">
<button class="ghost" id="gen-cancel">Avbryt</button>
<button class="primary" id="gen-apply">Bruk</button>
</div>
</div>
</div>
<!-- Supabase & Cloud (ESM) -->
<script type="module" src="supabase-init.js"></script>
<script type="module" src="cloud-sync.js"></script>
<script defer src="builder.js"></script>
</body>
</html>