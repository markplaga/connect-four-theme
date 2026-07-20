import type { Config, Context } from '@netlify/functions';
import { getDeployStore, getStore } from '@netlify/blobs';

const ROWS = 6;
const COLS = 7;
const ROOM_TTL = 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  'https://markplaga.github.io',
  'http://localhost:8888',
  'http://127.0.0.1:8888'
]);

type Move = { row: number; col: number; player: 1 | 2 };
type Player = { token: string; joinedAt: string };
type RoomStatus = 'waiting' | 'playing' | 'finished' | 'draw';
type Room = {
  code: string;
  createdAt: string;
  updatedAt: string;
  status: RoomStatus;
  players: Player[];
  board: number[][];
  currentPlayer: 1 | 2;
  winner: 1 | 2 | null;
  winningCells: number[][];
  history: Move[];
  themeIndex: number;
  lastEvent: null | {
    id: string;
    type: 'joined' | 'move' | 'reset' | 'undo' | 'theme';
    player: number;
    at: string;
  };
};

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = { vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
    headers['access-control-allow-headers'] = 'content-type';
    headers['access-control-max-age'] = '86400';
  }
  return headers;
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(req)
    }
  });
}

function preflight(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, { status: 403, headers: { vary: 'Origin' } });
  }
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const makeToken = () => crypto.randomUUID().replaceAll('-', '');
const roomKey = (code: string) => `room/${code}`;

const makeCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
};

function playerIndex(room: Room, token: string | null) {
  return room.players.findIndex(player => player.token === token);
}

