// src/App.jsx — INOUT
// - Immediate refresh after actions (this tab)
// - Cross-tab auto-refresh via BroadcastChannel + localStorage
// - Optional light polling fallback (15s when visible)
// - Inline "Edit name", seeded default name on first login
// - Requests Center (manager) + Employees portfolio (read-only)
// - CSV export, dark mode, polished UI

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import Papa from "papaparse";
import { saveAs } from "file-saver";

/* ============================== Helpers ============================== */
const fmtMoney = (n, withSymbol = false) => {
  const x = Number(n || 0);
  const body = x.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return withSymbol ? `د.ك ${body}` : `${body} KD`;
};
const fmtDate = (d) =>
  new Date(d).toLocaleString(undefined, {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const inMonth = (d, y, m) => {
  const x = new Date(d);
  return x.getFullYear() === y && x.getMonth() === m;
};
const exportCSV = (filename, rows) => {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, filename);
};
const monthLabel = (y, m) => {
  const d = new Date(y, m, 1);
  return `${d.toLocaleString(undefined, { month: "short" })} ${String(y).slice(-2)}`;
};

/* ============================== Tiny UI Bits ============================== */
const Badge = ({ tone = "gray", children }) => {
  const T = {
    gray: { bg: "#f3f4f6", bd: "#e5e7eb", fg: "#374151" },
    blue: { bg: "#eff6ff", bd: "#bfdbfe", fg: "#1e3a8a" },
    green: { bg: "#ecfdf5", bd: "#a7f3d0", fg: "#065f46" },
    red: { bg: "#fef2f2", bd: "#fecaca", fg: "#991b1b" },
    amber: { bg: "#fffbeb", bd: "#fde68a", fg: "#92400e" },
  }[tone];
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${T.bd}`,
        background: T.bg,
        color: T.fg,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};
const StatusBadge = ({ status }) => {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return <Badge tone="green">Approved</Badge>;
  if (s === "rejected") return <Badge tone="red">Rejected</Badge>;
  return <Badge tone="amber">Pending</Badge>;
};
const Button = ({ variant = "primary", size = "md", ...props }) => {
  const sizes = { sm: "6px 10px", md: "8px 14px" };
  const v = {
    primary: { bg: "#2563eb", hov: "#1d4ed8", act: "#1e40af", fg: "#fff", bd: "transparent" },
    outline: { bg: "#fff", hov: "#f3f4f6", act: "#e5e7eb", fg: "#111827", bd: "#e5e7eb" },
    subtle: { bg: "#f9fafb", hov: "#f3f4f6", act: "#e5e7eb", fg: "#111827", bd: "#e5e7eb" },
  }[variant];
  return (
    <button
      {...props}
      onMouseEnter={(e) => (e.currentTarget.style.background = v.hov)}
      onMouseLeave={(e) => (e.currentTarget.style.background = v.bg)}
      onMouseDown={(e) => (e.currentTarget.style.background = v.act)}
      onMouseUp={(e) => (e.currentTarget.style.background = v.hov)}
      style={{
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.bd}`,
        padding: sizes[size],
        borderRadius: 10,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
      }}
    />
  );
};
const Logo = ({ dark }) => (
  <div
    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
    title="INOUT — go to top"
  >
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? "#fff" : "#111"}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
    <span style={{ fontWeight: 800, letterSpacing: .5 }}>INOUT</span>
  </div>
);

