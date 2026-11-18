/* Tac Tik — couche réseau (WebRTC pair-à-pair via PeerJS, aucun serveur à héberger).
   L'hôte fait autorité : il valide les coups et envoie à chacun sa vue (sans les mains des autres). */
(function (root) {
  'use strict';
  const PREFIX = 'tactik-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PEER_OPTS = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    }
  };

  function randomCode() {
    let c = '';
    const a = new Uint8Array(5);
    (self.crypto || window.crypto).getRandomValues(a);
    a.forEach(v => { c += ALPHABET[v % ALPHABET.length]; });
    return c;
  }

  // ---- hôte ----
  function createHost(handlers) {
    // handlers: {onReady(code), onConn(connId), onMsg(connId,msg), onClose(connId), onError(err)}
    const conns = new Map();
    let peer = null, code = null, tries = 0;
    function open() {
      code = randomCode();
      peer = new Peer(PREFIX + code, PEER_OPTS);
      peer.on('open', () => handlers.onReady(code));
      peer.on('error', err => {
        if (err.type === 'unavailable-id' && tries++ < 5) { try { peer.destroy(); } catch (e) {} open(); return; }
        handlers.onError(err);
      });
      peer.on('connection', conn => {
        const id = conn.peer;
        conn.on('open', () => { conns.set(id, conn); handlers.onConn(id); });
        conn.on('data', msg => handlers.onMsg(id, msg));
        conn.on('close', () => { if (conns.get(id) === conn) conns.delete(id); handlers.onClose(id); });
        conn.on('error', () => {});
      });
    }
    open();
    return {
      get code() { return code; },
      send(id, msg) { const c = conns.get(id); if (c && c.open) c.send(msg); },
      broadcast(msg) { conns.forEach(c => { if (c.open) c.send(msg); }); },
      has(id) { return conns.has(id); },
      close() { try { conns.forEach(c => c.close()); peer.destroy(); } catch (e) {} }
    };
  }

  // ---- client ----
  function joinRoom(code, handlers) {
    // handlers: {onOpen(), onMsg(msg), onClose(), onError(err)}
    const peer = new Peer(undefined, PEER_OPTS);
    let conn = null, opened = false;
    const timeout = setTimeout(() => { if (!opened) handlers.onError({ type: 'timeout' }); }, 15000);
    peer.on('open', () => {
      conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
      conn.on('open', () => { opened = true; clearTimeout(timeout); handlers.onOpen(); });
      conn.on('data', msg => handlers.onMsg(msg));
      conn.on('close', () => handlers.onClose());
      conn.on('error', err => handlers.onError(err));
    });
    peer.on('error', err => { clearTimeout(timeout); handlers.onError(err); });
    return {
      send(msg) { if (conn && conn.open) conn.send(msg); },
      close() { try { clearTimeout(timeout); if (conn) conn.close(); peer.destroy(); } catch (e) {} }
    };
  }

  root.TTNet = { createHost, joinRoom };
})(window);
