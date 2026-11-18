// Faux PeerJS (BroadcastChannel) pour tester le protocole hôte/client sans Internet.
(function(){
  const bc=new BroadcastChannel('ttstub'); const peers={};
  class Conn{
    constructor(owner,remote,cid){this.owner=owner;this.peer=remote;this.cid=cid;this._l={};this.open=false;}
    on(e,f){(this._l[e]=this._l[e]||[]).push(f);return this}
    emit(e,...a){(this._l[e]||[]).forEach(f=>f(...a))}
    send(m){bc.postMessage({kind:'data',to:this.peer,from:this.owner.id,cid:this.cid,m:JSON.parse(JSON.stringify(m))})}
    close(){ this.open=false; bc.postMessage({kind:'close',to:this.peer,from:this.owner.id,cid:this.cid}); this.emit('close'); }
  }
  class Peer{
    constructor(id){ this.id=id||('c'+Math.random().toString(36).slice(2)); this._l={}; this.conns={}; peers[this.id]=this;
      setTimeout(()=>this.emit('open',this.id),5); }
    on(e,f){(this._l[e]=this._l[e]||[]).push(f);return this}
    emit(e,...a){(this._l[e]||[]).forEach(f=>f(...a))}
    connect(remote){ const cid=Math.random().toString(36).slice(2); const c=new Conn(this,remote,cid); this.conns[cid]=c;
      bc.postMessage({kind:'connect',to:remote,from:this.id,cid}); return c; }
    destroy(){ delete peers[this.id]; }
  }
  bc.onmessage=ev=>{ const m=ev.data; const p=peers[m.to]; if(!p) return;
    if(m.kind==='connect'){ const c=new Conn(p,m.from,m.cid); p.conns[m.cid]=c; p.emit('connection',c);
      setTimeout(()=>{c.open=true;c.emit('open');bc.postMessage({kind:'accept',to:m.from,from:p.id,cid:m.cid});},2); }
    else if(m.kind==='accept'){ const c=p.conns[m.cid]; if(c){c.open=true;c.emit('open');} }
    else if(m.kind==='data'){ const c=p.conns[m.cid]; if(c) c.emit('data',m.m); }
    else if(m.kind==='close'){ const c=p.conns[m.cid]; if(c){c.open=false;c.emit('close');} } };
  window.Peer=Peer;
})();