/* ============================== Auth (email + password) ============================== */
function Auth({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function signInOrUp(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const emailClean = email.trim().toLowerCase();
    const passClean = password.trim();
    try {
      const { error: e1 } = await supabase.auth.signInWithPassword({ email: emailClean, password: passClean });
      if (!e1) return onAuthed?.();
      const { error: e2 } = await supabase.auth.signUp({ email: emailClean, password: passClean });
      if (e2) setErr(e2.message);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.centerWrap}>
      <div style={{ ...styles.card, minWidth: 360 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <Logo dark={false} />
        </div>
        <h2 style={{ margin: "0 0 8px" }}>Login</h2>
        <form onSubmit={signInOrUp} style={styles.form}>
          <input className="input" style={styles.input} type="email" required placeholder="Email"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" style={styles.input} type="password" required placeholder="Password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={loading}>{loading ? "…" : "Sign in / Sign up"}</Button>
          {err && <div style={{ color: "#b91c1c" }}>{err}</div>}
        </form>
      </div>
    </div>
  );
}

/* ============================== App ============================== */
export default function App() {
  // Core
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);

  // UI controls
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  const [showKwd, setShowKwd] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [range, setRange] = useState("month"); // "month" | "all"
  const [includePendingOut, setIncludePendingOut] = useState(false);

  // Requests Center controls
  const [reqFilter, setReqFilter] = useState("all"); // all | pending | approved | rejected
  const [reqQuery, setReqQuery] = useState("");

  // Data
  const [tx, setTx] = useState([]);
  const [wd, setWd] = useState([]);
  const [employees, setEmployees] = useState([]); // {user_id, full_name, email}
  const [expanded, setExpanded] = useState({}); // { user_id: bool }

  // Forms
  const [inAmt, setInAmt] = useState("");
  const [inAcc, setInAcc] = useState("");
  const [inPref, setInPref] = useState("monthly");
  const [inNote, setInNote] = useState("");
  const [wdAmt, setWdAmt] = useState("");
  const [wdAcc, setWdAcc] = useState("");

  // Inline name editor
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const bcRef = useRef(null); // for cross-tab refresh

  const log = (m) => setLogs((p) => [...p, `[${new Date().toLocaleTimeString()}] ${m}`]);

  useEffect(() => {
    document.documentElement.style.background = dark ? "#0b0d10" : "#f6f7f9";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Ensure profile row (seed name if missing)
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    (async () => {
      try {
        setError("");
        const { data: existing, error: selErr } = await supabase
          .from("profile").select("*").eq("user_id", uid).maybeSingle();
        if (selErr) throw selErr;
        if (existing) {
          setProfile(existing);
          setNameInput(existing.full_name || "");
          return;
        }
        // Seed default name from email prefix
        const seed = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || session.user.email;
        const { error: insErr } = await supabase.from("profile").insert({
          user_id: uid, full_name: seed, email: session.user.email, role: "employee",
        });
        if (insErr) throw insErr;
        const { data: created } = await supabase.from("profile").select("*").eq("user_id", uid).maybeSingle();
        setProfile(created || { user_id: uid, full_name: seed, email: session.user.email, role: "employee" });
        setNameInput(created?.full_name || seed || "");
      } catch (e) {
        const msg = e?.message || String(e);
        setError("Profile error: " + msg);
        setProfile((p) => p || {
          user_id: session.user.id,
          full_name: session.user.email?.split("@")[0],
          email: session.user.email,
          role: "employee",
        });
        setNameInput(session.user.email?.split("@")[0] || "");
      }
    })();
  }, [session]);

  // Cross-tab sync: BroadcastChannel + localStorage 'storage' event
  useEffect(() => {
    if (!profile) return;
    try {
      bcRef.current = new BroadcastChannel("inout-sync");
      bcRef.current.onmessage = (ev) => {
        if (ev?.data?.type === "refresh") loadData();
      };
    } catch (_) {
      bcRef.current = null; // some browsers incognito may block it
    }
    const onStorage = (e) => {
      if (e.key === "inout-refresh" && e.newValue !== e.oldValue) loadData();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      try { bcRef.current?.close(); } catch (_) {}
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id]);

  // Light polling fallback (refresh every 15s only if tab visible)
  useEffect(() => {
    if (!profile) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadData();
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id, year, monthIdx, range]);

  function notifyPeers() {
    try { bcRef.current?.postMessage({ type: "refresh", at: Date.now() }); } catch (_) {}
    try { localStorage.setItem("inout-refresh", String(Date.now())); } catch (_) {}
  }

  // Load data
  async function loadData() {
    if (!session || !profile) return;
    setError("");

    const start = new Date(year, monthIdx, 1).toISOString();
    const end = new Date(year, monthIdx + 1, 1).toISOString();

    let txQ = supabase.from("transactions").select("*").order("created_at", { ascending: false });
    let wdQ = supabase.from("withdrawals").select("*").order("created_at", { ascending: false });

    if (profile.role === "manager") {
      if (range === "month") {
        txQ = txQ.gte("created_at", start).lt("created_at", end);
        wdQ = wdQ.gte("created_at", start).lt("created_at", end);
      } else {
        txQ = txQ.limit(2000);
        wdQ = wdQ.limit(2000);
      }
    } else {
      txQ = txQ.eq("user_id", session.user.id).gte("created_at", start).lt("created_at", end);
      wdQ = wdQ.eq("user_id", session.user.id);
    }

    const [{ data: txd, error: e1 }, { data: wdd, error: e2 }] = await Promise.all([txQ, wdQ]);
    if (e1) setError("Transactions: " + e1.message);
    if (e2) setError("Withdrawals: " + e2.message);
    setTx(txd || []);
    setWd(wdd || []);

    // Load employee identities for manager portfolio/requests
    if (profile.role === "manager") {
      const ids = Array.from(new Set([...(txd || []).map((t) => t.user_id), ...(wdd || []).map((w) => w.user_id)]));
      if (ids.length) {
        const { data: ppl } = await supabase.from("profile").select("user_id, full_name, email").in("user_id", ids);
        setEmployees(ppl || []);
      } else {
        setEmployees([]);
      }
    } else {
      setEmployees([{
        user_id: session.user.id,
        full_name: profile?.full_name || "",
        email: profile?.email || session.user.email,
      }]);
    }
  }
  useEffect(() => {
    if (profile) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, year, monthIdx, range]);

  // Derived
  const isManager = profile?.role === "manager";
  const nameOf = (uid) => {
    const u = employees.find((e) => e.user_id === uid);
    if (!u) return uid?.slice(0, 8) || "unknown";
    if (u.full_name && u.full_name.trim()) return u.full_name.trim();
    if (u.email) {
      const local = u.email.split("@")[0] || u.email;
      const pretty = local.replace(/[._-]+/g, " ")
        .split(" ").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
      return pretty || u.email;
    }
    return uid?.slice(0, 8) || "unknown";
  };

  // Self totals (this month)
  const myTxThisMonth = tx.filter((t) => session && t.user_id === session.user.id && inMonth(t.created_at, year, monthIdx));
  const myInTotal = myTxThisMonth.reduce((a, b) => a + Number(b.amount || 0), 0);
  const myWdAll = wd.filter((w) => session && w.user_id === session.user.id);
  const myWdThisMonth = myWdAll.filter((w) => inMonth(w.created_at, year, monthIdx));
  const myOutApprovedTotal = myWdThisMonth.filter((w) => w.status === "approved").reduce((a, b) => a + Number(b.amount || 0), 0);

  // Manager totals
  const managerTotals = useMemo(() => {
    if (!isManager) return { totalIn: 0, totalOut: 0, totalNet: 0 };
    const outRows = includePendingOut ? wd : (wd || []).filter((w) => w.status === "approved");
    const totalIn = (tx || []).reduce((a, b) => a + Number(b.amount || 0), 0);
    const totalOut = (outRows || []).reduce((a, b) => a + Number(b.amount || 0), 0);
    return { totalIn, totalOut, totalNet: totalIn - totalOut };
  }, [isManager, tx, wd, includePendingOut]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    if (!isManager) return [];
    let rows = [...(wd || [])];
    if (reqFilter !== "all") rows = rows.filter((r) => String(r.status || "pending").toLowerCase() === reqFilter);
    const q = reqQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const nm = nameOf(r.user_id).toLowerCase();
        const em = (employees.find((e) => e.user_id === r.user_id)?.email || "").toLowerCase();
        const ca = (r.client_account || "").toLowerCase();
        return nm.includes(q) || em.includes(q) || ca.includes(q);
      });
    }
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return rows;
  }, [isManager, wd, reqFilter, reqQuery, employees]);

  // Actions (now call loadData() + notifyPeers() after success)
  async function addDeposit(e) {
    e.preventDefault();
    const n = Number(inAmt);
    if (!n || n <= 0) return;
    const { error } = await supabase.from("transactions").insert({
      user_id: session.user.id, type: "IN", amount: n,
      client_account: inAcc || null, preference: inPref, note: inNote || null,
    });
    if (error) setError(error.message);
    else { await loadData(); notifyPeers(); }
    setInAmt(""); setInAcc(""); setInPref("monthly"); setInNote("");
  }
  async function submitWithdrawal(e) {
    e.preventDefault();
    const n = Number(wdAmt);
    if (!n || n <= 0) return;
    const { error } = await supabase.from("withdrawals").insert({
      user_id: session.user.id, amount: n, client_account: wdAcc || "N/A",
    });
    if (error) setError(error.message);
    else { await loadData(); notifyPeers(); }
    setWdAmt(""); setWdAcc("");
  }
  async function setStatus(id, status) {
    const { error } = await supabase.from("withdrawals").update({ status }).eq("id", id);
    if (error) setError(error.message);
    else { await loadData(); notifyPeers(); }
  }

  async function saveDisplayName() {
    const v = nameInput.trim();
    if (!v) return;
    const { error } = await supabase.from("profile").update({ full_name: v }).eq("user_id", profile.user_id);
    if (error) { setError(error.message); return; }
    setEditingName(false);
    await loadData(); // update local lists; also broadcast
    notifyPeers();
  }

  // Auth gate
  if (!session) return <Auth onAuthed={() => {}} />;

  return (
    <div style={{ ...styles.page, background: dark ? "#0b0d10" : "#f6f7f9", color: dark ? "#fff" : "#111" }}>
      {/* Header */}
      <div style={{ ...styles.card, padding: 16, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
        <div style={{ ...styles.row, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo dark={dark} />
            <Badge tone="blue">Role: {profile?.role || "employee"}</Badge>
          </div>
          <div style={styles.headerControls}>
            <select value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))} style={styles.select}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>{new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}</option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={styles.select}>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <label style={styles.inlineLabel}>
              <input type="checkbox" checked={showKwd} onChange={(e) => setShowKwd(e.target.checked)} style={{ marginRight: 6 }} />
              Show KWD symbol
            </label>
            {isManager && (
              <>
                <label style={styles.inlineLabel}>
                  Range
                  <select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...styles.select, marginLeft: 6 }}>
                    <option value="month">This Month</option>
                    <option value="all">All Time</option>
                  </select>
                </label>
                <label style={styles.inlineLabel}>
                  <input type="checkbox" checked={includePendingOut}
                         onChange={(e) => setIncludePendingOut(e.target.checked)} style={{ marginRight: 6 }} />
                  Count pending OUT in totals
                </label>
              </>
            )}
            <Button variant="outline" onClick={() => setDark((d) => !d)}>{dark ? "Light" : "Dark"} mode</Button>
            <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
          </div>
        </div>

        {/* Name line with inline editor */}
        <div style={{ color: dark ? "#93a4b5" : "#6b7280", marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>
            Logged in as <b>{profile?.full_name?.trim() || profile?.email || session.user.email}</b>
          </span>
          {!editingName ? (
            <Button variant="subtle" size="sm" onClick={() => setEditingName(true)}>Edit name</Button>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); saveDisplayName(); }}
              style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                     placeholder="Your display name" style={{ ...styles.input, padding: "6px 8px" }} />
              <Button size="sm" variant="primary" type="submit">Save</Button>
              <Button size="sm" variant="outline" type="button"
                      onClick={() => { setEditingName(false); setNameInput(profile?.full_name || ""); }}>
                Cancel
              </Button>
            </form>
          )}
        </div>

        {error && <div style={{ marginTop: 8, color: "#fca5a5" }}>Error: {error}</div>}
      </div>

      {/* Manager summary */}
      {isManager && (
        <div style={{ ...styles.card, padding: 16, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
          <div style={{ ...styles.row, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <SummaryTile label="Total IN" value={fmtMoney(managerTotals.totalIn, showKwd)} tone="green" />
              <SummaryTile label="Total OUT" value={fmtMoney(managerTotals.totalOut, showKwd)} tone="red" />
              <SummaryTile label="Net Profit" value={fmtMoney(managerTotals.totalNet, showKwd)} tone="blue" />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="subtle"
                onClick={() => {
                  const tag = range === "all" ? "all" : `${year}_${String(monthIdx + 1).padStart(2, "0")}`;
                  exportCSV(`transactions_${tag}.csv`,
                    (tx || []).map((t) => ({
                      Date: fmtDate(t.created_at),
                      Employee: nameOf(t.user_id),
                      Amount: Number(t.amount || 0),
                      Client: t.client_account || "-",
                      Pref: t.preference || "-",
                      Note: t.note || "",
                    }))
                  );
                }}
              >Export IN CSV</Button>
              <Button
                variant="subtle"
                onClick={() => {
                  const tag = range === "all" ? "all" : `${year}_${String(monthIdx + 1).padStart(2, "0")}`;
                  exportCSV(`withdrawals_${tag}.csv`,
                    (wd || []).map((w) => ({
                      Date: fmtDate(w.created_at),
                      Employee: nameOf(w.user_id),
                      Amount: Number(w.amount || 0),
                      Client: w.client_account,
                      Status: w.status,
                    }))
                  );
                }}
              >Export OUT CSV</Button>
              <Button
                variant="subtle"
                onClick={() => {
                  const outs = includePendingOut ? wd : (wd || []).filter((w) => w.status === "approved");
                  const totals = new Map();
                  (tx || []).forEach((t) => {
                    const m = totals.get(t.user_id) || { inTotal: 0, outTotal: 0 };
                    m.inTotal += Number(t.amount || 0);
                    totals.set(t.user_id, m);
                  });
                  (outs || []).forEach((w) => {
                    const m = totals.get(w.user_id) || { inTotal: 0, outTotal: 0 };
                    m.outTotal += Number(w.amount || 0);
                    totals.set(w.user_id, m);
                  });
                  const tag = range === "all" ? "all" : `${year}_${String(monthIdx + 1).padStart(2, "0")}`;
                  exportCSV(`employee_totals_${tag}.csv`,
                    Array.from(totals.entries()).map(([uid, v]) => ({
                      Employee: nameOf(uid),
                      "IN Total": Number(v.inTotal || 0),
                      "OUT Total": Number(v.outTotal || 0),
                      "NET (IN-OUT)": Number((v.inTotal || 0) - (v.outTotal || 0)),
                    }))
                  );
                }}
              >Export Totals CSV</Button>
            </div>
          </div>
        </div>
      )}

      {/* === MANAGER: Withdrawal Requests Center === */}
      {isManager && (
        <div style={{ ...styles.card, padding: 0, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
          <SectionHeader title={`Withdrawal Requests Center — ${range === "all" ? "All Time" : monthLabel(year, monthIdx)}`} dark={dark} />
          <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={styles.inlineLabel}>
              Status
              <select value={reqFilter} onChange={(e) => setReqFilter(e.target.value)} style={{ ...styles.select, marginLeft: 6 }}>
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <input placeholder="Search employee / email / client" value={reqQuery} onChange={(e) => setReqQuery(e.target.value)}
                   style={{ ...styles.input, minWidth: 260 }} />
          </div>
          <div style={{ padding: 12 }}>
            <Table
              dark={dark}
              headers={["Date","Employee","Amount","Client","Status","Actions"]}
              rows={filteredRequests.map((w) => [
                fmtDate(w.created_at),
                nameOf(w.user_id),
                <b key={`amt-${w.id}`}>{fmtMoney(w.amount, showKwd)}</b>,
                w.client_account,
                <StatusBadge key={`stat-${w.id}`} status={w.status} />,
                <div key={`act-${w.id}`} style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" onClick={() => setStatus(w.id, "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(w.id, "rejected")}>Reject</Button>
                  <Button size="sm" variant="subtle" onClick={() => setStatus(w.id, "pending")}>Reset</Button>
                </div>,
              ])}
              numericCols={[2]}
              emptyText="No requests."
            />
          </div>
        </div>
      )}

      {/* Employee quick totals (self) */}
      {!isManager && (
        <div style={{ ...styles.card, padding: 14, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
          <h2 style={styles.h2}>Your Totals (This Month)</h2>
          <div style={{ ...styles.rowWrap, gap: 10 }}>
            <Badge tone="green">Your IN: {fmtMoney(myInTotal, showKwd)}</Badge>
            <Badge tone="red">Your OUT (Approved): {fmtMoney(myOutApprovedTotal, showKwd)}</Badge>
            <Badge tone="gray">IN rows: {myTxThisMonth.length}</Badge>
            <Badge tone="gray">OUT rows: {myWdThisMonth.length}</Badge>
          </div>
        </div>
      )}

      {/* Add IN / Request OUT */}
      <div style={{ ...styles.card, padding: 14, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
        <h2 style={styles.h2}>Add Money IN (Deposit)</h2>
        <form onSubmit={addDeposit} style={styles.rowWrap}>
          <input type="number" step="0.001" required placeholder="Amount" value={inAmt} onChange={(e) => setInAmt(e.target.value)} style={styles.input} />
          <input type="text" placeholder="Client Account #" value={inAcc} onChange={(e) => setInAcc(e.target.value)} style={styles.input} />
          <select value={inPref} onChange={(e) => setInPref(e.target.value)} style={styles.select}>
            <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
          </select>
          <input type="text" placeholder="Note (optional)" value={inNote} onChange={(e) => setInNote(e.target.value)} style={{ ...styles.input, minWidth: 220 }} />
          <Button variant="primary">Add IN</Button>
        </form>
      </div>

      <div style={{ ...styles.card, padding: 14, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
        <h2 style={styles.h2}>Withdrawal Request (OUT)</h2>
        <form onSubmit={submitWithdrawal} style={styles.rowWrap}>
          <input type="number" step="0.001" required placeholder="Amount" value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} style={styles.input} />
          <input type="text" placeholder="Client Account #" value={wdAcc} onChange={(e) => setWdAcc(e.target.value)} style={styles.input} />
          <Button variant="primary">Submit</Button>
        </form>
      </div>

      {/* Employee IN table (self) */}
      {!isManager && (
        <div style={{ ...styles.card, padding: 0, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
          <SectionHeader title="Your IN (This Month)" dark={dark} />
          <Table
            dark={dark}
            headers={["Date", "Amount", "Client", "Pref", "Note"]}
            rows={myTxThisMonth.map((t) => [
              fmtDate(t.created_at),
              <b key={`amt-${t.id}`}>{fmtMoney(t.amount, showKwd)}</b>,
              t.client_account || "-",
              t.preference || "-",
              t.note || "",
            ])}
            numericCols={[1]}
            emptyText="No entries."
          />
        </div>
      )}

      {/* Employee OUT table (self) */}
      {!isManager && (
        <div style={{ ...styles.card, padding: 0, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
          <SectionHeader title="Your Withdrawal Requests" dark={dark} />
          <Table
            dark={dark}
            headers={["Date", "Amount", "Client", "Status"]}
            rows={myWdAll.map((w) => [
              fmtDate(w.created_at),
              <b key={`myout-${w.id}`}>{fmtMoney(w.amount, showKwd)}</b>,
              w.client_account,
              <StatusBadge key={`stat-${w.id}`} status={w.status} />,
            ])}
            numericCols={[1]}
            emptyText="No requests."
          />
        </div>
      )}

      {/* Manager per-employee list (collapsible) — portfolio (read-only) */}
      {isManager && (
        <div style={{ ...styles.card, padding: 0, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
          <SectionHeader title={`Employees (${range === "all" ? "All Time" : "Selected Month"})`} dark={dark} />
          <div style={{ padding: 10 }}>
            {(() => {
              const outsForTotals = includePendingOut ? wd : (wd || []).filter((w) => w.status === "approved");
              const totals = new Map();
              (tx || []).forEach((t) => {
                const r = totals.get(t.user_id) || { inTotal: 0, outTotal: 0, inCount: 0, outCount: 0 };
                r.inTotal += Number(t.amount || 0); r.inCount += 1; totals.set(t.user_id, r);
              });
              (outsForTotals || []).forEach((w) => {
                const r = totals.get(w.user_id) || { inTotal: 0, outTotal: 0, inCount: 0, outCount: 0 };
                r.outTotal += Number(w.amount || 0); r.outCount += 1; totals.set(w.user_id, r);
              });

              const list = Array.from(totals.entries()).map(([uid, v]) => ({
                uid, name: nameOf(uid),
                inTotal: v.inTotal, outTotal: v.outTotal, net: v.inTotal - v.outTotal,
                inCount: v.inCount, outCount: v.outCount,
              })).sort((a, b) => b.net - a.net);

              if (!list.length) return <div style={{ color: dark ? "#93a4b5" : "#6b7280", padding: 10 }}>No data.</div>;

              return list.map((row) => {
                const isOpen = !!expanded[row.uid];
                return (
                  <div key={row.uid} style={{ border: `1px solid ${dark ? "#1b2430" : "#eef2f7"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                    <div
                      onClick={() => setExpanded((m) => ({ ...m, [row.uid]: !isOpen }))}
                      style={{
                        display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 12, alignItems: "center",
                        padding: "10px 12px", cursor: "pointer", background: dark ? "#0f1318" : "#fbfdff",
                        borderBottom: `1px solid ${dark ? "#1b2430" : "#eef2f7"}`
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{row.name}</div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#065f46" }}>
                        <b>{fmtMoney(row.inTotal, showKwd)}</b>
                      </div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#991b1b" }}>
                        <b>{fmtMoney(row.outTotal, showKwd)}</b>
                      </div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.net >= 0 ? "#059669" : "#b91c1c" }}>
                        <b>{fmtMoney(row.net, showKwd)}</b>
                      </div>
                      <div style={{ color: dark ? "#93a4b5" : "#6b7280", fontSize: 13 }}>{row.inCount} / {row.outCount}</div>
                    </div>

                    <div style={{ maxHeight: isOpen ? 1000 : 0, transition: "max-height .35s ease", overflow: "hidden", background: dark ? "#0b0f14" : "#fff" }}>
                      <div style={{ padding: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <h4 style={{ margin: "0 0 6px" }}>IN</h4>
                            <Table
                              dark={dark}
                              headers={["Date", "Amount", "Client", "Pref", "Note"]}
                              rows={(tx || []).filter((t) => t.user_id === row.uid).map((t) => [
                                fmtDate(t.created_at),
                                <b key={`tin-${t.id}`}>{fmtMoney(t.amount, showKwd)}</b>,
                                t.client_account || "-",
                                t.preference || "-",
                                t.note || "",
                              ])}
                              numericCols={[1]}
                              emptyText="No IN."
                            />
                          </div>
                          <div>
                            <h4 style={{ margin: "0 0 6px" }}>OUT</h4>
                            <Table
                              dark={dark}
                              headers={["Date", "Amount", "Client", "Status"]}
                              rows={(wd || []).filter((w) => w.user_id === row.uid).map((w) => [
                                fmtDate(w.created_at),
                                <b key={`wout-${w.id}`}>{fmtMoney(w.amount, showKwd)}</b>,
                                w.client_account,
                                <StatusBadge status={w.status} key={`st-${w.id}`} />,
                              ])}
                              numericCols={[1]}
                              emptyText="No OUT."
                            />
                          </div>
                        </div>

                        {/* Per-employee CSV */}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <Button
                            variant="subtle"
                            onClick={() => {
                              const tag = range === "all" ? "all" : `${year}_${String(monthIdx + 1).padStart(2, "0")}`;
                              exportCSV(`employee_${row.name}_${tag}_IN.csv`,
                                (tx || []).filter((t) => t.user_id === row.uid).map((t) => ({
                                  Date: fmtDate(t.created_at),
                                  Amount: Number(t.amount || 0),
                                  Client: t.client_account || "-",
                                  Pref: t.preference || "-",
                                  Note: t.note || "",
                                }))
                              );
                            }}
                          >Export IN</Button>
                          <Button
                            variant="subtle"
                            onClick={() => {
                              const tag = range === "all" ? "all" : `${year}_${String(monthIdx + 1).padStart(2, "0")}`;
                              exportCSV(`employee_${row.name}_${tag}_OUT.csv`,
                                (wd || []).filter((w) => w.user_id === row.uid).map((w) => ({
                                  Date: fmtDate(w.created_at),
                                  Amount: Number(w.amount || 0),
                                  Client: w.client_account,
                                  Status: w.status,
                                }))
                              );
                            }}
                          >Export OUT</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Debug logs */}
      <div style={{ ...styles.card, padding: 12, background: dark ? "#0f1318" : "#fff", borderColor: dark ? "#1b2430" : "#e8ecf1" }}>
        <details>
          <summary>Debug logs</summary>
          <pre style={{ whiteSpace: "pre-wrap", color: dark ? "#cdd6df" : "#111" }}>{logs.join("\n") || "(no logs yet)"}</pre>
        </details>
      </div>
    </div>
  );
}

/* ============================== Reusable Pieces ============================== */
function SectionHeader({ title, dark }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderBottom: `1px solid ${dark ? "#1b2430" : "#eef2f7"}`,
      background: dark ? "#0b0f14" : "#fbfdff", borderTopLeftRadius: 12, borderTopRightRadius: 12,
    }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
    </div>
  );
}
function SummaryTile({ label, value, tone = "gray" }) {
  const T = {
    green: { fg: "#065f46", bg: "#ecfdf5", bd: "#a7f3d0" },
    red: { fg: "#991b1b", bg: "#fef2f2", bd: "#fecaca" },
    blue: { fg: "#1e3a8a", bg: "#eff6ff", bd: "#bfdbfe" },
    gray: { fg: "#374151", bg: "#f3f4f6", bd: "#e5e7eb" },
  }[tone];
  return (
    <div style={{
      minWidth: 180, padding: 12, background: T.bg, border: `1px solid ${T.bd}`, color: T.fg,
      borderRadius: 12, boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
    }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}
function Table({ headers, rows, emptyText, numericCols = [], dark }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{headers.map((h, i) => <th key={i} style={{ ...styles.th, borderColor: dark ? "#1b2430" : "#eef2f7", color: dark ? "#cdd6df" : "#374151" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? (dark ? "#0b0f14" : "#fff") : (dark ? "#0f1318" : "#fbfdff") }}>
              {r.map((c, ci) => (
                <td key={ci} style={{
                  ...styles.td,
                  borderColor: dark ? "#121820" : "#f3f4f6",
                  color: dark ? "#d7e0ea" : "#111",
                  ...(numericCols.includes(ci) ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : null)
                }}>{c}</td>
              ))}
            </tr>
          )) : (
            <tr><td colSpan={headers.length} style={{ ...styles.td, color: dark ? "#93a4b5" : "#6b7280" }}>{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ============================== Styles ============================== */
const styles = {
  page: { maxWidth: 1150, margin: "0 auto", padding: "18px", fontFamily: "ui-sans-serif, system-ui" },
  card: { background: "#fff", border: "1px solid #e8ecf1", borderRadius: 12, padding: 12, marginBottom: 10, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowWrap: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  headerControls: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  input: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 10px", background: "#fff", color: "#111" },
  select: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 10px", background: "#fff" },
  inlineLabel: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 },
  h2: { margin: "0 0 8px", fontSize: 18 },
  th: { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid #eef2f7", whiteSpace: "nowrap", fontSize: 13 },
  td: { padding: "10px 14px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", fontSize: 14 },
  centerWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "#f6f7f9" },
  form: { display: "grid", gap: 10, marginTop: 8 },
};
