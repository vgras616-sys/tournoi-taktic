"""Test réseau : deux pages (hôte + ami) via un faux PeerJS ; chacune joue avec de vrais clics."""
import sys, json, random, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'duel'
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/home/claude/tac-tik')
Handler.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 8765), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
stub = open('/home/claude/tac-tik/tests/peer_stub.js').read()
errors = []

class Bot:
    def __init__(self, pg): self.pg = pg; self.moves = 0
    def click_pawn(self, s, i):
        self.pg.evaluate("([s,i])=>{const g=document.querySelector(`#board .pawn[data-s='${s}'][data-i='${i}']`);g.querySelector('.body').dispatchEvent(new MouseEvent('click',{bubbles:true}))}", [s, i])
    def click_card(self, k):
        self.pg.evaluate("""(k)=>{const lab={'-4':'−4','P':'⇄','7':'7×1'}; const t=lab[k]||k;
          [...document.querySelectorAll('#hand .card')].find(c=>c.querySelector('.big').textContent===t && !c.classList.contains('off')).click();}""", k)
    def step(self):
        pg = self.pg
        st = pg.evaluate("""()=>{const t=window.__tt, v=t.G.view; if(!v) return null; return {phase:v.phase, turn:v.turn, my:t.G.mySeat, waiting:t.G.waiting,
            n:t.G.acts.length, acts:t.G.acts.map(a=>a.d), sc:v.swapChoice}}""")
        if not st: return 'wait'
        if st['phase'] == 'over': return 'over'
        if st['phase'] == 'swap':
            if not st['sc'][st['my']] and not st['waiting']:
                pg.evaluate("document.querySelector('#hand .card').click()")
            return 'wait'
        if st['turn'] != st['my'] or st['waiting']: return 'wait'
        if st['n'] == 0:
            pg.evaluate("document.querySelector('#hand .card').click()"); self.moves += 1; return 'act'
        d = random.choice(st['acts']); self.click_card(d['k'])
        cs = pg.evaluate("TT.ctrlSeat(__tt.G.view, __tt.G.mySeat)")
        k = d['kind']
        def confirm_if_needed():
            done = pg.evaluate("__tt.G.waiting || __tt.G.view.turn!==__tt.G.mySeat || __tt.G.view.phase!=='play'")
            if not done: pg.click('#btn-ok')
        if k in ('fwd', 'back', 'start'): self.click_pawn(cs, d['pawn']); confirm_if_needed()
        elif k == 'swap': self.click_pawn(cs, d['pawn']); self.click_pawn(d['tseat'], d['tpawn']); pg.click('#btn-ok')
        elif k == 'seven':
            for i in d['seq']: self.click_pawn(cs, i)
            pg.click('#btn-ok')
        self.moves += 1; return 'act'

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 900, 'height': 800})
    fast = "const st=window.setTimeout;window.setTimeout=(f,t,...a)=>st(f,(t||0)*0.05,...a);"
    ctx.route('**/peerjs*', lambda r: r.fulfill(body=stub, content_type='application/javascript'))
    A = ctx.new_page(); B = ctx.new_page()
    for pg in (A, B):
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.add_init_script(fast)
    A.goto('http://127.0.0.1:8765/index.html'); A.fill('#name', 'Hôte'); A.click('#btn-new')
    A.click(f'#mode-seg button[data-mode="{MODE}"]')
    A.select_option('#seats .seat:nth-child(2) select', 'friend')       # siège 1 = ami
    A.wait_for_function("document.querySelector('#room-code').textContent.length===5")
    code = A.inner_text('#room-code'); print('code salle', code)
    assert A.evaluate("document.querySelector('#btn-start').disabled"), 'start doit être bloqué'
    B.goto(f'http://127.0.0.1:8765/index.html?room={code}')
    B.wait_for_selector('#lobby.active')
    A.wait_for_function("!document.querySelector('#btn-start').disabled")
    print('ami connecté ; lobby client :', B.inner_text('#client-seats').replace('\n', ' | '))
    A.click('#btn-start')
    B.wait_for_selector('#game.active')
    bots = [Bot(A), Bot(B)]
    for it in range(20000):
        r = [bot.step() for bot in bots]
        if 'over' in r: break
        if 'act' not in r:
            A.wait_for_timeout(10)
    va = A.evaluate("({ph:__tt.G.view.phase,w:__tt.G.view.winner,t:__tt.G.view.turns})")
    vb = B.evaluate("({ph:__tt.G.view.phase,w:__tt.G.view.winner,t:__tt.G.view.turns, over:!document.querySelector('#over').classList.contains('hidden'), again:!document.querySelector('#over-again').classList.contains('hidden')})")
    print('hôte', va, '| ami', vb, '| coups', [x.moves for x in bots], '| erreurs', errors[:5])
    # l'ami ne doit jamais voir la main de l'hôte
    leak = B.evaluate("__tt.G.view.hands.map((h,s)=>s===__tt.G.mySeat?0:h.filter(x=>x!==null).length).reduce((a,b)=>a+b,0)")
    print('fuite de cartes vers le client :', leak)
    b.close()
