import { useParams } from "react-router-dom";
import PlaceholderPage from "./PlaceholderPage";

export default function ReportDetailPage() {
  const { reportId } = useParams();
  return <PlaceholderPage title={`Report ${reportId}`} description="Compliance report document." phase="Phase 6+" />;
}
