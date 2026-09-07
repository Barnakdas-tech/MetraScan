import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import { createInspection } from "../../lib/inspectionApi";
import { getErrorMessage } from "../../lib/api";

export default function NewInspectionPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    inspectionDate: new Date().toISOString().slice(0, 10),
    location: "",
    notes: "",
    packageType: "RETAIL",
    intendedConsumer: "RETAIL",
    productName: "",
    productBrand: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const inspection = await createInspection({
        packageType: form.packageType as "RETAIL" | "WHOLESALE" | "IMPORTED" | "UNKNOWN",
        intendedConsumer: form.intendedConsumer,
        inspectionDate: new Date(form.inspectionDate + "T00:00:00").toISOString(),
        location: form.location || undefined,
        notes: form.notes || undefined,
        product: form.productName.trim()
          ? { name: form.productName.trim(), brand: form.productBrand.trim() || undefined }
          : undefined,
      });
      navigate(`/app/inspection/${inspection.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New Inspection"
        description="Enter the inspection details. Package images are uploaded on the next screen."
      />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="inspectionDate"
              type="date"
              label="Inspection date"
              value={form.inspectionDate}
              onChange={e => set("inspectionDate", e.target.value)}
              required
            />
            <Select
              id="packageType"
              label="Package type"
              value={form.packageType}
              onChange={e => set("packageType", e.target.value)}
              options={[
                { value: "RETAIL", label: "Retail package" },
                { value: "WHOLESALE", label: "Wholesale package" },
                { value: "IMPORTED", label: "Imported package" },
                { value: "UNKNOWN", label: "Unknown / to be determined" },
              ]}
            />
            <Select
              id="intendedConsumer"
              label="Intended consumer"
              value={form.intendedConsumer}
              onChange={e => set("intendedConsumer", e.target.value)}
              options={[
                { value: "RETAIL", label: "Retail consumers" },
                { value: "INDUSTRIAL", label: "Industrial consumers" },
                { value: "INSTITUTIONAL", label: "Institutional consumers" },
                { value: "UNKNOWN", label: "Unknown" },
              ]}
            />
          </div>
          <Input
            id="location"
            label="Location"
            placeholder="e.g., Sector 21 Market, Chandigarh"
            value={form.location}
            onChange={e => set("location", e.target.value)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="productName"
              label="Product name (optional)"
              placeholder="As printed on the package"
              value={form.productName}
              onChange={e => set("productName", e.target.value)}
            />
            <Input
              id="productBrand"
              label="Brand (optional)"
              value={form.productBrand}
              onChange={e => set("productBrand", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Context for this inspection (optional)"
              className="block w-full rounded-md border border-surface-border px-3 py-2 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={loading}>
              Create inspection &amp; add images
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
