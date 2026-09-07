import { useParams } from "react-router-dom";
import PlaceholderPage from "./PlaceholderPage";

export default function ViolationDetailPage() {
  const { violationId } = useParams();
  return <PlaceholderPage title={`Violation ${violationId}`} description="Violation details, evidence, and rule reference." phase="Phase 4+" />;
}
