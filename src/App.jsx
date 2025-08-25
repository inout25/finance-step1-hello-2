// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// ---------- helpers ----------
const fmtKWD = (n, show = true) =>
  `${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}${show ? " KD" : ""}`;

const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function rangeForMonthYear(monthIdx, year) {
  const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function EditInline({ initial, onCancel, onSave, saving }) {
  const [form, setForm] = useState({ ...initial });
  return (
    <tr>
      <td colSpan={8} style={{ background: "#fafafa" }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(6, 1fr) auto auto" }}>
          <input
            placeholder="Amount"
            type="number"
            value={form.amount ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <input
            placeholder="Client name"
            value={form.client_name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
          />
          <input
            placeholder="Client account"
            value={form.client_account ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, client_account: e.target.value }))}
          />
          <select
            value={form.pref ?? "monthly"}
            onChange={(e) => setForm((f) => ({ ...f, pref: e.target.value }))}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input
            placeholder="Note"
            value={form.note ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
          <button disabled={saving} onClick={() => onSave(form)}>{saving ? "Saving…" : "Save"}</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}

// ---------- main ----------
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { id, email, name, role }
  const isManager = profile?.role === "manager";

  // filters
  const now = new Date();
  const [monthIdx, setMonthIdx] = useState(now.getUTCMonth());
  const [year, setYear] = useState(now.getUTCFullYear());
  const [showKwd, setShowKwd] = useState(true);

  const { start, end } = useMemo(() => rangeForMonthYear(monthIdx, year), [monthIdx, year]);

  // data
  const [inRows, setInRows] = useState([]);
  const [outRows, setOutRows] = useState([]);
  const [reqRows, setReqRows] = useState([]); // withdrawals (all) for manager view

  // forms
  const [inForm, setInForm] = useState({ amount: "", client_name: "", client_account: "", pref: "monthly", note: "" });
  const [outForm, setOutForm] = useState({ amount: "", client_name: "", client_account: "", pref: "monthly", note: "" });

  // editing
  const [editKey, setEditKey] = useState(null); // {type:'in'|'out', id}
  const [savingEdit, setSavingEdit] = useState(false);

  // totals
  const totals = useMemo(() => {
    const tIn = inRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    // OUT totals count only approved withdrawals
    const tOut = outRows.filter(r => r.status === "approved").reduce((s, r) => s + Number(r.amount || 0), 0);
    return { in: tIn, out: tOut, net: tIn - tOut };
  }, [inRows, outRows]);

  // ---- session + profile ----
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user) {
        await loadProfile(session.user.id);
      }
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid) {
    // profile table (not "profiles")
    const { data, error } = await supabase
      .from("profile")
      .select("id, email, name, role")
      .eq("id", uid)
      .maybeSingle();
    if (!error && data) setProfile(data);
  }

  // ---- load data for selected month ----
  useEffect(() => {
    if (!session?.user) return;
    const load = async () => {
      // IN rows: the employee sees own; manager sees all (but we’ll still show own list below)
      const inQ = supabase
        .from("transactions")
        .select("id, created_at, amount, client_name, client_account, pref, note, user_id")
        .gte("created_at", start).lt("created_at", end)
        .order("created_at", { ascending: false });

      const outQ = supabase
        .from("withdrawals")
        .select("id, created_at, amount, client_name, client_account, pref, note, status, user_id")
        .gte("created_at", start).lt("created_at", end)
        .order("created_at", { ascending: false });

      const [inRes, outRes] = await Promise.all([inQ, outQ]);
      if (!inRes.error) setInRows(isManager ? inRes.data : inRes.data.filter(r => r.user_id === session.user.id));
      if (!outRes.error) setOutRows(isManager ? outRes.data : outRes.data.filter(r => r.user_id === session.user.id));

      if (isManager) {
        // show pending list (requests center)
        const reqRes = await supabase
          .from("withdrawals")
          .select("id, created_at, amount, client_name, client_account, note, status, user_id")
          .gte("created_at", start).lt("created_at", end)
          .order("created_at", { ascending: false });
        if (!reqRes.error) setReqRows(reqRes.data);
      } else {
        setReqRows([]);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, isManager, start, end]);

  // ---- actions ----
  async function addIN() {
    if (!session?.user) return;
    const payload = {
      amount: Number(inForm.amount || 0),
      client_name: (inForm.client_name || "").trim(),
      client_account: (inForm.client_account || "").trim(),
      note: (inForm.note || "").trim(),
      pref: inForm.pref || "monthly",
      user_id: session.user.id
    };
    const { error } = await supabase.from("transactions").insert(payload);
    if (error) return alert(error.message);
    setInForm({ amount: "", client_name: "", client_account: "", pref: inForm.pref, note: "" });
    // reload
    const { data } = await supabase
      .from("transactions")
      .select("id, created_at, amount, client_name, client_account, pref, note, user_id")
      .gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: false });
    setInRows(isManager ? data : data.filter(r => r.user_id === session.user.id));
  }

  async function addOUT() {
    if (!session?.user) return;
    const payload = {
      amount: Number(outForm.amount || 0),
      client_name: (outForm.client_name || "").trim(),
      client_account: (outForm.client_account || "").trim(),
      note: (outForm.note || "").trim(),
      pref: outForm.pref || "monthly",
      status: "pending",
      user_id: session.user.id
    };
    const { error } = await supabase.from("withdrawals").insert(payload);
    if (error) return alert(error.message);
    setOutForm({ amount: "", client_name: "", client_account: "", pref: outForm.pref, note: "" });
    const { data } = await supabase
      .from("withdrawals")
      .select("id, created_at, amount, client_name, client_account, pref, note, status, user_id")
      .gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: false });
    setOutRows(isManager ? data : data.filter(r => r.user_id === session.user.id));
    if (isManager) setReqRows(data);
  }

  async function updateRow(kind, id, patch) {
    setSavingEdit(true);
    const table = kind === "in" ? "transactions" : "withdrawals";
    const { error } = await supabase.from(table).update({
      amount: Number(patch.amount || 0),
      client_name: patch.client_name ?? null,
      client_account: patch.client_account ?? null,
      note: patch.note ?? null,
      pref: patch.pref ?? "monthly"
    }).eq("id", id);
    setSavingEdit(false);
    if (error) return alert(error.message);
    setEditKey(null);
    // refresh both sets
    const [inRes, outRes] = await Promise.all([
      supabase.from("transactions").select("*").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }),
      supabase.from("withdrawals").select("*").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }),
    ]);
    if (!inRes.error) setInRows(isManager ? inRes.data : inRes.data.filter(r => r.user_id === session?.user?.id));
    if (!outRes.error) {
      setOutRows(isManager ? outRes.data : outRes.data.filter(r => r.user_id === session?.user?.id));
      if (isManager) setReqRows(outRes.data);
    }
  }

  async function setWithdrawStatus(id, status) {
    const { error } = await supabase.from("withdrawals").update({ status }).eq("id", id);
    if (error) return alert(error.message);
    // refresh
    const { data } = await supabase
      .from("withdrawals")
      .select("*")
      .gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: false });
    setOutRows(isManager ? data : data.filter(r => r.user_id === session?.user?.id));
    if (isManager) setReqRows(data);
  }

  // profile updates
  async function saveDisplayName(name) {
    if (!session?.user) return;
    const { error } = await supabase.from("profile").update({ name }).eq("id", session.user.id);
    if (error) alert(error.message);
    else setProfile((p) => ({ ...p, name }));
  }

  // ---- UI ----
  if (!session) {
    // keep it dead simple: show only a sign-in link via Supabase OTP
    return (
      <div style={{ maxWidth: 1100, margin: "30px auto", padding: 12 }}>
        <h1>INOUT</h1>
        <p>Sign in to continue.</p>
        <button
          onClick={async () => {
            const email = prompt("Enter your email to sign in");
            if (!email) return;
            const { error } = await supabase.auth.signInWithOtp({ email });
            if (error) alert(error.message);
            else alert("Magic link sent. Check your email.");
          }}
        >
          Sign in with Email
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "30px auto", padding: 12 }}>
      {/* header / profile */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <h1 style={{ marginRight: "auto" }}>INOUT</h1>
        <div>Role: <strong>{isManager ? "manager" : "employee"}</strong></div>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <input
          placeholder="Display name"
          defaultValue={profile?.name ?? ""}
          onBlur={(e) => saveDisplayName(e.target.value)}
          style={{ width: 220 }}
        />
        <button onClick={() => {
          const input = document.querySelector('input[placeholder="Display name"]');
          if (input) saveDisplayName(input.value);
        }}>Save</button>

        <select value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))}>
          {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 6 }).map((_, i) => {
            const y = now.getUTCFullYear() - 3 + i;
            return <option key={y} value={y}>{y}</option>;
          })}
        </select>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showKwd} onChange={() => setShowKwd(s => !s)} /> Show KWD
        </label>
      </div>

      {/* totals */}
      <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Totals — {monthNames[monthIdx]} {year}</h2>
        <div style={{ display: "flex", gap: 14 }}>
          <div><strong>Total IN:</strong> {fmtKWD(totals.in, showKwd)}</div>
          <div><strong>Total OUT:</strong> {fmtKWD(totals.out, showKwd)}</div>
          <div><strong>Net:</strong> {fmtKWD(totals.net, showKwd)}</div>
        </div>
      </section>

      {/* Add IN */}
      <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <h3>Add IN</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(5, 1fr) auto" }}>
          <input placeholder="Amount" type="number" value={inForm.amount} onChange={(e) => setInForm(f => ({ ...f, amount: e.target.value }))} />
          <input placeholder="Client name" value={inForm.client_name} onChange={(e) => setInForm(f => ({ ...f, client_name: e.target.value }))} />
          <input placeholder="Client account" value={inForm.client_account} onChange={(e) => setInForm(f => ({ ...f, client_account: e.target.value }))} />
          <select value={inForm.pref} onChange={(e) => setInForm(f => ({ ...f, pref: e.target.value }))}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input placeholder="Note (optional)" value={inForm.note} onChange={(e) => setInForm(f => ({ ...f, note: e.target.value }))} />
          <button onClick={addIN}>Add</button>
        </div>
      </section>

      {/* Add OUT */}
      <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <h3>Add OUT</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(5, 1fr) auto" }}>
          <input placeholder="Amount" type="number" value={outForm.amount} onChange={(e) => setOutForm(f => ({ ...f, amount: e.target.value }))} />
          <input placeholder="Client name" value={outForm.client_name} onChange={(e) => setOutForm(f => ({ ...f, client_name: e.target.value }))} />
          <input placeholder="Client account" value={outForm.client_account} onChange={(e) => setOutForm(f => ({ ...f, client_account: e.target.value }))} />
          <select value={outForm.pref} onChange={(e) => setOutForm(f => ({ ...f, pref: e.target.value }))}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input placeholder="Note (optional)" value={outForm.note} onChange={(e) => setOutForm(f => ({ ...f, note: e.target.value }))} />
          <button onClick={addOUT}>Submit</button>
        </div>
      </section>

      {/* Your IN rows */}
      <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <h3>Your IN ({monthNames[monthIdx]} {year})</h3>
        <table width="100%">
          <thead>
            <tr>
              <th align="left">Date</th>
              <th align="right">Amount</th>
              <th align="left">Client</th>
              <th align="left">Account</th>
              <th align="left">Pref</th>
              <th align="left">Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inRows.length === 0 && (
              <tr><td colSpan={7} style={{ color: "#777" }}>No entries.</td></tr>
            )}
            {inRows.map(row => {
              const isEditing = editKey?.type === "in" && editKey?.id === row.id;
              const canEdit = isManager || row.user_id === session.user.id;
              if (isEditing) {
                return (
                  <EditInline
                    key={row.id}
                    initial={row}
                    saving={savingEdit}
                    onCancel={() => setEditKey(null)}
                    onSave={(patch) => updateRow("in", row.id, patch)}
                  />
                );
              }
              return (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td align="right">{fmtKWD(row.amount, showKwd)}</td>
                  <td>{row.client_name}</td>
                  <td>{row.client_account}</td>
                  <td>{row.pref}</td>
                  <td>{row.note}</td>
                  <td align="right">
                    {canEdit && <button onClick={() => setEditKey({ type: "in", id: row.id })}>Edit</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Your OUT rows */}
      <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <h3>Your Withdrawals ({monthNames[monthIdx]} {year})</h3>
        <table width="100%">
          <thead>
            <tr>
              <th align="left">Date</th>
              <th align="right">Amount</th>
              <th align="left">Client</th>
              <th align="left">Account</th>
              <th align="left">Pref</th>
              <th align="left">Note</th>
              <th align="left">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {outRows.length === 0 && (
              <tr><td colSpan={8} style={{ color: "#777" }}>No requests.</td></tr>
            )}
            {outRows.map(row => {
              const isEditing = editKey?.type === "out" && editKey?.id === row.id;
              const canEdit = isManager || row.user_id === session.user.id;
              if (isEditing) {
                return (
                  <EditInline
                    key={row.id}
                    initial={row}
                    saving={savingEdit}
                    onCancel={() => setEditKey(null)}
                    onSave={(patch) => updateRow("out", row.id, patch)}
                  />
                );
              }
              return (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td align="right">{fmtKWD(row.amount, showKwd)}</td>
                  <td>{row.client_name}</td>
                  <td>{row.client_account}</td>
                  <td>{row.pref}</td>
                  <td>{row.note}</td>
                  <td style={{ textTransform: "capitalize" }}>{row.status}</td>
                  <td align="right">
                    {canEdit && <button onClick={() => setEditKey({ type: "out", id: row.id })}>Edit</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Manager: Requests Center */}
      {isManager && (
        <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
          <h3>Withdrawal Requests Center — {monthNames[monthIdx]} {year}</h3>
          <table width="100%">
            <thead>
              <tr>
                <th align="left">Date</th>
                <th align="right">Amount</th>
                <th align="left">Client</th>
                <th align="left">Account</th>
                <th align="left">Note</th>
                <th align="left">Status</th>
                <th align="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reqRows.length === 0 && (
                <tr><td colSpan={7} style={{ color: "#777" }}>No requests.</td></tr>
              )}
              {reqRows.map(row => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td align="right">{fmtKWD(row.amount, showKwd)}</td>
                  <td>{row.client_name}</td>
                  <td>{row.client_account}</td>
                  <td>{row.note}</td>
                  <td style={{ textTransform: "capitalize" }}>{row.status}</td>
                  <td align="right" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {row.status !== "approved" && (
                      <button onClick={() => setWithdrawStatus(row.id, "approved")}>Approve</button>
                    )}
                    {row.status !== "rejected" && (
                      <button onClick={() => setWithdrawStatus(row.id, "rejected")}>Reject</button>
                    )}
                    <button onClick={() => setEditKey({ type: "out", id: row.id })}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
