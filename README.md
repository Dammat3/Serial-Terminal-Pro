<<<<<<< HEAD
[README.md](https://github.com/user-attachments/files/28397984/README.md)
=======
>>>>>>> edb9182 (Aggiunto CTRL+C/V)
# Serial Terminal Pro

**Versione 2.0.3** — Terminale seriale professionale con pulsanti programmabili, multi-porta, SSH, Telnet e timestamp UTC.

---

## Indice

1. [Panoramica](#panoramica)
2. [Architettura del progetto](#architettura-del-progetto)
3. [Prerequisiti e installazione](#prerequisiti-e-installazione)
4. [Struttura dei file](#struttura-dei-file)
5. [Funzionalità dettagliate](#funzionalità-dettagliate)
6. [Interfaccia utente](#interfaccia-utente)
7. [Configurazione e persistenza](#configurazione-e-persistenza)
8. [Aggiornamenti automatici](#aggiornamenti-automatici)
9. [Build e distribuzione](#build-e-distribuzione)
10. [Scorciatoie da tastiera](#scorciatoie-da-tastiera)

---

## Panoramica

Serial Terminal Pro è un'applicazione desktop **Windows** costruita con **Electron** che fornisce un terminale seriale avanzato con supporto per connessioni multiple (seriale RS232/USB, SSH, Telnet), pannelli terminale affiancati, pulsanti di comando programmabili e logging su file.

È pensata per chi lavora con dispositivi embedded, modem, router o qualsiasi periferica che comunichi tramite porta seriale o protocolli di rete testuali.

---

## Architettura del progetto

Il programma segue l'architettura standard di Electron, con una separazione netta tra processo principale (Main Process) e processo di rendering (Renderer Process).

```
┌─────────────────────────────────────────────────────────┐
<<<<<<< HEAD
│                   Processo Principale (main.js)         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  SerialPort │  │     ssh2     │  │   net.Socket  │   │ 
│  │   (RS232)   │  │    (SSH)     │  │   (Telnet)    │   │
│  └─────────────┘  └──────────────┘  └───────────────┘   │
│         │                │                  │           │
│         └────────────────┴──────────────────┘           │
│                          │ IPC                          │
│                     ipcMain.handle                      │
└──────────────────────────┼──────────────────────────────┘
                           │ contextBridge (preload.js)
┌──────────────────────────┼──────────────────────────────┐
│              Processo Renderer (renderer.js)            │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐   │
│  │ xterm.js │  │ FitAddon │  │  Schede  │  │Pulsanti│   │
│  │(Terminal)│  │(Resize)  │  │ (Tabs)   │  │(F1-F12)│   │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘   │
=======
│                   Processo Principale (main.js)          │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  SerialPort │  │     ssh2     │  │   net.Socket  │  │
│  │   (RS232)   │  │    (SSH)     │  │   (Telnet)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│         │                │                  │            │
│         └────────────────┴──────────────────┘            │
│                          │ IPC                           │
│                     ipcMain.handle                       │
└──────────────────────────┼──────────────────────────────┘
                           │ contextBridge (preload.js)
┌──────────────────────────┼──────────────────────────────┐
│              Processo Renderer (renderer.js)             │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ xterm.js │  │ FitAddon │  │  Schede  │  │Pulsanti│ │
│  │(Terminal)│  │(Resize)  │  │ (Tabs)   │  │(F1-F12)│ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
>>>>>>> edb9182 (Aggiunto CTRL+C/V)
└─────────────────────────────────────────────────────────┘
```

### main.js — Processo principale

Gestisce tutto ciò che richiede accesso al sistema operativo:

- Creazione della finestra Electron (`BrowserWindow`)
- Comunicazione con le porte seriali tramite la libreria `serialport`
- Connessioni SSH tramite `ssh2`
- Connessioni Telnet tramite il modulo nativo `net` di Node.js
- Lettura/scrittura della configurazione tramite `electron-store`
- Logging su file nella cartella Documenti dell'utente
- Menu nativo dell'applicazione
- Sistema di aggiornamento automatico tramite `electron-updater`

Il processo principale espone i propri metodi al renderer attraverso **canali IPC** (Inter-Process Communication).

### preload.js — Bridge sicuro

Il file `preload.js` utilizza `contextBridge` per esporre in modo sicuro le API del processo principale al renderer, senza abilitare `nodeIntegration`. L'oggetto globale `window.serialAPI` contiene tutti i metodi disponibili:

- `listPorts()` — Elenca le porte seriali disponibili
- `connectPort(args)` — Connette una porta seriale
- `disconnectPort(args)` — Disconnette una porta seriale
- `connectSsh(args)` — Connette tramite SSH
- `connectTelnet(args)` — Connette tramite Telnet
- `disconnectRemote(args)` — Disconnette SSH/Telnet
- `writePort(args)` / `writeRemote(args)` — Invia dati
- `resizeRemote(args)` — Notifica resize terminale al server SSH
- `getConfig()` / `saveConfig(cfg)` — Gestione configurazione
- `appendLog(args)` / `getLogDir()` / `openLogFolder()` — Logging
- `onPortData(cb)` / `onPortClosed(cb)` / `onPortError(cb)` — Ricezione dati/eventi
- Metodi per aggiornamenti: `onUpdateAvailable`, `onUpdateProgress`, `onUpdateDownloaded`, `installUpdate`, `checkForUpdates`

### renderer.js — Interfaccia utente

Contiene tutta la logica dell'interfaccia grafica (~3000 righe):

- Gestione delle schede e del loro stato
- Istanze `xterm.js` per ogni terminale
- Pulsanti programmabili (creazione, modifica, drag & drop, esecuzione)
- Tasti funzione F1–F12
- Funzionalità MDM (interrogazione modem)
- Contatore e bottone telefono programmabili
- Tema chiaro/scuro e personalizzazione colori
- Polling automatico delle porte disponibili
- Sistema di logging

---

## Prerequisiti e installazione

### Requisiti

- **Node.js** 18 o superiore
- **npm**
- Windows 10/11 (64-bit) per la versione compilata

### Installazione per sviluppo

```bash
# Clona o scarica il progetto
git clone https://github.com/Dammat3/Serial-Terminal-Pro.git
cd Serial-Terminal-Pro

# Installa le dipendenze
npm install

# Ricompila i moduli nativi (serialport) per la versione di Electron usata
npm run rebuild

# Avvia l'applicazione
npm start
```

> **Nota:** Il comando `npm run rebuild` è indispensabile dopo ogni `npm install` perché `serialport` è un modulo nativo che deve essere compilato per la versione specifica di Electron.

### Dipendenze principali

| Pacchetto | Versione | Scopo |
|---|---|---|
| `electron` | ^28.3.3 | Framework desktop |
| `serialport` | ^12.0.0 | Comunicazione seriale |
| `electron-store` | ^8.2.0 | Persistenza configurazione |
| `electron-updater` | ^6.8.3 | Aggiornamenti automatici |
| `@electron/rebuild` | ^3.6.0 | Ricompilazione moduli nativi |
| `electron-builder` | ^24.13.3 | Build e packaging |

---

## Struttura dei file

```
serial-terminal-pro/
├── main.js          # Processo principale Electron
├── preload.js       # Bridge IPC sicuro (contextBridge)
├── renderer.js      # Logica interfaccia utente (~3000 righe)
├── index.html       # HTML della finestra principale
├── style.css        # Stili CSS dell'interfaccia
├── package.json     # Configurazione npm e build
├── package-lock.json
├── .gitignore
└── assets/
    └── icon.ico     # Icona dell'applicazione (richiesta per la build)
```

---

## Funzionalità dettagliate

### 1. Connessioni multi-tipo

Ogni porta (PORT 1 e PORT 2) può essere configurata in modo indipendente con uno dei tre tipi di connessione:

#### Porta seriale (RS232/USB)
- Selezione porta COM dal menu a tendina (popolato automaticamente)
- **Baud rate** configurabile (tipicamente 9600–115200)
- **Data bits**: 5, 6, 7 o 8
- **Parità**: None, Even, Odd
- **Stop bits**: 1 o 2
- **Flow control**: None o RTS/CTS hardware
- **Local echo**: mostra nel terminale i caratteri inviati

#### SSH
- Host e porta (default: 22)
- Autenticazione con username/password o chiave privata
- Terminale `xterm-256color` con resize dinamico (notifica `setWindow` al server)
- Filtraggio e gestione corretta della dimensione del terminale remoto

#### Telnet
- Host e porta (default: 23)
- Negoziazione automatica delle opzioni IAC (risponde WONT/DONT a tutte le opzioni del server)
- Filtro dei byte di controllo Telnet: vengono mostrati solo i dati applicativi

---

### 2. Schede multiple (Multi-tab)

L'applicazione supporta un numero illimitato di schede, ognuna con il proprio stato indipendente:

- **Creazione** di nuove schede con il pulsante `+`
- **Rinomina** con doppio click sul titolo della scheda
- **Chiusura** con il pulsante `×` (disponibile solo con più di una scheda)
- **Riaper ultima scheda chiusa** (`Ctrl+Shift+T` oppure `File → Riapri ultima scheda chiusa`) — mantiene uno stack delle ultime schede chiuse con tutte le impostazioni
- **Indicatore di stato** nella linguetta: pallino verde se almeno una porta è connessa, grigio altrimenti
- **Scroll della tab bar** con frecce laterali quando le schede non entrano tutte

Ogni scheda memorizza in modo indipendente:
- Impostazioni di PORT 1 e PORT 2 (tipo connessione, COM, baud, ecc.)
- Modalità split e proporzione del divisore
- Porta attiva selezionata
- Line ending preferito

---

### 3. Vista split (schermo diviso)

<<<<<<< HEAD
Il pulsante **SPLIT** nella barra superiore attiva la visualizzazione affiancata di PORT 1 e PORT 2:
=======
Il pulsante **SPLIT** nella barra inferiore attiva la visualizzazione affiancata di PORT 1 e PORT 2:
>>>>>>> edb9182 (Aggiunto CTRL+C/V)

- I due pannelli sono separati da un **divisore trascinabile** (cursore `col-resize`)
- La proporzione (es. 60%/40%) viene salvata per scheda e ripristinata alla riapertura
- Limiti: nessun pannello può scendere sotto il 15% della larghezza totale
- I terminali xterm si ridimensionano in tempo reale durante il trascinamento

---

### 4. Pulsanti programmabili

<<<<<<< HEAD
La sidebar destra ospita una griglia **4 colonne** di pulsanti completamente personalizzabili.
=======
La sidebar sinistra ospita una griglia **4 colonne** di pulsanti completamente personalizzabili.
>>>>>>> edb9182 (Aggiunto CTRL+C/V)

#### Creazione e modifica

In **modalità modifica** (attivata dal pulsante matita nella toolbar):
- Click su un pulsante esistente → apre il dialogo di modifica
- Click su uno spazio vuoto → crea un nuovo pulsante
- I pulsanti possono essere **trascinati** (drag & drop) per riordinarli nella griglia; un indicatore visivo mostra la posizione di destinazione

#### Proprietà di ogni pulsante

| Campo | Descrizione |
|---|---|
| **Etichetta** | Testo visualizzato sul pulsante |
| **Comando** | Testo da inviare (supporta variabili, vedi sotto) |
| **Porta target** | `PORT 1`, `PORT 2`, `Entrambe`, `Porta attiva` |
| **Auto-send** | Se attivo, invia immediatamente; se disattivo, incolla nella barra di input |
| **Colore** | Colore di sfondo del pulsante (color picker) |
| **Larghezza** | 1, 2, 3 o 4 colonne nella griglia |

#### Variabili di interpolazione nei comandi

Nei comandi dei pulsanti si possono usare variabili che vengono sostituite al momento dell'invio:

- `{UTC}` → data e ora UTC nel formato `YYYY-MM-DD HH:MM:SS`
- `{UTCSHORT}` → formato compatto `DDMMYY HHMMSS` (senza separatori tra le cifre)

---

### 5. Tasti funzione F1–F12

Una barra dedicata sotto l'area terminale mostra i 12 tasti funzione programmabili.

#### Configurazione (`Ctrl+K` oppure `File → Tasti Funzione F1–F12…`)

Ogni tasto ha:
- **Etichetta** personalizzata (mostrata nel pulsante sotto il nome `F1`–`F12`)
- **Comando** da inviare (con supporto alle variabili `{UTC}`, `{UTCSHORT}`)
- **Porta target**: porta attiva, PORT 1, PORT 2 o entrambe
- **Auto-send**: comportamento identico ai pulsanti programmabili
- **Abilitato/disabilitato**: toggle per attivare o ignorare il tasto

#### Utilizzo

- Click sul pulsante nella barra visiva, **oppure**
- Pressione del tasto fisico `F1`–`F12` mentre il cursore è nel terminale

I tasti fisici vengono intercettati prima che xterm.js li converta in sequenze di escape (es. `\x1bOP` per F1), quindi non producono effetti indesiderati nel terminale remoto.

I pulsanti non configurati aprono direttamente la finestra di configurazione se cliccati.

La barra Fn può essere nascosta da `Visualizza → Barra tasti funzione`.

---

### 6. Invio manuale e barra di input

In fondo all'interfaccia è presente una barra di input con:

- **Campo testo** per digitare comandi manuali
- **Line ending** selezionabile: `CR+LF`, `CR`, `LF` o nessuno
- **Porta attiva** selezionabile: PORT 1, PORT 2, o Entrambe (solo in split mode)
- **Pulsante SEND** (o `Invio`) per inviare il testo
- **Pulsante CLR** per cancellare il campo

Quando si clicca un pulsante con **Auto-send attivo**, il testo della barra viene **accodato** al comando del pulsante prima dell'invio (con uno spazio di separazione). Quando Auto-send è disattivo, il comando del pulsante viene **incollato nella barra** perché l'utente possa completarlo manualmente.

---

### 7. Rilevamento automatico porte

Le porte seriali disponibili vengono rilevate ogni **2 secondi** tramite polling di `SerialPort.list()`. Quando cambia l'elenco:

- I menu a tendina delle porte COM vengono aggiornati automaticamente
- Nella barra superiore vengono mostrati badge con i nomi delle porte disponibili
- Un messaggio informativo viene scritto nel terminale attivo

---

### 8. Funzione MDM (interrogazione modem)

Il pulsante **MDM** nella toolbar invia il comando `modem` alla porta attiva e analizza la risposta per estrarre automaticamente:

- **IMEI** del dispositivo (ricerca per etichetta `imei:` o pattern 15 cifre consecutive)
- **Versione firmware** (ricerca per etichetta `ver(QGMR):` o `revisione fw:`)

I valori estratti vengono mostrati nei campi di testo dedicati. Il parsing avviene entro un timeout di **5 secondi**, ma termina prima se vengono trovati entrambi i valori. Le sequenze ANSI escape nel testo ricevuto vengono filtrate prima del parsing.

---

### 9. Contatore programmabile

Un pulsante speciale **CNT** (contatore) è posizionato nella toolbar. Permette di:

- Mantenere un **valore numerico** persistente tra le sessioni
- Inviare un **comando personalizzato** che può includere il valore corrente
- Incrementare il contatore ad ogni click
- Configurare etichetta e colore tramite click destro o lungo sul pulsante
- Resettare il contatore a zero

Il valore del contatore viene salvato nella configurazione e ripristinato all'avvio.

---

### 10. Pulsante Telefono programmabile

Il pulsante **TEL** funziona come un pulsante a comando fisso con:

- **Etichetta** personalizzabile
- **Comando** personalizzabile inviato alla porta attiva
- **Colore** personalizzabile
- Configurazione tramite click destro o lungo sul pulsante

---

### 11. Logging su file

Il logging può essere attivato dalla toolbar. I log vengono salvati nella cartella:

```
%USERPROFILE%\Documents\SerialTerminalPro\logs\
```

- Il nome del file di log è configurabile (vuoto = nome automatico basato su data/ora)
- Il pulsante **Apri cartella log** (`File → Apri log`) apre la cartella in Esplora risorse
- I dati vengono scritti in **append** al file esistente (non sovrascrivono)
- Il logging è attivo per tutte le porte e schede simultaneamente

---

### 12. Tema chiaro/scuro e personalizzazione colori

Il pulsante **🌙/☀️** nella toolbar alterna tra tema scuro (default) e chiaro.

#### Personalizzazione avanzata

Dal pannello delle impostazioni colori è possibile personalizzare singolarmente:

**Pulsanti e UI:**
- Colore testo e sfondo dei pulsanti SEND, CLR, CNT, TEL
- Colore testo e sfondo dei pulsanti CONNECT/DISCONNECT

**Chrome dell'applicazione:**
- Sfondo finestra principale
- Sfondo sidebar
- Sfondo barra schede
- Sfondo barra input

**Terminale xterm.js:**
- Colore sfondo del terminale
- Colore testo del terminale
- Colore cursore
- Colore selezione

I valori `null` per chrome e terminale seguono automaticamente il tema corrente (chiaro/scuro).

---

### 13. Comandi nel terminale

Digitando direttamente nel pannello terminale:

- **Porta seriale**: i caratteri vengono inviati byte per byte; il tasto Backspace (`DEL`) viene convertito in `BS` (`\x08`); l'echo locale è opzionale
- **SSH/Telnet**: i caratteri vengono inviati raw, senza conversioni (il server gestisce l'eco)

Ogni terminale xterm supporta:
- **Scrollback** di 10.000 righe
- **Copia** della selezione con il pulsante ⎘ nell'header del pannello
- **Cancella** terminale con il pulsante ⊗
- **Scorri in fondo** con il pulsante ↓
- **Resize** automatico quando la finestra cambia dimensione

---

## Interfaccia utente

```
┌────────────────────────────────────────────────────────────────────┐
│  File  Modifica  Visualizza  ?          [menu nativo Windows]      │
├─────────────┬──────────────────────────────────────────────────────┤
│             │  [Scheda 1 ●] [Scheda 2] [+]   [< >]                │
│  SIDEBAR    ├──────────────────────────────────────────────────────┤
│             │  ┌──── PORT 1 ────────────────────────────┐          │
│  Pulsanti   │  │ ● PORT 1   COM3 @ 115200 baud  ⊗ ⎘ ↓ │          │
│  programa-  │  │                                        │          │
│  bili       │  │   xterm.js terminal output             │          │
│  (griglia   │  │                                        │          │
│   4 col)    │  └────────────────────────────────────────┘          │
│             │  [== divisore trascinabile ==] (solo in split mode)  │
│  [CNT] [TEL]│  ┌──── PORT 2 ────────────────────────────┐          │
│             │  │   (visibile solo in split mode)        │          │
│             │  └────────────────────────────────────────┘          │
│             ├──────────────────────────────────────────────────────┤
│             │  [PORT 1 ▼] [BAUD ▼] [CONNECT]  [PORT 2] [CONNECT] │
│  [badge     ├──────────────────────────────────────────────────────┤
│   porte]    │  [input testo____________] [LE▼] [P▼] [SEND] [CLR] │
│             ├──────────────────────────────────────────────────────┤
│             │  [MDM][LOG][SPLIT][🌙][F1 label][F2 label]...[F12] │
└─────────────┴──────────────────────────────────────────────────────┘
```

---

## Configurazione e persistenza

La configurazione viene salvata automaticamente tramite `electron-store` nel file:

```
%APPDATA%\serial-terminal-pro\serial-terminal-config.json
```

I dati salvati includono:
- Elenco di tutte le schede con titoli, pulsanti e impostazioni porte
- Scheda attiva al momento della chiusura
- Tema (chiaro/scuro)
- Configurazione contatore (valore, etichetta, comando, colore)
- Configurazione pulsante telefono
- Configurazione dei 12 tasti funzione (F1–F12)

### Esportare/importare la configurazione

Dal menu `File → Carica configurazione…` (`Ctrl+O`) è possibile caricare un file JSON di configurazione precedentemente esportato. Questo permette di trasferire l'intera configurazione (schede, pulsanti, impostazioni) tra PC diversi.

---

## Aggiornamenti automatici

L'applicazione controlla automaticamente gli aggiornamenti **3 secondi dopo l'avvio** (solo nella versione compilata, non in sviluppo). Il sistema usa `electron-updater` collegato al repository GitHub (`Dammat3/Serial-Terminal-Pro`).

### Flusso aggiornamento

1. Controllo silenzioso all'avvio
2. Se disponibile: notifica nella UI con numero di versione
3. Download automatico in background con barra di avanzamento
4. Al termine del download: pulsante per installare e riavviare
5. Installazione al riavvio (o all'uscita dall'app se `autoInstallOnAppQuit` è attivo)

È possibile avviare un controllo manuale da `? → Controlla aggiornamenti`.

Gli errori di rete durante il controllo aggiornamenti vengono registrati solo nella console, senza disturbare l'utente.

---

## Build e distribuzione

### Creare l'installer Windows

```bash
npm run build
```

Genera un installer NSIS (`.exe`) nella cartella `dist/`. Le caratteristiche del build:

- **Target**: Windows x64, formato NSIS
- **One-click**: disabilitato (l'utente può scegliere la cartella di installazione)
- **Pubblicazione**: GitHub Releases sul repository `Dammat3/Serial-Terminal-Pro`
- **AppId**: `com.drai.serial-terminal-pro`
- **Icona**: `assets/icon.ico`

### Pubblicazione automatica

Il flag `--publish always` nel comando di build pubblica automaticamente la nuova versione come release GitHub. `electron-updater` nei client già installati rileverà la nuova versione al prossimo controllo.

---

## Scorciatoie da tastiera

| Scorciatoia | Azione |
|---|---|
| `Ctrl+K` | Apri configurazione tasti funzione F1–F12 |
| `Ctrl+Shift+T` | Riapri ultima scheda chiusa |
| `Ctrl+O` | Carica configurazione da file JSON |
| `F1`–`F12` | Esegue il comando del tasto funzione (se configurato e abilitato) |
| `Invio` | Invia il testo nella barra di input |
| `F11` | Schermo intero |
| Doppio click sul titolo scheda | Rinomina la scheda inline |

---

## Note tecniche

- **Sicurezza Electron**: `nodeIntegration` è disabilitato, `contextIsolation` è attivo. Tutta la comunicazione passa per il bridge sicuro di `preload.js`.
- **Fix cursore Windows**: Electron ha un bug noto su Windows per cui nasconde il cursore del mouse quando xterm.js imposta `cursor: none` sul canvas interno. Il main process intercetta l'evento `cursor-changed` e ripristina il cursore via `executeJavaScript`.
- **Connessioni SSH**: il terminale viene aperto come shell interattiva con tipo `xterm-256color`. I resize del pannello xterm vengono propagati al server remoto tramite `stream.setWindow()`.
- **Telnet IAC**: i byte di controllo Telnet (sequenze `IAC WILL/DO/WONT/DONT` e sub-negotiation `SB…SE`) vengono filtrati e gestiti automaticamente rispondendo `WONT`/`DONT` a tutte le opzioni, rendendo visibili solo i dati applicativi nel terminale.
- **Moduli nativi**: `serialport` viene caricato dinamicamente all'avvio con gestione degli errori, così come `ssh2` e `electron-updater`. Se un modulo non è disponibile, la funzionalità corrispondente viene disabilitata con un messaggio in console.
