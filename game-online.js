    function createPeer() {
      if (pc) pc.close();
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          connected = true;
          setConnectionState('connected', 'Connected — game ready');
          $('disconnectBtn').classList.remove('hidden');
          $('onlineChoice').classList.add('hidden');
          newGame(false);
          updateOnlineNames();
          if (onlineRole === 'host') send({ type:'theme', themeIndex });
        } else if (['failed','disconnected','closed'].includes(pc.connectionState)) {
          connected = false;
          setConnectionState('error', pc.connectionState === 'failed' ? 'Connection failed' : 'Disconnected');
          render();
        } else {
          setConnectionState('connecting', `Connection: ${pc.connectionState}`);
        }
      };
      return pc;
    }

    function attachChannel(ch) {
      channel = ch;
      channel.onopen = () => {
        connected = true;
        setConnectionState('connected', 'Connected — game ready');
        $('disconnectBtn').classList.remove('hidden');
        $('onlineChoice').classList.add('hidden');
        newGame(false);
        updateOnlineNames();
        if (onlineRole === 'host') send({ type:'theme', themeIndex });
      };
      channel.onclose = () => {
        connected = false;
        setConnectionState('error', 'Disconnected');
        render();
      };
      channel.onerror = () => setConnectionState('error', 'Connection error');
      channel.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'move') makeMove(Number(data.col), true);
          if (data.type === 'reset') newGame(false);
          if (data.type === 'undo') undo(false);
          if (data.type === 'theme') applyTheme(Number(data.themeIndex), false);
        } catch (error) {
          console.error(error);
        }
      };
    }

    function send(payload) {
      if (channel?.readyState === 'open') channel.send(JSON.stringify(payload));
    }

    function updateOnlineNames() {
      $('player1Name').textContent = onlineRole === 'host' ? 'You — Player 1' : 'Opponent — Player 1';
      $('player2Name').textContent = onlineRole === 'guest' ? 'You — Player 2' : 'Opponent — Player 2';
      render();
    }

    function waitForIceComplete(peer) {
      return new Promise(resolve => {
        if (peer.iceGatheringState === 'complete') return resolve();
        const handler = () => {
          if (peer.iceGatheringState === 'complete') {
            peer.removeEventListener('icegatheringstatechange', handler);
            resolve();
          }
        };
        peer.addEventListener('icegatheringstatechange', handler);
        setTimeout(resolve, 6000);
      });
    }

    function encodeDescription(desc) {
      const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
      return btoa(unescape(encodeURIComponent(json)));
    }
    function decodeDescription(code) {
      const json = decodeURIComponent(escape(atob(code.trim())));
      return JSON.parse(json);
    }

    async function hostGame() {
      try {
        disconnect(false);
        setMode('online');
        onlineRole = 'host';
        updateOnlineNames();
        $('hostSteps').classList.remove('hidden');
        $('joinSteps').classList.add('hidden');
        setConnectionState('connecting', 'Creating host code…');
        const peer = createPeer();
        attachChannel(peer.createDataChannel('connect-four'));
        await peer.setLocalDescription(await peer.createOffer());
        await waitForIceComplete(peer);
        $('hostOffer').value = encodeDescription(peer.localDescription);
        setConnectionState('connecting', 'Send the host code to Player 2');
      } catch (error) {
        console.error(error);
        setConnectionState('error', 'Could not create host game');
        toast('Could not create a host code.');
      }
    }

    async function joinGame() {
      disconnect(false);
      setMode('online');
      onlineRole = 'guest';
      updateOnlineNames();
      $('joinSteps').classList.remove('hidden');
      $('hostSteps').classList.add('hidden');
      $('answerStep').classList.add('hidden');
      setConnectionState('', 'Paste the host code');
    }

    async function makeAnswer() {
      try {
        const offerCode = $('joinOffer').value.trim();
        if (!offerCode) return toast('Paste the host code first.');
        setConnectionState('connecting', 'Creating answer code…');
        const peer = createPeer();
        peer.ondatachannel = event => attachChannel(event.channel);
        await peer.setRemoteDescription(decodeDescription(offerCode));
        await peer.setLocalDescription(await peer.createAnswer());
        await waitForIceComplete(peer);
        $('joinAnswer').value = encodeDescription(peer.localDescription);
        $('answerStep').classList.remove('hidden');
        setConnectionState('connecting', 'Send the answer code to Player 1');
      } catch (error) {
        console.error(error);
        setConnectionState('error', 'Invalid host code');
        toast('That host code could not be read.');
      }
    }

    async function acceptAnswer() {
      try {
        const answerCode = $('hostAnswer').value.trim();
        if (!answerCode) return toast("Paste Player 2's answer code first.");
        setConnectionState('connecting', 'Connecting…');
        await pc.setRemoteDescription(decodeDescription(answerCode));
      } catch (error) {
        console.error(error);
        setConnectionState('error', 'Invalid answer code');
        toast('That answer code could not be read.');
      }
    }

    function disconnect(resetUI = true) {
      connected = false;
      try { channel?.close(); } catch {}
      try { pc?.close(); } catch {}
      channel = null;
      pc = null;
      if (resetUI) {
        onlineRole = null;
        $('onlineChoice').classList.remove('hidden');
        $('hostSteps').classList.add('hidden');
        $('joinSteps').classList.add('hidden');
        $('disconnectBtn').classList.add('hidden');
        $('hostOffer').value = '';
        $('hostAnswer').value = '';
        $('joinOffer').value = '';
        $('joinAnswer').value = '';
        setConnectionState('', 'Not connected');
        newGame(false);
        updateOnlineNames();
      }
    }

    $('themeSelect').addEventListener('change', e => applyTheme(e.target.value, true));
    $('localModeBtn').addEventListener('click', () => { disconnect(); setMode('local'); });
    $('onlineModeBtn').addEventListener('click', () => setMode('online'));
    $('newGameBtn').addEventListener('click', () => newGame(true));
    $('undoBtn').addEventListener('click', () => undo(true));
    $('hostBtn').addEventListener('click', hostGame);
    $('joinBtn').addEventListener('click', joinGame);
    $('makeAnswerBtn').addEventListener('click', makeAnswer);
    $('acceptAnswerBtn').addEventListener('click', acceptAnswer);
    $('disconnectBtn').addEventListener('click', () => disconnect(true));

    document.addEventListener('click', async event => {
      const target = event.target.closest('[data-copy]');
      if (!target) return;
      const source = $(target.dataset.copy);
      try {
        await navigator.clipboard.writeText(source.value);
        toast('Copied to clipboard.');
      } catch {
        source.select();
        document.execCommand('copy');
        toast('Copied to clipboard.');
      }
    });

    document.addEventListener('keydown', event => {
      if (/^[1-7]$/.test(event.key) && !['TEXTAREA','SELECT','INPUT'].includes(document.activeElement.tagName)) {
        handleColumn(Number(event.key) - 1);
      }
    });

    window.addEventListener('beforeunload', () => disconnect(false));
    buildUI();
