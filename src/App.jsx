import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";


/**
 * Assumes you already have env vars in Vite:
 *  VITE_SUPABASE_URL
 *  VITE_SUPABASE_ANON_KEY
 */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const currency = (n, showKwd) =>
  `${showKwd ? "KWD " : ""}${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;

function useSession() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data?.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return session;
}

async function fetchProfile() {
  const { data, error } = await supabase
    .from("profile")
    .select("id, role, display_name")
    .eq("id", (await supabase.auth.getUser()).data.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertDisplayName(display_name) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("profile")
    .upsert({ id: user.id, display_name }, { onConflict: "id" });
  if (error) throw error;
}

async function setRole(role) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("profile").update({ role }).eq("id", user.id);
  if (error) throw error;
}

function useMonthYear() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  return { month, setMonth, year, setYear };
}

function monthStartEnd(month, year) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1); // exclusive
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchIN({ startISO, endISO, userIdFilter }) {
  let q = supabase
    .from("transactions")
    .select("id, created_at, amount, client_account, client_name, period, note, user_id")
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false });

  if (userIdFilter) q = q.eq("user_id", userIdFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchOUT({ startISO, endISO, userIdFilter, includePendingInTotals }) {
  let q = supabase
    .from("withdrawals")
    .select("id, created_at, amount, client_account, client_name, note, status, user_id")
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false });

  if (userIdFilter) q = q.eq("user_id", userIdFilter);
  const { data, error } = await q;
  if (error) throw error;
  // Totals will optionally include pending; listing still shows all.
  const list = data || [];
  const totalApproved = list
    .filter(r => includePendingInTotals ? true : r.status === "approved")
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  return { list, totalApproved };
}

function useMonthData({ month, year, forUserId, includePendingOutInTotals }) {
  const [loading, setLoading] = useState(true);
  const [inRows, setInRows] = useState([]);
  const [outRows, setOutRows] = useState([]);
  const [outTotalApproved, setOutTotalApproved] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = monthStartEnd(month, year);
    setLoading(true);
    Promise.all([
      fetchIN({ startISO: start, endISO: end, userIdFilter: forUserId }),
      fetchOUT({
        startISO: start,
        endISO: end,
        userIdFilter: forUserId,
        includePendingInTotals: includePendingOutInTotals,
      }),
    ])
      .then(([ins, outs]) => {
        if (cancelled) return;
        setInRows(ins);
        setOutRows(outs.list);
        setOutTotalApproved(outs.totalApproved);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month, year, forUserId, includePendingOutInTotals]);

  const inTotal = useMemo(
    () => inRows.reduce((s, r) => s + Number(r.amount || 0), 0),
    [inRows]
  );

  return { loading, inRows, outRows, inTotal, outTotalApproved };
}

function InlineNumber({ value, onChange }) {
  return (
    <input
      type="number"
      step="0.001"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input"
    />
  );
}

function InlineText({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="input"
    />
  );
}

function RowActions({ saving, onSave, onCancel }) {
  return (
    <div className="row-actions">
      <button disabled={saving} onClick={onSave} className="btn-primary">
        {saving ? "Saving..." : "Save"}
      </button>
      <button disabled={saving} onClick={onCancel} className="btn">
        Cancel
      </button>
    </div>
  );
}

export default function App() {
  const session = useSession();
  const { month, setMonth, year, setYear } = useMonthYear();
  const [showKwd, setShowKwd] = useState(true);
  const [includePending, setIncludePending] = useState(false);

  // profile
  const [profile, setProfile] = useState(null);
  const role = profile?.role ?? "employee";

  // form state
  const [inAmt, setInAmt] = useState("");
  const [inClientName, setInClientName] = useState("");
  const [inClientAcc, setInClientAcc] = useState("");
  const [inPeriod, setInPeriod] = useState("monthly");
  const [inNote, setInNote] = useState("");

  const [outAmt, setOutAmt] = useState("");
  const [outClientName, setOutClientName] = useState("");
  const [outClientAcc, setOutClientAcc] = useState("");
  const [outNote, setOutNote] = useState("");

  // editing state
  const [editIN, setEditIN] = useState(null);   // { id, amount, client_name, client_account, note }
  const [editOUT, setEditOUT] = useState(null); // { id, amount, client_name, client_account, note }

  const forUserId = role === "manager" ? null : session?.user?.id ?? null;

  const { loading, inRows, outRows, inTotal, outTotalApproved } = useMonthData({
    month,
    year,
    forUserId,
    includePendingOutInTotals: includePending,
  });

  const net = inTotal - outTotalApproved;

  // load profile on session change
  useEffect(() => {
    if (!session) { setProfile(null); return; }
    fetchProfile().then(setProfile).catch(() => setProfile(null));
  }, [session]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function saveDisplayName() {
    const newName = window.prompt("Enter display name", profile?.display_name ?? "");
    if (newName == null) return;
    await upsertDisplayName(newName.trim());
    const p = await fetchProfile();
    setProfile(p);
  }

  async function promoteToManager() {
    await setRole("manager");
    const p = await fetchProfile();
    setProfile(p);
  }

  async function demoteToEmployee() {
    await setRole("employee");
    const p = await fetchProfile();
    setProfile(p);
  }

  async function addIN() {
    if (!inAmt || !inClientAcc) {
      alert("Amount and Client Account are required.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      amount: Number(inAmt),
      client_account: inClientAcc.trim(),
      client_name: inClientName.trim() || null,
      period: inPeriod,
      note: inNote.trim() || null,
    });
    if (error) { alert(error.message); return; }
    // reset and reload
    setInAmt(""); setInClientAcc(""); setInClientName(""); setInNote("");
    const p = monthStartEnd(month, year);
    const ins = await fetchIN({ startISO: p.start, endISO: p.end, userIdFilter: forUserId });
    setEditIN(null);
    // quick replace list without refetching OUT
    setTimeout(() => window.location.reload(), 50);
  }

  async function addOUT() {
    if (!outAmt || !outClientAcc) {
      alert("Amount and Client Account are required.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount: Number(outAmt),
      client_account: outClientAcc.trim(),
      client_name: outClientName.trim() || null,
      note: outNote.trim() || null,
      status: "pending",
    });
    if (error) { alert(error.message); return; }
    setOutAmt(""); setOutClientAcc(""); setOutClientName(""); setOutNote("");
    setTimeout(() => window.location.reload(), 50);
  }

  async function saveINEdit() {
    if (!editIN) return;
    const { id, amount, client_account, client_name, note } = editIN;
    const { error } = await supabase
      .from("transactions")
      .update({
        amount: Number(amount),
        client_account: client_account?.trim(),
        client_name: (client_name ?? "").trim() || null,
        note: (note ?? "").trim() || null,
      })
      .eq("id", id);
    if (error) { alert(error.message); return; }
    setEditIN(null);
    setTimeout(() => window.location.reload(), 50);
  }

  async function saveOUTEdit() {
    if (!editOUT) return;
    const { id, amount, client_account, client_name, note } = editOUT;
    const { error } = await supabase
      .from("withdrawals")
      .update({
        amount: Number(amount),
        client_account: client_account?.trim(),
        client_name: (client_name ?? "").trim() || null,
        note: (note ?? "").trim() || null,
      })
      .eq("id", id);
    if (error) { alert(error.message); return; }
    setEditOUT(null);
    setTimeout(() => window.location.reload(), 50);
  }

  async function setWithdrawStatus(id, status) {
    const { error } = await supabase.from("withdrawals").update({ status }).eq("id", id);
    if (error) { alert(error.message); return; }
    setTimeout(() => window.location.reload(), 50);
  }

  if (!session) {
    return (
      <div className="page">
        <div className="card">
          <h1>INOUT</h1>
          <p>Please sign in to continue.</p>
          <AuthButtons />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card header">
        <div className="row wrap">
          <h1>INOUT</h1>
          <div className="spacer" />
          <button className="btn" onClick={() => setShowKwd(v => !v)}>
            {showKwd ? "Hide KWD" : "Show KWD"}
          </button>
          <button className="btn" onClick={() => setIncludePending(v => !v)}>
            {includePending ? "Exclude pending OUT" : "Count pending OUT"}
          </button>
          <button className="btn" onClick={handleSignOut}>Sign out</button>
        </div>

        <div className="row wrap mt8">
          <label className="inline">
            Month&nbsp;
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i}>
                  {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Year&nbsp;
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: 6 }).map((_, i) => {
                const y = new Date().getFullYear() - 2 + i;
                return (
                  <option key={y} value={y}>{y}</option>
                );
              })}
            </select>
          </label>

          <div className="spacer" />

          {profile && (
            <div className="row gap8">
              <span>Logged in as <b>{profile.display_name || session.user.email}</b> — <em>{role}</em></span>
              <button className="btn" onClick={saveDisplayName}>Edit name</button>
              {role === "employee" ? (
                <button className="btn" onClick={promoteToManager}>Switch to manager</button>
              ) : (
                <button className="btn" onClick={demoteToEmployee}>Switch to employee</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="metrics row wrap">
        <Metric title="Total IN" value={currency(inTotal, showKwd)} tone="green" />
        <Metric title={`Total OUT ${includePending ? "(approved+pending)" : "(approved)"}`} value={currency(outTotalApproved, showKwd)} tone="red" />
        <Metric title="Net Profit" value={currency(net, showKwd)} tone={net >= 0 ? "green" : "red"} />
      </div>

      <div className="card">
        <h2>Add Money IN (Deposit)</h2>
        <div className="row wrap gap8">
          <InlineNumber value={inAmt} onChange={setInAmt} />
          <InlineText value={inClientName} onChange={setInClientName} placeholder="Client name" />
          <InlineText value={inClientAcc} onChange={setInClientAcc} placeholder="Client account #" />
          <select className="input" value={inPeriod} onChange={(e) => setInPeriod(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <InlineText value={inNote} onChange={setInNote} placeholder="Note (optional)" />
          <button className="btn-primary" onClick={addIN}>Add IN</button>
        </div>
      </div>

      <div className="card">
        <h2>Withdrawal Request (OUT)</h2>
        <div className="row wrap gap8">
          <InlineNumber value={outAmt} onChange={setOutAmt} />
          <InlineText value={outClientName} onChange={setOutClientName} placeholder="Client name" />
          <InlineText value={outClientAcc} onChange={setOutClientAcc} placeholder="Client account #" />
          <InlineText value={outNote} onChange={setOutNote} placeholder="Note (optional)" />
          <button className="btn-primary" onClick={addOUT}>Submit</button>
        </div>
      </div>

      {role === "manager" && (
        <div className="card">
          <h2>Withdrawal Requests Center — {new Date(year, month, 1).toLocaleString(undefined, { month: "short", day: "2-digit" })}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Employee</th><th>Amount</th><th>Client</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {outRows.length === 0 && (
                <tr><td colSpan="6" className="muted">No requests.</td></tr>
              )}
              {outRows.map((r) => {
                const editing = editOUT?.id === r.id;
                return (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.user_id?.slice(0, 6)}…</td>
                    <td>
                      {editing ? (
                        <InlineNumber
                          value={editOUT.amount}
                          onChange={(v) => setEditOUT((e) => ({ ...e, amount: v }))}
                        />
                      ) : currency(r.amount, showKwd)}
                    </td>
                    <td>
                      {editing ? (
                        <div className="col">
                          <InlineText
                            value={editOUT.client_name}
                            onChange={(v) => setEditOUT((e) => ({ ...e, client_name: v }))}
                            placeholder="Client name"
                          />
                          <InlineText
                            value={editOUT.client_account}
                            onChange={(v) => setEditOUT((e) => ({ ...e, client_account: v }))}
                            placeholder="Client account #"
                          />
                          <InlineText
                            value={editOUT.note}
                            onChange={(v) => setEditOUT((e) => ({ ...e, note: v }))}
                            placeholder="Note"
                          />
                        </div>
                      ) : (
                        <div className="col">
                          <div>{r.client_name || "-"}</div>
                          <div className="muted">{r.client_account || "-"}</div>
                          {r.note && <div className="muted">{r.note}</div>}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${r.status}`}>{r.status}</span>
                    </td>
                    <td>
                      {editing ? (
                        <RowActions
                          saving={false}
                          onSave={saveOUTEdit}
                          onCancel={() => setEditOUT(null)}
                        />
                      ) : (
                        <div className="row gap8">
                          <button className="btn" onClick={() => setEditOUT({
                            id: r.id,
                            amount: r.amount,
                            client_account: r.client_account,
                            client_name: r.client_name,
                            note: r.note,
                          })}>Edit</button>
                          <button className="btn" onClick={() => setWithdrawStatus(r.id, "approved")}>Approve</button>
                          <button className="btn" onClick={() => setWithdrawStatus(r.id, "rejected")}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Your IN (This Month)</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Amount</th><th>Client</th><th>Period</th><th>Note</th><th></th>
            </tr>
          </thead>
          <tbody>
            {inRows.length === 0 && (
              <tr><td colSpan="6" className="muted">No entries.</td></tr>
            )}
            {inRows.map((r) => {
              const editing = editIN?.id === r.id;
              const isMine = r.user_id === session.user.id;
              return (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    {editing ? (
                      <InlineNumber
                        value={editIN.amount}
                        onChange={(v) => setEditIN((e) => ({ ...e, amount: v }))}
                      />
                    ) : currency(r.amount, showKwd)}
                  </td>
                  <td>
                    {editing ? (
                      <div className="col">
                        <InlineText
                          value={editIN.client_name}
                          onChange={(v) => setEditIN((e) => ({ ...e, client_name: v }))}
                          placeholder="Client name"
                        />
                        <InlineText
                          value={editIN.client_account}
                          onChange={(v) => setEditIN((e) => ({ ...e, client_account: v }))}
                          placeholder="Client account #"
                        />
                      </div>
                    ) : (
                      <div className="col">
                        <div>{r.client_name || "-"}</div>
                        <div className="muted">{r.client_account || "-"}</div>
                      </div>
                    )}
                  </td>
                  <td>{r.period}</td>
                  <td>
                    {editing ? (
                      <InlineText
                        value={editIN.note}
                        onChange={(v) => setEditIN((e) => ({ ...e, note: v }))}
                        placeholder="Note"
                      />
                    ) : (r.note || "-")}
                  </td>
                  <td>
                    {isMine && (
                      editing ? (
                        <RowActions saving={false} onSave={saveINEdit} onCancel={() => setEditIN(null)} />
                      ) : (
                        <button className="btn" onClick={() => setEditIN({
                          id: r.id,
                          amount: r.amount,
                          client_account: r.client_account,
                          client_name: r.client_name,
                          note: r.note,
                        })}>Edit</button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{styles}</style>
    </div>
  );
}

function Metric({ title, value, tone = "neutral" }) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function AuthButtons() {
  async function signIn() {
    const email = window.prompt("Email");
    const password = window.prompt("Password");
    if (!email || !password) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }
  async function signUp() {
    const email = window.prompt("Email");
    const password = window.prompt("Password (min 6 chars)");
    if (!email || !password) return;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Check your email (if email confirmation is enabled). Then sign in.");
  }
  return (
    <div className="row gap8">
      <button className="btn-primary" onClick={signIn}>Sign in</button>
      <button className="btn" onClick={signUp}>Sign up</button>
    </div>
  );
}

const styles = `
.page {
  max-width: 1150px; margin: 0 auto; padding: 18px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
}
.card { background:#fff; border:1px solid #e8ecf1; border-radius: 12px; padding: 18px; margin: 0 0 16px; box-shadow: 0 1px 0 rgba(0,0,0,0.02); }
.header { position: sticky; top: 0; z-index: 10; backdrop-filter: blur(6px); }
.row { display: flex; align-items: center; gap: 10px; }
.wrap { flex-wrap: wrap; }
.col { display: grid; gap: 4px; }
.spacer { flex: 1; }
.mt8 { margin-top: 8px; }
.gap8 { gap: 8px; }

.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 0 0 12px; }
.metric { border-radius: 12px; padding: 14px; border:1px solid #eef3f8; background: #fafcff; }
.metric .metric-title { color:#6b7280; font-size: 13px; }
.metric .metric-value { font-weight: 700; font-size: 20px; margin-top: 4px; }
.metric.green { background:#f0fff7; border-color:#dbfbe8; }
.metric.red { background:#fff5f5; border-color:#ffe3e3; }

.input { border:1px solid #d9e1ea; border-radius: 10px; padding: 8px 10px; background:#fff; min-width: 140px; }
.btn { border:1px solid #d9e1ea; background:#fff; padding: 8px 12px; border-radius: 10px; cursor: pointer; }
.btn:hover { background:#f7fafc; }
.btn-primary { border:1px solid #2563eb; background:#2563eb; color:#fff; padding: 8px 14px; border-radius: 10px; cursor: pointer; }
.btn-primary:hover { filter: brightness(0.95); }

.table { width:100%; border-collapse: collapse; }
.table th, .table td { padding: 10px 12px; border-bottom: 1px solid #eef3f8; text-align: left; vertical-align: top; }
.table th { color:#6b7280; font-weight: 600; font-size: 13px; }
.muted { color:#6b7280; }

.pill { padding: 3px 8px; border-radius: 999px; font-size: 12px; border:1px solid #e2e8f0; background:#f8fafc; }
.pill.approved { background:#eafff0; border-color:#d2f9e0; color:#0a8a3a; }
.pill.pending { background:#fff9e6; border-color:#ffedba; color:#9a6b00; }
.pill.rejected { background:#ffecec; border-color:#ffd2d2; color:#b42318; }

.row-actions { display:flex; gap:8px; }
`;

