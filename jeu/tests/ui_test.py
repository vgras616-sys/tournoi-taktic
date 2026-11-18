"""Test navigateur : un « humain » automatique joue via de vrais clics contre 3 IA (mode 2v2)."""
import sys, json, random
from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'teams'
W, H = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1100, 900)
SHOT = sys.argv[4] if len(sys.argv) > 4 else '/tmp/shot'

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'peerjs' not in m.text and 'ERR_' not in m.text else None)
    pg.add_init_script("const st=window.setTimeout;window.setTimeout=(f,t,...a)=>st(f,(t||0)*0.04,...a);")
    pg.goto('file:///home/claude/tac-tik/index.html')
    pg.fill('#name', 'Victor')
    pg.click('#btn-new')
    pg.click(f'#mode-seg button[data-mode="{MODE}"]')
    pg.screenshot(path=SHOT + '_lobby.png')
    pg.click('#btn-start')
    pg.wait_for_selector('#game.active')

    def click_pawn(s, i):
        pg.evaluate("([s,i])=>{const g=document.querySelector(`#board .pawn[data-s='${s}'][data-i='${i}']`);g.querySelector('.body').dispatchEvent(new MouseEvent('click',{bubbles:true}))}", [s, i])

    def click_card(k):
        # clique la 1re carte jouable du bon type
        pg.evaluate("""(k)=>{const lab={'-4':'−4','P':'⇄','7':'7×1'}; const t=lab[k]||k;
          const c=[...document.querySelectorAll('#hand .card')].find(c=>c.querySelector('.big').textContent===t && !c.classList.contains('off'));
          c.click();}""", k)

    moves = 0; shot = False
    for step in range(6000):
        st = pg.evaluate("""()=>{const t=window.__tt, v=t.G.view; return {phase:v.phase, turn:v.turn, my:t.G.mySeat, waiting:t.G.waiting, n:t.G.acts.length,
            acts:t.G.acts.map(a=>a.d), cs:null, hand:v.hands[t.G.mySeat], sc:v.swapChoice}}""")
        if st['phase'] == 'over':
            break
        if st['phase'] == 'swap':
            if not st['sc'][st['my']]:
                click_card(st['hand'][0]) if False else pg.evaluate("document.querySelector('#hand .card').click()")
            pg.wait_for_timeout(15); continue
        if st['turn'] != st['my'] or st['waiting']:
            pg.wait_for_timeout(15); continue
        if st['n'] == 0:
            pg.evaluate("document.querySelector('#hand .card').click()")   # défausse
            moves += 1; continue
        d = random.choice(st['acts'])
        click_card(d['k'])
        cs = pg.evaluate("TT.ctrlSeat(__tt.G.view, __tt.G.mySeat)")
        kind = d['kind']
        if kind in ('fwd', 'back', 'start'):
            click_pawn(cs, d['pawn'])
            sent = pg.evaluate("__tt.G.waiting || __tt.G.view.turn!==__tt.G.mySeat || __tt.G.view.phase!=='play'")
            if not sent:
                ok = pg.evaluate("!document.querySelector('#btn-ok').disabled")
                if not ok:
                    raise SystemExit('Valider désactivé après sélection ' + json.dumps(d))
                pg.click('#btn-ok')
        elif kind == 'swap':
            click_pawn(cs, d['pawn']); click_pawn(d['tseat'], d['tpawn'])
            pg.click('#btn-ok')
        elif kind == 'seven':
            for i in d['seq']:
                click_pawn(cs, i)
            pg.click('#btn-ok')
        moves += 1
        if moves >= 6 and not shot:
            pg.wait_for_timeout(300); pg.screenshot(path=SHOT + '_game.png'); shot = True
    st = pg.evaluate("({phase:__tt.G.view.phase, winner:__tt.G.view.winner, turns:__tt.G.view.turns})")
    print('Coups humains :', moves, '| état final :', st, '| erreurs JS :', errors[:5])
    pg.screenshot(path=SHOT + '_end.png')
    b.close()