function findWin(board: number[][], row: number, col: number, player: number) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const cells = [[row, col]];
    for (const sign of [-1, 1]) {
      let nextRow = row + dr * sign;
      let nextCol = col + dc * sign;
      while (
        nextRow >= 0 && nextRow < ROWS &&
        nextCol >= 0 && nextCol < COLS &&
        board[nextRow][nextCol] === player
      ) {
        cells.push([nextRow, nextCol]);
        nextRow += dr * sign;
        nextCol += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

function publicState(room: Room, index: number) {
  return {
    code: room.code,
    status: room.status,
    playerIndex: index,
    playerCount: room.players.length,
    board: room.board,
    currentPlayer: room.currentPlayer,
    winner: room.winner,
    winningCells: room.winningCells,
    history: room.history,
    themeIndex: room.themeIndex,
    isYourTurn: room.currentPlayer === index + 1,
    lastEvent: room.lastEvent,
    updatedAt: room.updatedAt
  };
}

function roomStore(context: Context) {
  return context.deploy.context === 'production'
    ? getStore('connect-four-rooms', { consistency: 'strong' })
    : getDeployStore({ name: 'connect-four-rooms', deployID: context.deploy.id });
}

async function loadRoom(context: Context, code: string) {
  const store = roomStore(context);
  const room = (await store.get(roomKey(code), { type: 'json' })) as Room | null;
  if (!room) return { store, room: null };
  if (Date.now() - new Date(room.updatedAt).getTime() > ROOM_TTL) {
    await store.delete(roomKey(code));
    return { store, room: null };
  }
  return { store, room };
}

export default async (req: Request, context: Context) => {
  try {
    if (req.method === 'OPTIONS') return preflight(req);
    if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || '');

    if (action === 'create') {
      const store = roomStore(context);
      let code = '';
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = makeCode();
        if (!await store.get(roomKey(candidate))) {
          code = candidate;
          break;
        }
      }
      if (!code) return json(req, { error: 'Unable to reserve a room code. Please try again.' }, 503);

      const token = makeToken();
      const now = new Date().toISOString();
      const rawTheme = Number(body.themeIndex);
      const themeIndex = Number.isInteger(rawTheme) && rawTheme >= 0 && rawTheme < 10 ? rawTheme : 0;
      const room: Room = {
        code,
        createdAt: now,
        updatedAt: now,
        status: 'waiting',
        players: [{ token, joinedAt: now }],
        board: emptyBoard(),
        currentPlayer: 1,
        winner: null,
        winningCells: [],
        history: [],
        themeIndex,
        lastEvent: null
      };
      await store.setJSON(roomKey(code), room);
      return json(req, { code, token, state: publicState(room, 0) }, 201);
    }

    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return json(req, { error: 'Enter a valid six-character room code.' }, 400);
    const { store, room } = await loadRoom(context, code);
    if (!room) return json(req, { error: 'Room not found or expired.' }, 404);

    if (action === 'join') {
      if (room.players.length >= 2) return json(req, { error: 'That room is already full.' }, 409);
      const token = makeToken();
      const now = new Date().toISOString();
      room.players.push({ token, joinedAt: now });
      room.status = 'playing';
      room.updatedAt = now;
      room.lastEvent = { id: crypto.randomUUID(), type: 'joined', player: 2, at: now };
      await store.setJSON(roomKey(code), room);
      return json(req, { code, token, state: publicState(room, 1) });
    }

    const token = String(body.token || '');
    const index = playerIndex(room, token);
    if (index < 0) return json(req, { error: 'This player token is not valid for the room.' }, 403);

    if (action === 'state') return json(req, publicState(room, index));

    if (action === 'move') {
      if (room.players.length < 2 || room.status === 'waiting') return json(req, { error: 'Waiting for Player 2 to join.' }, 409);
      if (room.status === 'finished' || room.status === 'draw') return json(req, { error: 'Start a new game to continue.' }, 409);
      const player = (index + 1) as 1 | 2;
      if (room.currentPlayer !== player) return json(req, { error: 'It is not your turn.' }, 409);
      const col = Number(body.col);
      if (!Number.isInteger(col) || col < 0 || col >= COLS) return json(req, { error: 'Invalid column.' }, 400);

      let row = -1;
      for (let candidate = ROWS - 1; candidate >= 0; candidate -= 1) {
        if (room.board[candidate][col] === 0) { row = candidate; break; }
      }
      if (row < 0) return json(req, { error: 'That column is full.' }, 409);

      room.board[row][col] = player;
      room.history.push({ row, col, player });
      room.winningCells = findWin(room.board, row, col, player);
      if (room.winningCells.length >= 4) {
        room.status = 'finished';
        room.winner = player;
      } else if (room.board.every(boardRow => boardRow.every(Boolean))) {
        room.status = 'draw';
        room.winner = null;
      } else {
        room.currentPlayer = player === 1 ? 2 : 1;
      }
      const now = new Date().toISOString();
      room.updatedAt = now;
      room.lastEvent = { id: crypto.randomUUID(), type: 'move', player, at: now };
      await store.setJSON(roomKey(code), room);
      return json(req, publicState(room, index));
    }

    if (action === 'reset') {
      const now = new Date().toISOString();
      room.board = emptyBoard();
      room.currentPlayer = 1;
      room.winner = null;
      room.winningCells = [];
      room.history = [];
      room.status = room.players.length === 2 ? 'playing' : 'waiting';
      room.updatedAt = now;
      room.lastEvent = { id: crypto.randomUUID(), type: 'reset', player: index + 1, at: now };
      await store.setJSON(roomKey(code), room);
      return json(req, publicState(room, index));
    }

    if (action === 'undo') {
      const last = room.history.pop();
      if (!last) return json(req, { error: 'There is no move to undo.' }, 409);
      room.board[last.row][last.col] = 0;
      room.currentPlayer = last.player;
      room.status = room.players.length === 2 ? 'playing' : 'waiting';
      room.winner = null;
      room.winningCells = [];
      const now = new Date().toISOString();
      room.updatedAt = now;
      room.lastEvent = { id: crypto.randomUUID(), type: 'undo', player: index + 1, at: now };
      await store.setJSON(roomKey(code), room);
      return json(req, publicState(room, index));
    }

    if (action === 'theme') {
      const nextTheme = Number(body.themeIndex);
      if (!Number.isInteger(nextTheme) || nextTheme < 0 || nextTheme >= 10) return json(req, { error: 'Invalid theme.' }, 400);
      room.themeIndex = nextTheme;
      const now = new Date().toISOString();
      room.updatedAt = now;
      room.lastEvent = { id: crypto.randomUUID(), type: 'theme', player: index + 1, at: now };
      await store.setJSON(roomKey(code), room);
      return json(req, publicState(room, index));
    }

    return json(req, { error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error(error);
    return json(req, { error: 'The game server encountered an error.' }, 500);
  }
};

export const config: Config = {
  path: ['/api/room', '/api/room/:code']
};
