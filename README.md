# Connect Four — Ten Themes

A responsive two-player Connect Four browser game with pass-and-play and private online rooms.

## Features

- Pass-and-play on one device
- Online play with one six-character room code
- Ten board and piece-color themes
- Server-validated turns, moves, wins, draws, resets, undo, and theme changes
- Private player tokens stored in the browser session
- Automatic reconnection after refreshing the same browser tab
- Rooms expire after 24 hours
- Responsive desktop and mobile layout
- Keyboard controls with number keys 1–7

## Online architecture

The online mode follows the same model as the Battleship game:

- The static interface can be hosted on GitHub Pages or Netlify.
- A Netlify Function at `netlify/functions/room.ts` creates and manages rooms.
- Netlify Blobs stores expiring room state.
- Player 1 creates a room and sends the six-character code to Player 2.
- Player 2 enters only that room code and joins.

When the frontend is served from `markplaga.github.io`, it uses:

```text
https://connect-four-theme.netlify.app/api/room
```

For another frontend host, set `window.CONNECT_FOUR_API_ORIGIN` before loading `game-online.js`.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Netlify Dev serves the game and `/api/room` together.

## Checks

```bash
npm run check
```

## Deploy

Link this repository to a Netlify site and deploy:

```bash
npm run deploy
```
