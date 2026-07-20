const ONLINE_SESSION_KEY = 'connect-four-online-session-v1';
const API_ORIGIN = (() => {
  const configured = String(window.CONNECT_FOUR_API_ORIGIN || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  if (location.hostname === 'markplaga.github.io') return 'https://connect-four-theme.netlify.app';
  return '';
})();

let onlineCode = '';
let onlineToken = '';
let pollTimer = null;
let requestBusy = false;
let lastEventId = '';

function apiUrl(path) {
  return `${API_ORIGIN}${path}`;
}

function saveOnlineSession() {
  if (!onlineCode || !onlineToken || !onlineRole) return;
  try {
    sessionStorage.setItem(ONLINE_SESSION_KEY, JSON.stringify({
      code: onlineCode,
      token: onlineToken,
      role: onlineRole
    }));
  } catch {}
}

function loadOnlineSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(ONLINE_SESSION_KEY) || 'null');
    if (!value || !/^[A-Z2-9]{6}$/.test(String(value.code || '')) || !value.token) return null;
    return {
      code: String(value.code).toUpperCase(),
      token: String(value.token),
      role: value.role === 'guest' ? 'guest' : 'host'
    };
  } catch {
    return null;
  }
}

function clearOnlineSession() {
  try { sessionStorage.removeItem(ONLINE_SESSION_KEY); } catch {}
}

function updateOnlineNames() {
  $('player1Name').textContent = onlineRole === 'host' ? 'You — Player 1' : onlineRole === 'guest' ? 'Opponent — Player 1' : 'Player 1';
  $('player2Name').textContent = onlineRole === 'guest' ? 'You — Player 2' : onlineRole === 'host' ? 'Opponent — Player 2' : 'Player 2';
}

function showRoom(remote) {
  const active = Boolean(onlineCode && onlineToken);
  $('onlineChoice').classList.toggle('hidden', active);
  $('activeRoom').classList.toggle('hidden', !active);
  $('disconnectBtn').classList.toggle('hidden', !active);
  $('activeRoomCode').textContent = onlineCode || '------';
  if (!active) {
    setConnectionState('', 'Not connected');
    return;
  }
  if (remote?.playerCount === 2) {
    setConnectionState('connected', `Room ${onlineCode} — game ready`);
  } else {
    setConnectionState('connecting', `Room ${onlineCode} — waiting for Player 2`);
  }
}

function syncRoom(remote) {
  if (!remote) return;
  const event = remote.lastEvent;
  if (event?.id && event.id !== lastEventId) {
    if (lastEventId && event.type === 'joined') toast('Player 2 joined the room.');
    if (lastEventId && event.type === 'reset') toast('A new game started.');
    if (lastEventId && event.type === 'undo') toast('The last move was undone.');
    lastEventId = event.id;
  }
  syncOnlineState(remote);
  showRoom(remote);
  updateOnlineNames();
}

async function createRoom() {
  if (requestBusy) return;
  requestBusy = true;
  setMode('online');
  setConnectionState('connecting', 'Creating room…');
  $('createRoomBtn').disabled = true;
  try {
    const data = await api('/api/room', { action: 'create', themeIndex });
    onlineCode = data.code;
    onlineToken = data.token;
    onlineRole = 'host';
    lastEventId = data.state?.lastEvent?.id || '';
    saveOnlineSession();
    window.history.replaceState({}, '', `${location.pathname}?room=${onlineCode}`);
    syncRoom(data.state);
    startPolling();
    toast(`Room ${onlineCode} created.`);
  } catch (error) {
    setConnectionState('error', 'Could not create room');
    toast(error instanceof Error ? error.message : 'Unable to create the room.');
  } finally {
    requestBusy = false;
    $('createRoomBtn').disabled = false;
  }
}

async function joinRoom() {
  if (requestBusy) return;
  const code = $('roomCode').value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) return toast('Enter the six-character room code.');
  requestBusy = true;
  setMode('online');
  setConnectionState('connecting', `Joining ${code}…`);
  $('joinRoomBtn').disabled = true;
  try {
    const data = await api('/api/room', { action: 'join', code });
    onlineCode = data.code;
    onlineToken = data.token;
    onlineRole = 'guest';
    lastEventId = data.state?.lastEvent?.id || '';
    saveOnlineSession();
    window.history.replaceState({}, '', `${location.pathname}?room=${onlineCode}`);
    syncRoom(data.state);
    startPolling();
    toast(`Joined room ${onlineCode}.`);
  } catch (error) {
    setConnectionState('error', 'Could not join room');
    toast(error instanceof Error ? error.message : 'Unable to join the room.');
  } finally {
    requestBusy = false;
    $('joinRoomBtn').disabled = false;
  }
}

