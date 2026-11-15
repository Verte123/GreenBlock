# Green Games

Three family games for phones, hosted on GitHub Pages: **GreenBlock** (a falling-block battle), **FightyBoats** (canal-boat battleships) and **ScrappyChess** (chess with battling cartoon castle folk). GreenBlock and FightyBoats take two or three players and have a solo mode; ScrappyChess is for two. All work on Wi-Fi or mobile data.

## Playing

1. Every phone opens the game link in Safari (optionally Share → **Add to Home Screen** for a full-screen app icon).
2. One player taps **Host** on the game they want and reads out the 4-letter code.
3. The others type the code and tap **Join**. The host taps **Start match** once two or three players are in.

**Controls:** tap to rotate · drag sideways to move · drag down to soft drop · flick down to drop · flick up to hold. On a computer: arrow keys, Space to drop, Z/X to rotate, C to hold.

**Attacks:** 2 lines → 1 row, 3 lines → 2 rows, 4 lines → 4 rows, +1 for back-to-back fours, extra for combos (consecutive clearing pieces) and +4 for clearing the whole board. Each attack goes to a randomly chosen rival who is still in. Clearing lines cancels rows waiting to hit you first (the red bar beside your board). The game speeds up every 30 seconds.

**Power-ups** (buttons on the right, each usable once per round):
- **Bulldozer — CLEAR 3:** removes your bottom three rows. Nothing is scored or sent to rivals.
- **Lightning — 2× SPEED:** every rival still in the round gets their *next* piece falling at double speed (a "2× SPEED" badge shows on their board). Holding that piece doesn't dodge it.

In solo practice only the bulldozer is available.

**Three players:** when someone tops out they watch the rest of the round; the last one standing takes it. If a player leaves mid-match the others carry on.

## FightyBoats

Each player hides five canal boats on their own 10×10 canal — Narrowboat (5), Widebeam (4), Butty (3), Cruiser (3) and Tender (2). Tap a boat, then tap the water to move it; tap it again to turn it; **Shuffle** places them at random; **Ready!** when done.

Players take turns firing one shot. Tap a square to aim, then tap it again (or press Fire). With three players, the name tabs choose whose waters you fire into. Every shot and result is shown to everyone; sunk boats are revealed. A player whose whole fleet is sunk is out and watches; the last fleet afloat wins. After the game everyone's boats are revealed, and **Rematch** keeps a running score. **Vs computer** plays against a computer that hunts on a checkerboard and follows up its hits.

**Power-ups** (each once per game):
- **Move boat** — at any point in the battle, without using your turn, move one of your boats (even a damaged one) into water nobody has fired at. A damaged boat keeps its damage: the hit sections move with it, so it still only needs its remaining sections hit. Rivals are told "… moved a boat!" and the old hit marks fade. Sunk boats can't be moved.
- **Big bomb** — instead of a normal shot, hit two squares side by side in one rival's waters. Tap a square to aim, tap it again to turn the bomb across or down, then **Drop bomb**.

The computer uses both: it bombs to follow up a line of hits (or late in a long search) and moves a damaged boat when it's close to sinking.

Each phone keeps its own fleet secret and answers the shots fired at it; the host's phone keeps track of turns, who is out and who has won. The code is in `fightyboats.js`.

## ScrappyChess

Chess for two with the full rules (castling, en passant, promotion with a choice of piece, check, checkmate, stalemate, and draws by repetition, the 50-move rule or too few pieces). The pieces are original cartoon characters: King, Queen, Tower (rook), Wizard (bishop), Knight (a hobby horse) and Squire (pawn), in a cream team and a purple team. Each player sees their own side at the bottom. Tap a piece, then tap a dot to move; a red ring marks a piece you can take. Taking a piece plays a short battle scene (tap to skip). Sides swap on each rematch and a running score is kept.

**Power-ups** (each once per game):
- **Undo** — takes back your last move; if your rival has already replied, their reply is taken back too. Your rival is told.
- **Hint** — a small chess computer built into the page looks a few moves ahead and shows a suggested move.

**Saved games:** an unfinished game is saved in each phone's browser storage after every move (one saved game per phone). To carry on, either player hosts ScrappyChess and taps **Resume saved game** in the lobby once the other has joined; the position, sides, score and used power-ups come back. A finished game is removed. Starting a new game instead replaces the saved one once the first move is made.

The host's phone puts the moves in order: the other phone asks to move, the host checks the move is legal and tells both phones. If a phone ever falls out of step it asks the host for the full list of moves. The code is in `chess.js`; the rules are checked against published move counts ("perft") for six test positions.

## How it works

Everything the phones run is in `index.html` (home screen, lobby, connections and GreenBlock), `fightyboats.js` and `chess.js` — no build step. The host's phone is the hub: it decides who is out and who wins each round, and passes boards and attacks between the other phones. Everyone gets the same piece sequence each round from a shared random seed.

The phones can be linked two ways:

- **Online (Wi-Fi or mobile data).** Each game code gets a small "room" on Cloudflare's free Workers plan (`server/`). Every phone opens a WebSocket to the room, which passes messages between the host and the others. Used whenever `ROOMS_URL` in `index.html` is set and the room server can be reached.
- **Direct (same Wi-Fi only).** Phones connect straight to each other with WebRTC via [PeerJS](https://peerjs.com/) (v1.5.5). Used if the room server isn't set up or can't be reached — for example if Cloudflare's free daily limit has been reached, in which case it stops for the day rather than charging.

The bottom of the menu shows "online ✓" when the room server is reachable, and the lobby says whether the game is online or direct.

## The room server (`server/`)

A Cloudflare Worker with one SQLite-backed Durable Object per game code, deployed from this repo with Cloudflare's GitHub integration (root directory `server`, Worker name `greenblock-rooms`, deploy command `npx wrangler deploy`). It only accepts connections from `https://verte123.github.io`, and runs entirely on the free plan — no payment card.

Live address: `wss://greenblock-rooms.ric-green.workers.dev` (opening `https://greenblock-rooms.ric-green.workers.dev/` in a browser should say "GreenBlock game rooms are running.").

## Testing on one computer

Open `index.html?local` in several tabs of the same browser — they link through the browser instead of the internet. Host in one tab and join with the code in the others. To run the room server locally: `cd server && npx wrangler dev`.
