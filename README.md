# GreenBlock

A two-player falling-block duel for two phones on the same Wi-Fi. Both players play at once on their own boards; clearing several lines at once sends grey rows to your rival. Last board standing wins the round, first to two rounds wins the match.

## Playing

1. Both phones open the game link in Safari (optionally Share → **Add to Home Screen** for a full-screen app icon).
2. One player taps **Host a game** and reads out the 4-letter code.
3. The other types the code and taps **Join**. The host taps **Start match**.

**Controls:** tap to rotate · drag sideways to move · drag down to soft drop · flick down to drop · flick up to hold. On a computer: arrow keys, Space to drop, Z/X to rotate, C to hold.

**Attacks:** 2 lines → 1 row, 3 lines → 2 rows, 4 lines → 4 rows, +1 for back-to-back fours, extra for combos (consecutive clearing pieces) and +4 for clearing the whole board. Clearing lines cancels rows waiting to hit you first (the red bar beside your board). The game speeds up every 30 seconds.

## How it works

Everything is in `index.html` — no build step. The two phones connect directly to each other using WebRTC via [PeerJS](https://peerjs.com/) (v1.5.5); PeerJS's free public server is only used to introduce the phones, and game data goes phone to phone. Both phones get the same piece sequence each round from a shared random seed. The host phone decides who won each round.

Because PeerJS no longer offers a free relay server, playing on mobile data or on different networks may fail to connect; on the same home Wi-Fi it should connect directly.

## Testing on one computer

Open `index.html?local` in two tabs of the same browser — they link through the browser instead of the internet. Host in one tab, join with the code in the other.
