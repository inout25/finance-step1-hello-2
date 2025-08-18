import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

function Auth({ onAuthed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function signUpOrIn(e) {
    e.preventDefault(); setLoading(true); setErr('')
    const cleanEmail = email.trim().toLowerCase()
    const cleanPass  = password.trim()
    try {
      const { error: e1 } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPass })
      if (!e1) { setLoading(false); onAuthed?.(); return }
      const { error: e2 } = await supabase.auth.signUp({ email: cleanEmail, password: cleanPass })
      if (e2) setErr(e2.message)
    } catch (err) {
      setErr(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={card}>
      <h2>Login</h2>
      <form onSubmit={signUpOrIn} style={{display:'grid', gap:10}}>
        <input type="email" required placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input type="password" required placeholder="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button disabled={loading}>{loading ? '...' : 'Sign in / Sign up'}</button>
        {err && <div style={{color:'#b91c1c'}}>{err}</div>}
      </form>
    </div>
  )
}

const fmt = (n)=> `${Number(n||0).toFixed(3)} KD`
const inMonth = (d,y,m)=>{ const x = new Date(d); return x.getFullYear()===y && x.getMonth()===m }

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState([])

  const [year, setYear] = useState(new Date().getFullYear())
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth())

  const [tx, setTx] = useState([])
  const [wd, setWd] = useState([])
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null)

  const log = (m)=> setLogs(p => [...p, `[${new Date().toLocaleTimeString()}] ${m}`])

  // session (SAFE)
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session || null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  // ensure profile (never hang)
  useEffect(() => {
    if (!session) return
    const uid = session.user.id
    ;(async () => {
      try {
        setError(''); log('Upserting profile…')
        const { error: upErr } = await supabase.from('profile').upsert(
          { user_id: uid, full_name: session.user.email, role: 'employee' },
          { onConflict: 'user_id' }
        )
        if (upErr) throw upErr
        log('Selecting profile…')
        const { data, error: selErr } = await supabase.from('profile').select('*').eq('user_id', uid).maybeSingle()
        if (selErr) throw selErr
        setProfile(data || { user_id: uid, full_name: session.user.email, role: 'employee' })
        log('Profile ready.')
      } catch (e) {
        const msg = e?.message || String(e)
        setError('Profile error: ' + msg)
        log('Profile error: ' + msg)
        setProfile({ user_id: uid, full_name: session.user.email, role: 'employee' }) // proceed
      }
    })()
  }, [session])

  // data
  async function loadData() {
    if (!session || !profile) return
    setError('')
    const start = new Date(year, monthIdx, 1).toISOString()
    const end   = new Date(year, monthIdx+1, 1).toISOString()
    const isManager = profile.role === 'manager'
    log('Loading data…')
    try {
      const txQuery = isManager
        ? supabase.from('transactions').select('*').gte('created_at', start).lt('created_at', end).order('created_at', {ascending:false})
        : supabase.from('transactions').select('*').eq('user_id', session.user.id).gte('created_at', start).lt('created_at', end).order('created_at', {ascending:false})

      const wdQuery = isManager
        ? supabase.from('withdrawals').select('*').gte('created_at', start).lt('created_at', end).order('created_at', {ascending:false})
        : supabase.from('withdrawals').select('*').eq('user_id', session.user.id).order('created_at', {ascending:false})

      const [{ data: txd, error: e1 }, { data: wdd, error: e2 }] = await Promise.all([txQuery, wdQuery])
      if (e1) throw e1
      if (e2) throw e2
      setTx(txd || []); setWd(wdd || [])

      if (isManager) {
        const ids = Array.from(new Set([...(txd||[]).map(t=>t.user_id), ...(wdd||[]).map(w=>w.user_id)]))
        if (ids.length) {
          const { data: ppl, error: pplErr } = await supabase.from('profile').select('user_id, full_name').in('user_id', ids)
          if (pplErr) { log('Names blocked: ' + pplErr.message); setEmployees(ids.map(id=>({user_id:id, full_name:id.slice(0,8)}))) }
          else setEmployees(ppl || [])
        } else setEmployees([])
      } else {
        setEmployees([{ user_id: session.user.id, full_name: profile?.full_name || session.user.email }])
      }
      log('Data loaded.')
    } catch (e) {
      const msg = e?.message || String(e)
      setError('Load error: ' + msg)
      log('Load error: ' + msg)
    }
  }
  useEffect(() => { if (profile) loadData() }, [profile, year, monthIdx])

  if (!session) return <Auth onAuthed={()=>{}} />

  const myTxThisMonth = tx.filter(t => t.user_id === session.user.id)
  const myInTotal = myTxThisMonth.reduce((a,b)=>a+Number(b.amount||0),0)
  const myWdAll = wd.filter(w => w.user_id === session.user.id)
  const myWdThisMonth = myWdAll.filter(w => inMonth(w.created_at, year, monthIdx))
  const myOutApprovedTotal = myWdThisMonth.filter(w=>w.status==='approved').reduce((a,b)=>a+Number(b.amount||0),0)
  const isManager = profile?.role === 'manager'

  const perEmployee = useMemo(()=>{
    const map = new Map()
    if (!isManager) return map
    tx.forEach(t=>{ const r = map.get(t.user_id) || {inTotal:0,outTotal:0}; r.inTotal += Number(t.amount||0); map.set(t.user_id, r) })
    wd.filter(w=>w.status==='approved').forEach(w=>{ const r = map.get(w.user_id) || {inTotal:0,outTotal:0}; r.outTotal += Number(w.amount||0); map.set(w.user_id, r) })
    return map
  }, [isManager, tx, wd])

  const nameOf = (uid)=> employees.find(e=>e.user_id===uid)?.full_name || uid.slice(0,8)
  const years = Array.from({length:6}, (_,i)=> new Date().getFullYear()-3+i)

  const [inAmt,setInAmt]=useState(''),[inAcc,setInAcc]=useState(''),[inPref,setInPref]=useState('monthly'),[inNote,setInNote]=useState('')
  const [wdAmt,setWdAmt]=useState(''),[wdAcc,setWdAcc]=useState('')

  async function addDeposit(e){
    e.preventDefault()
    const n = Number(inAmt); if(!n||n<=0) return
    const { error } = await supabase.from('transactions').insert({
      user_id: session.user.id, type:'IN', amount:n, client_account: inAcc || null, preference: inPref, note: inNote || null
    })
    if (error) { setError(error.message); return }
    setInAmt(''); setInAcc(''); setInPref('monthly'); setInNote(''); loadData()
  }
  async function submitWithdrawal(e){
    e.preventDefault()
    const n = Number(wdAmt); if(!n||n<=0) return
    const { error } = await supabase.from('withdrawals').insert({
      user_id: session.user.id, amount:n, client_account: wdAcc || 'N/A'
    })
    if (error) { setError(error.message); return }
    setWdAmt(''); setWdAcc(''); loadData()
  }
  async function setStatus(id, status){
    const { error } = await supabase.from('withdrawals').update({ status }).eq('id', id)
    if (error) setError(error.message); else loadData()
  }

  return (
    <div style={{maxWidth:1100, margin:'0 auto', padding:24}}>
      <div style={card}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <h1 style={{margin:0}}>Finance App — Supabase</h1>
          <div>
            <select value={monthIdx} onChange={e=>setMonthIdx(Number(e.target.value))}>
              {Array.from({length:12},(_,i)=><option key={i} value={i}>{new Date(2000,i,1).toLocaleString(undefined,{month:'long'})}</option>)}
            </select>{' '}
            <select value={year} onChange={e=>setYear(Number(e.target.value))}>
              {years.map(y=><option key={y} value={y}>{y}</option>)}
            </select>{' '}
            <span style={pill}>Role: <b>{profile?.role||'employee'}</b></span>{' '}
            <button onClick={()=>supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
        <div style={{color:'#6b7280'}}>Logged in as <b>{profile?.full_name || session.user.email}</b></div>
        {error && <div style={{marginTop:8, color:'#b91c1c'}}>Error: {error}</div>}
      </div>

      <div style={card}>
        <details>
          <summary>Debug logs</summary>
          <pre style={{whiteSpace:'pre-wrap', marginTop:8}}>{logs.join('\n') || '(no logs yet)'}</pre>
        </details>
      </div>

      <div style={card}>
        <h2>Your Totals (This Month)</h2>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <span style={pill}>Your IN: <b>{fmt(myInTotal)}</b></span>
          <span style={pill}>Your OUT (Approved): <b>{fmt(myOutApprovedTotal)}</b></span>
          <span style={pill}>IN entries: {myTxThisMonth.length}</span>
          <span style={pill}>OUT requests: {myWdThisMonth.length}</span>
        </div>
      </div>

      <div style={card}>
        <h2>Add Money IN (Deposit)</h2>
        <form onSubmit={addDeposit} style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <input type="number" step="0.001" required placeholder="Amount" value={inAmt} onChange={e=>setInAmt(e.target.value)} />
          <input type="text" placeholder="Client Account #" value={inAcc} onChange={e=>setInAcc(e.target.value)} />
          <select value={inPref} onChange={e=>setInPref(e.target.value)}>
            <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
          </select>
          <input type="text" placeholder="Note (optional)" value={inNote} onChange={e=>setInNote(e.target.value)} />
          <button>Add IN</button>
        </form>
      </div>

      <div style={card}>
        <h2>Your IN (This Month)</h2>
        <Table
          headers={['Date','Amount','Client','Pref','Note']}
          rows={myTxThisMonth.map(t=>[
            new Date(t.created_at).toLocaleString(),
            <b key="a">{fmt(t.amount)}</b>,
            t.client_account||'-',
            t.preference||'-',
            t.note||''
          ])}
          emptyText="No entries."
        />
      </div>

      <div style={card}>
        <h2>Withdrawal Request (OUT)</h2>
        <form onSubmit={submitWithdrawal} style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <input type="number" step="0.001" required placeholder="Amount" value={wdAmt} onChange={e=>setWdAmt(e.target.value)} />
          <input type="text" placeholder="Client Account #" value={wdAcc} onChange={e=>setWdAcc(e.target.value)} />
          <button>Submit</button>
        </form>
      </div>

      <div style={card}>
        <h2>Your Withdrawal Requests</h2>
        <Table
          headers={['Date','Amount','Client','Status']}
          rows={myWdAll.map(w=>[
            new Date(w.created_at).toLocaleString(),
            <b key="a">{fmt(w.amount)}</b>,
            w.client_account,
            w.status
          ])}
          emptyText="No requests."
        />
      </div>

      {isManager && (
        <>
          <div style={card}>
            <h2>Per-Employee Totals (Selected Month)</h2>
            <Table
              headers={['Employee','IN Total','OUT Total (Approved)']}
              rows={Array.from(perEmployee.keys()).map(uid=>{
                const v = perEmployee.get(uid)
                return [
                  <button key="n" style={link} onClick={()=>setSelectedEmployee(uid)}>{nameOf(uid)}</button>,
                  <b key="i">{fmt(v.inTotal)}</b>,
                  <b key="o">{fmt(v.outTotal)}</b>
                ]
              })}
              emptyText="No data."
            />
          </div>

          <div style={card}>
            <h2>Withdrawal Requests (Selected Month)</h2>
            <Table
              headers={['Date','Employee','Amount','Client','Status','Actions']}
              rows={wd.map(w=>[
                new Date(w.created_at).toLocaleString(),
                <button key="emp" style={link} onClick={()=>setSelectedEmployee(w.user_id)}>{nameOf(w.user_id)}</button>,
                <b key="amt">{fmt(w.amount)}</b>,
                w.client_account,
                w.status,
                <div key="act" style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  <button onClick={()=>setStatus(w.id,'approved')}>Approve</button>
                  <button onClick={()=>setStatus(w.id,'rejected')}>Reject</button>
                  <button onClick={()=>setStatus(w.id,'pending')}>Reset</button>
                </div>
              ])}
              emptyText="No requests."
            />
          </div>

          {selectedEmployee && (
            <div style={card}>
              <h2>Employee Portfolio — {nameOf(selectedEmployee)}</h2>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
                <div>
                  <h3>IN</h3>
                  <Table
                    headers={['Date','Amount','Client','Pref','Note']}
                    rows={tx.filter(t=>t.user_id===selectedEmployee).map(t=>[
                      new Date(t.created_at).toLocaleString(),
                      <b key="a">{fmt(t.amount)}</b>,
                      t.client_account||'-',
                      t.preference||'-',
                      t.note||''
                    ])}
                    emptyText="No IN."
                  />
                </div>
                <div>
                  <h3>OUT</h3>
                  <Table
                    headers={['Date','Amount','Client','Status']}
                    rows={wd.filter(w=>w.user_id===selectedEmployee).map(w=>[
                      new Date(w.created_at).toLocaleString(),
                      <b key="a">{fmt(w.amount)}</b>,
                      w.client_account,
                      w.status
                    ])}
                    emptyText="No OUT."
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Table({ headers, rows, emptyText }) {
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%', borderCollapse:'collapse'}}>
        <thead><tr>{headers.map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r,ri)=>(
            <tr key={ri}>{r.map((c,ci)=><td key={ci} style={td}>{c}</td>)}</tr>
          )) : <tr><td colSpan={headers.length} style={{...td, color:'#6b7280'}}>{emptyText}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

const card = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:16, marginBottom:12 }
const pill = { display:'inline-block', padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:999, background:'#f9fafb' }
const link = { background:'none', border:'none', color:'#2563eb', cursor:'pointer', padding:0 }
const th = { textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #eee', whiteSpace:'nowrap' }
const td = { padding:'8px 10px', borderBottom:'1px solid #f1f5f9', verticalAlign:'top' }
