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

Everything is in `index.html` — no build step. The phones connect directly using WebRTC via [PeerJS](https://peerjs.com/) (v1.5.5); PeerJS's free public server is only used to introduce them. The host's phone is the hub: the other phones connect to it, and it passes boards and attacks between them and decides who is out and who wins each round. Everyone gets the same piece sequence each round from a shared random seed.

Because PeerJS no longer offers a free relay server, playing on mobile data or on different networks may fail to connect; on the same home Wi-Fi it should connect directly.

All phones must be on the same version (shown at the bottom of the menu, currently v3). If one says it has a different version, refresh the page on every phone.

## Testing on one computer

Open `index.html?local` in several tabs of the same browser — they link through the browser instead of the internet. Host in one tab and join with the code in the others.
