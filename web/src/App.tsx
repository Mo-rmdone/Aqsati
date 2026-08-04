import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth-context";
import ProtectedRoute from "./routes/ProtectedRoute";
import AppLayout from "./routes/AppLayout";
import Dashboard from "./features/dashboard/Dashboard";
import Login from "./routes/Login";
import Signup from "./routes/Signup";
import ContractWizard from "./features/contracts/ContractWizard";
import ContractDetail from "./features/contracts/ContractDetail";
import Receipt from "./features/payments/Receipt";
import CustomerList from "./features/customers/CustomerList";
import CustomerDetail from "./features/customers/CustomerDetail";
import ReportsHome from "./features/reports/ReportsHome";
import AgingReport from "./features/reports/AgingReport";
import CollectionsReport from "./features/reports/CollectionsReport";
import CustomerStatement from "./features/reports/CustomerStatement";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route element={<ProtectedRoute />}>
              {/* Receipt is intentionally outside AppLayout — no header/nav
                  chrome to hide in @media print (Receipt.tsx's own comment
                  explains the reasoning), still auth-gated by ProtectedRoute. */}
              <Route path="/payments/:id/receipt" element={<Receipt />} />

              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/contracts/new" element={<ContractWizard />} />
                <Route path="/contracts/:id" element={<ContractDetail />} />
                <Route path="/customers" element={<CustomerList />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/reports" element={<ReportsHome />} />
                <Route path="/reports/aging" element={<AgingReport />} />
                <Route path="/reports/collections" element={<CollectionsReport />} />
                <Route path="/reports/statement" element={<CustomerStatement />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
