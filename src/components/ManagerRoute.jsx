import { Navigate } from "react-router-dom";
import { useProfile } from "../lib/useProfile";

export default function ManagerRoute({ children }) {
  const { profile, loading } = useProfile();
  if (loading) return null; // or show a spinner
  if (!profile || profile.role !== "manager") {
    return <Navigate to="/app" replace />;
  }
  return children;
}
