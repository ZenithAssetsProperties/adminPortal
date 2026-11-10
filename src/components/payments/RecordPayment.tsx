"use client";
import { useState } from "react";
import { Button, ErrorNote, Field, Input, Modal, Select } from "@/components/ui";
import { api, naira } from "@/lib/client";

export default function RecordPayment({ transactionId, outstandingKobo, onDone }: { transactionId: string; outstandingKobo: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState("bank_transfer");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api("/api/admin/payments", { body: { transactionId, amountKobo: Math.round(Number(amount) * 100), method } }); setOpen(false); setAmount(""); onDone(); }
    catch (x) { setError((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Record payment</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record a payment">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Amount (₦)" hint={`Outstanding: ${naira(outstandingKobo)}`}><Input required type="number" min={1} step="any" max={outstandingKobo / 100} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="How was it paid?"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="pos">POS</option><option value="other">Other</option></Select></Field>
          <ErrorNote message={error} /><Button type="submit" loading={busy}>Record and issue receipt</Button>
        </form>
      </Modal>
    </>
  );
}
