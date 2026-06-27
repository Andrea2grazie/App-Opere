VERSIONE 5 - STRUTTURA PULITA

Prima cosa:
1. Vai su Supabase > SQL Editor.
2. Incolla ed esegui schema_migrazione_v5.sql.

Poi carica/sostituisci su GitHub:
- index.html
- style.css
- app.js
- config.js
- manifest.json
- sw.js

Questa versione:
- conserva le voci già inserite nella tabella voci;
- ricostruisce le macrostrutture mancanti da Supabase;
- mostra i conteggi reali leggendo la tabella voci;
- permette di creare/modificare/eliminare macrostrutture;
- permette di aggiungere/modificare/eliminare voci dentro ogni macrostruttura;
- mantiene autosalvataggio, offline e sincronizzazione.
