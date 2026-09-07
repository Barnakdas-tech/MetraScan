import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";

interface PlaceholderPageProps {
  title: string;
  description: string;
  phase?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function PlaceholderPage({
  title,
  description,
  phase = "Phase 2+",
  emptyTitle = "Nothing here yet",
  emptyDescription,
}: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="rounded-lg border border-surface-border bg-white shadow-sm">
        <EmptyState
          icon="▦"
          title={emptyTitle}
          description={emptyDescription ?? `This module ships in ${phase}. The routing, layout, and authentication are ready.`}
        />
      </div>
    </div>
  );
}
