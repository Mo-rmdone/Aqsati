import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export interface PickedCustomer {
  id: string;
  name: string;
  phone: string;
}

/**
 * Minimal inline customer picker/creator for the contract wizard (Task 9).
 *
 * There is no customer-management UI yet — that's Task 11's
 * `web/src/features/customers/*`. This component exists only to unblock the
 * wizard's first step ("a contract needs a customer_id") and is intentionally
 * small: a searchable list over `public.customer` for the signed-in tenant
 * (RLS scopes it automatically) plus a bare-bones "add new customer" form
 * (name + phone, per the `customer` table's NOT NULL columns). It is not a
 * preview of Task 11's real customer management screen.
 */
export default function CustomerPicker({
  value,
  onChange,
  tenantId,
}: {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
  /** `public.customer` has no DB-side default/trigger for tenant_id — unlike
   * the RPC-mediated writes elsewhere in the app, a direct table insert from
   * the client must supply it explicitly (RLS's `customer_write` policy
   * checks it against current_tenant_id() regardless). */
  tenantId: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: results, isFetching } = useQuery({
    queryKey: ["customer-search", search],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from("customer")
        .select("id, name, phone")
        .order("created_at", { ascending: false })
        .limit(8);

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PickedCustomer[];
    },
  });

  async function handleCreate() {
    setCreateError(null);
    if (!newName.trim() || !newPhone.trim()) {
      setCreateError("الاسم ورقم الهاتف مطلوبان");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("customer")
      .insert({ tenant_id: tenantId, name: newName.trim(), phone: newPhone.trim() })
      .select("id, name, phone")
      .single();
    setSubmitting(false);

    if (error) {
      setCreateError(error.message);
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["customer-search"] });
    onChange(data as PickedCustomer);
    setCreating(false);
    setOpen(false);
    setNewName("");
    setNewPhone("");
  }

  if (value && !open) {
    return (
      <div className="flex items-center justify-between rounded-md border border-white/15 bg-navy px-3 py-2">
        <div>
          <div className="font-semibold text-white">{value.name}</div>
          <div className="font-mono text-sm text-muted tabular-nums">
            {value.phone}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-amber hover:underline"
        >
          تغيير العميل
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="ابحث بالاسم أو رقم الهاتف..."
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
      />

      {open && (
        <div className="rounded-md border border-white/10 bg-panel">
          {isFetching && (
            <div className="px-3 py-2 text-sm text-muted">جارِ البحث...</div>
          )}

          {!isFetching && results && results.length === 0 && !creating && (
            <div className="px-3 py-2 text-sm text-muted">لا يوجد عملاء مطابقون</div>
          )}

          <ul>
            {results?.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-start hover:bg-white/5"
                >
                  <span className="text-white">{c.name}</span>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {c.phone}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-white/10 p-3">
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-sm font-medium text-amber hover:underline"
              >
                + إضافة عميل جديد
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="اسم العميل"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="rounded-md border border-white/15 bg-navy px-3 py-2 text-sm text-white outline-none focus:border-teal"
                />
                <input
                  type="tel"
                  placeholder="رقم الهاتف"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="rounded-md border border-white/15 bg-navy px-3 py-2 text-sm text-white outline-none focus:border-teal"
                />
                {createError && (
                  <p className="text-xs text-danger">{createError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleCreate()}
                    className="rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? "جارِ الحفظ..." : "حفظ العميل"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setCreateError(null);
                    }}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
