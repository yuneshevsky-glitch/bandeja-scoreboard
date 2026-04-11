# Bandeja Scoreboard

Real-time padel scoreboard for live tournaments. Run on TVs (display), phones (referee control), and desktops (dashboard) — all synced via WebSockets.

## Quick Start

```bash
npm install
npm start
```

Server starts at **http://localhost:3000**

## Environment Variables

| Variable    | Default | Description          |
|-------------|---------|----------------------|
| `PORT`      | `3000`  | Server port          |
| `ADMIN_PIN` | `1234`  | Admin panel PIN code |

## Usage

### URLs

| URL                          | Purpose                        |
|------------------------------|--------------------------------|
| `/#/`                        | Dashboard — all 8 courts       |
| `/#/court/1/display`         | TV scoreboard for court 1      |
| `/#/court/1/control`         | Referee control for court 1    |
| `/#/admin`                   | Admin panel (PIN required)     |
| `/health`                    | Server health check (JSON)     |

### At the Tournament

1. **Setup**: Open `/#/court/N/control` on referee's phone
2. **Enter team names**, select format, set first server
3. **Tap "Start Match"**
4. **Open `/#/court/N/display`** on TV (Chrome, press F11 for fullscreen)
5. **Score points** by tapping the large buttons on the phone
6. **Undo** mistakes with the undo button

### Match Formats

- **Classic** — Best of 3 sets, sets to 6, tiebreak at 6-6
- **Super Tiebreak** — Same as Classic but 3rd set is super tiebreak to 10
- **Set to 9** — Sets to 9 games, tiebreak at 9-9
- **Single Set** — One set to 6 + tiebreak

### Admin Panel

Access at `/#/admin` with the PIN. Features:
- View all courts status and scores
- Generate QR codes for referee phones
- Reset individual or all courts
- Download state backup as JSON

## Local Network (Tournament Venue)

### Using ngrok

```bash
npm start
# In another terminal:
ngrok http 3000
```

Share the ngrok URL with referees and TVs.

### Direct LAN

Find your IP: `ifconfig | grep inet` (macOS) or `ip addr` (Linux)

All devices on the same WiFi can access `http://YOUR_IP:3000`

## Deployment

### Railway

1. Push to GitHub
2. Connect repo at [railway.app](https://railway.app)
3. Set `PORT` env variable (Railway provides it automatically)
4. Deploy

### Render

1. Push to GitHub
2. Create new Web Service at [render.com](https://render.com)
3. Set build command: `npm install`
4. Set start command: `npm start`

## TV Setup

1. Open Chrome on the TV
2. Navigate to `http://SERVER:3000/#/court/N/display`
3. Press **F11** for fullscreen
4. Score is visible from 5+ meters with the large font display

## Data Persistence

State auto-saves to `./data/state.json` every 30 seconds. On server restart, state is restored automatically.

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JS, HTML, CSS (no frameworks)
- **Fonts**: Barlow Condensed + Inter (Google Fonts)