async function resumeOnlineSession() {
  const saved = loadOnlineSession();
  const requestedRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (!saved) {
    if (requestedRoom) $('roomCode').value = requestedRoom;
    return false;
  }
  if (requestedRoom && requestedRoom !== saved.code) {
    clearOnlineSession();
    $('roomCode').value = requestedRoom;
    return false;
  }

  onlineCode = saved.code;
  onlineToken = saved.token;
  onlineRole = saved.role;
  setMode('online');
  showRoom();
  try {
    const remote = await api('/api/room', {
      action: 'state',
      code: onlineCode,
      token: onlineToken
    });
    lastEventId = remote.lastEvent?.id || '';
    syncRoom(remote);
    startPolling();
    return true;
  } catch {
    disconnectRoom(true);
    return false;
  }
}

async function onlineMove(col) {
  if (requestBusy) return;
  requestBusy = true;
  try {
    const remote = await api('/api/room', {
      action: 'move',
      code: onlineCode,
      token: onlineToken,
      col
    });
    syncRoom(remote);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'The move could not be recorded.');
    await pollRoom();
  } finally {
    requestBusy = false;
  }
}

async function onlineReset() {
  if (!onlineCode || !onlineToken || requestBusy) return;
  requestBusy = true;
  try {
    const remote = await api('/api/room', {
      action: 'reset',
      code: onlineCode,
      token: onlineToken
    });
    syncRoom(remote);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not start a new game.');
  } finally {
    requestBusy = false;
  }
}

async function onlineUndo() {
  if (!onlineCode || !onlineToken || requestBusy) return;
  requestBusy = true;
  try {
    const remote = await api('/api/room', {
      action: 'undo',
      code: onlineCode,
      token: onlineToken
    });
    syncRoom(remote);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not undo the move.');
  } finally {
    requestBusy = false;
  }
}

async function onlineSetTheme(nextThemeIndex) {
  if (!onlineCode || !onlineToken || requestBusy) return;
  try {
    const remote = await api('/api/room', {
      action: 'theme',
      code: onlineCode,
      token: onlineToken,
      themeIndex: nextThemeIndex
    });
    syncRoom(remote);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not change the room theme.');
  }
}

async function pollRoom() {
  if (!onlineCode || !onlineToken || mode !== 'online') return;
  try {
    const remote = await api('/api/room', {
      action: 'state',
      code: onlineCode,
      token: onlineToken
    });
    syncRoom(remote);
  } catch (error) {
    console.warn(error);
  }
}

function startPolling() {
  clearPolling();
  pollTimer = setInterval(pollRoom, 1200);
}

function clearPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function disconnectRoom(clearUrl = true) {
  clearPolling();
  clearOnlineSession();
  onlineCode = '';
  onlineToken = '';
  onlineRole = null;
  connected = false;
  lastEventId = '';
  showRoom();
  updateOnlineNames();
  resetLocalBoard();
  if (clearUrl) window.history.replaceState({}, '', location.pathname);
}

async function api(path, body) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Unable to reach the online game server.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The game server did not respond.');
  return data;
}

$('themeSelect').addEventListener('change', event => applyTheme(event.target.value, true));
$('localModeBtn').addEventListener('click', () => { disconnectRoom(); setMode('local'); });
$('onlineModeBtn').addEventListener('click', () => setMode('online'));
$('newGameBtn').addEventListener('click', () => newGame(true));
$('undoBtn').addEventListener('click', () => undo(true));
$('createRoomBtn').addEventListener('click', createRoom);
$('joinRoomBtn').addEventListener('click', joinRoom);
$('disconnectBtn').addEventListener('click', () => disconnectRoom(true));
$('roomCode').addEventListener('input', event => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
});
$('roomCode').addEventListener('keydown', event => {
  if (event.key === 'Enter') joinRoom();
});
$('copyRoomBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(onlineCode);
    toast('Room code copied.');
  } catch {
    toast(`Room code: ${onlineCode}`);
  }
});

document.addEventListener('keydown', event => {
  if (/^[1-7]$/.test(event.key) && !['TEXTAREA', 'SELECT', 'INPUT'].includes(document.activeElement.tagName)) {
    handleColumn(Number(event.key) - 1);
  }
});

window.addEventListener('beforeunload', clearPolling);
buildUI();
resumeOnlineSession();
