# Connect Four — Ten Themes

A two-player Connect Four web game with:

- Pass-and-play mode on one device
- Direct browser-to-browser online mode using WebRTC
- Ten board and piece-color themes
- Responsive desktop and mobile layout
- Keyboard controls (number keys 1–7)
- Win detection, draw detection, undo, and rematch
- No framework, build step, account, or game server required

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static web server.

Example:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Online match instructions

1. Both players open the game.
2. Player 1 selects **Online → Host game** and sends the generated host code to Player 2.
3. Player 2 selects **Online → Join game**, pastes the host code, and creates an answer code.
4. Player 2 sends the answer code back to Player 1.
5. Player 1 pastes the answer code and selects **Connect**.

The game uses public STUN servers for peer discovery. WebRTC may fail on some restrictive corporate, school, or carrier networks because this static version does not include a TURN relay server.
