import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ManagerDashboard() {
  const [users, setUsers] = useState([]);
  const [tx, setTx] = useState([]);
  const [wd, setWd] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase
        .from("profile")
        .select("user_id, full_name, email, role")
        .order("role", { ascending: false });

      const { data: transactions } = await supabase
        .from("transactions")
        .select("id, user_id, amount, note, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      const { data: withdrawals } = await supabase
        .from("withdrawals")
        .select("id, user_id, amount, preference, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);

      setUsers(profiles || []);
      setTx(transactions || []);
      setWd(withdrawals || []);
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Manager Dashboard</h1>

      <section>
        <h2 className="text-xl font-semibold">Users</h2>
        <ul className="list-disc pl-6">
          {users.map(u => (
            <li key={u.user_id}>{u.full_name || u.email} — {u.role}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Recent Transactions</h2>
        <pre className="bg-gray-50 p-3 rounded">{JSON.stringify(tx, null, 2)}</pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Withdrawals</h2>
        <pre className="bg-gray-50 p-3 rounded">{JSON.stringify(wd, null, 2)}</pre>
      </section>
    </div>
  );
}
