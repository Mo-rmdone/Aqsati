import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";

// Mirrors customer_write's own role gate (0003_customers.sql) so a viewer
// never sees a create action that would just fail server-side — same
// pattern as Worklist.tsx's ACTION_ROLES.
const WRITE_ROLES = new Set(["owner", "manager", "accountant"]);

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  national_id: string | null;
  blacklist_flag: boolean;
}

/**
 * Full customer list — searchable by name/phone, same query-splitting
 * technique as CustomerPicker.tsx (Task 9) for the same reason (`.ilike()`
 * takes its pattern as a plain parameter, so it can't be injection-prone the
 * way a single `.or()` filter string would be for user-supplied text), but
 * this is the standalone management page CustomerPicker's own comment says
 * is out of its scope — a full page with pagination-sized results and a
 * link into Customer 360, not an inline wizard picker.
 */
export default function CustomerList() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      const term = search.trim().slice(0, 100);
      const cols = "id, name, phone, national_id, blacklist_flag";

      if (!term) {
        const { data, error } = await supabase
          .from("customer")
          .select(cols)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data as CustomerRow[];
      }

      const pattern = `%${term}%`;
      const [byName, byPhone] = await Promise.all([
        supabase
          .from("customer")
          .select(cols)
          .ilike("name", pattern)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("customer")
          .select(cols)
          .ilike("phone", pattern)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (byName.error) throw byName.error;
      if (byPhone.error) throw byPhone.error;

      const merged = new Map<string, CustomerRow>();
      for (const c of [...byName.data, ...byPhone.data]) {
        merged.set(c.id, c as CustomerRow);
      }
      return Array.from(merged.values()).slice(0, 50);
    },
  });

  const canWrite = profile ? WRITE_ROLES.has(profile.role) : false;

  async function handleCreate() {
    if (!profile) return;
    setCreateError(null);
    if (!newName.trim() || !newPhone.trim()) {
      setCreateError("الاسم ورقم الهاتف مطلوبان");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("customer").insert({
      tenant_id: profile.tenant_id,
      name: newName.trim(),
      phone: newPhone.trim(),
    });
    setSubmitting(false);

    if (error) {
      setCreateError(error.message);
      return;
    }
    setNewName("");
    setNewPhone("");
    setCreating(false);
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">العملاء</h1>
        {canWrite && (
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + عميل جديد
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-lg border border-white/10 bg-panel p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="اسم العميل"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
            />
            <input
              type="tel"
              placeholder="رقم الهاتف"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="flex-1 rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleCreate()}
              className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "جارِ الحفظ..." : "حفظ"}
            </button>
          </div>
          {createError && <p className="mt-2 text-xs text-danger">{createError}</p>}
        </div>
      )}

      <input
        type="text"
        placeholder="ابحث بالاسم أو رقم الهاتف..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
      />

      <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-start text-xs text-muted">
              <th className="px-3 py-2 text-start font-medium">الاسم</th>
              <th className="px-3 py-2 text-start font-medium">الهاتف</th>
              <th className="px-3 py-2 text-start font-medium">الرقم القومي</th>
              <th className="px-3 py-2 text-start font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  جارِ التحميل...
                </td>
              </tr>
            ) : customers && customers.length > 0 ? (
              customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/5"
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/customers/${c.id}`}
                      className="text-white hover:text-teal hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted tabular-nums">{c.phone}</td>
                  <td className="px-3 py-2 font-mono text-muted tabular-nums">
                    {c.national_id ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.blacklist_flag ? (
                      <span className="text-danger">قائمة سوداء</span>
                    ) : (
                      <span className="text-success">عادي</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  لا يوجد عملاء مطابقون
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
