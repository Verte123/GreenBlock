# GreenBlock

A falling-block battle for two or three phones on the same Wi-Fi. Everyone plays at once on their own board; clearing several lines at once sends grey rows to a random rival, and a pop-up tells you who got them. Last board standing wins the round, first to two rounds wins the match.

## Playing

1. Every phone opens the game link in Safari (optionally Share → **Add to Home Screen** for a full-screen app icon).
2. One player taps **Host a game** and reads out the 4-letter code.
3. The others type the code and tap **Join**. The host taps **Start match** once two or three players are in.

**Controls:** tap to rotate · drag sideways to move · drag down to soft drop · flick down to drop · flick up to hold. On a computer: arrow keys, Space to drop, Z/X to rotate, C to hold.

**Attacks:** 2 lines → 1 row, 3 lines → 2 rows, 4 lines → 4 rows, +1 for back-to-back fours, extra for combos (consecutive clearing pieces) and +4 for clearing the whole board. Each attack goes to a randomly chosen rival who is still in. Clearing lines cancels rows waiting to hit you first (the red bar beside your board). The game speeds up every 30 seconds.

**Power-ups** (buttons on the right, each usable once per round):
- **Bulldozer — CLEAR 3:** removes your bottom three rows. Nothing is scored or sent to rivals.
- **Lightning — 2× SPEED:** every rival still in the round gets their *next* piece falling at double speed (a "2× SPEED" badge shows on their board). Holding that piece doesn't dodge it.

In solo practice only the bulldozer is available.

**Three players:** when someone tops out they watch the rest of the round; the last one standing takes it. If a player leaves mid-match the others carry on.

## How it works

Everything the phones run is in `index.html` — no build step. The host's phone is the hub: it decides who is out and who wins each round, and passes boards and attacks between the other phones. Everyone gets the same piece sequence each round from a shared random seed.

The phones can be linked two ways:

- **Online (Wi-Fi or mobile data).** Each game code gets a small "room" on Cloudflare's free Workers plan (`server/`). Every phone opens a WebSocket to the room, which passes messages between the host and the others. Used whenever `ROOMS_URL` in `index.html` is set and the room server can be reached.
- **Direct (same Wi-Fi only).** Phones connect straight to each other with WebRTC via [PeerJS](https://peerjs.com/) (v1.5.5). Used if the room server isn't set up or can't be reached — for example if Cloudflare's free daily limit has been reached, in which case it stops for the day rather than charging.

The bottom of the menu shows "online ✓" when the room server is reachable, and the lobby says whether the game is online or direct.

## The room server (`server/`)

A Cloudflare Worker with one SQLite-backed Durable Object per game code, deployed from this repo with Cloudflare's GitHub integration (root directory `server`, Worker name `greenblock-rooms`, deploy command `npx wrangler deploy`). It only accepts connections from `https://verte123.github.io`, and runs entirely on the free plan — no payment card.

## Testing on one computer

Open `index.html?local` in several tabs of the same browser — they link through the browser instead of the internet. Host in one tab and join with the code in the others. To run the room server locally: `cd server && npx wrangler dev`.
