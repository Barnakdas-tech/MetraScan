import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";

export default function ScanPage() {
  return (
    <div>
      <PageHeader title="Scan" description="Capture or upload package photographs for analysis." />
      <div className="rounded-lg border border-surface-border bg-white shadow-sm">
        <EmptyState
          icon="⧉"
          title="Scanning arrives in Phase 2"
          description="Camera capture, image upload, and quality checks will be built here."
        />
      </div>
    </div>
  );
}
