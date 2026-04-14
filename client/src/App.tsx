import { useCallback } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shop } from "./pages/Shop";
import { Done } from "./pages/Done";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminItems } from "./pages/admin/AdminItems";
import { AdminBuyers } from "./pages/admin/AdminBuyers";
import { AdminHistory } from "./pages/admin/AdminHistory";
import { AdminInventoryOps } from "./pages/admin/AdminInventoryOps";
import { AdminOperationLogs } from "./pages/admin/AdminOperationLogs";
import { AdminSettings } from "./pages/admin/AdminSettings";
import { AdminSupplyRequests } from "./pages/admin/AdminSupplyRequests";
import { AdminMonitor } from "./pages/admin/AdminMonitor";
import { AdminFeedback } from "./pages/admin/AdminFeedback";
import { SupplyRequest } from "./pages/SupplyRequest";
import { useCart, CartProvider } from "./cart";
import { useCheckout, CheckoutProvider } from "./checkout";

function AppRoutes() {
  const { clear: clearCart } = useCart();
  const { reset: resetCheckout } = useCheckout();
  const resetAll = useCallback(() => {
    clearCart();
    resetCheckout();
  }, [clearCart, resetCheckout]);

  return (
    <Routes>
      <Route path="/" element={<Shop onIdleReset={resetAll} />} />
      <Route path="/buyer" element={<Navigate to="/" replace />} />
      <Route path="/payment" element={<Navigate to="/" replace />} />
      <Route path="/done" element={<Done onIdleReset={resetAll} />} />
      <Route path="/supply-request" element={<SupplyRequest />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="items" replace />} />
        <Route path="items" element={<AdminItems />} />
        <Route path="buyers" element={<AdminBuyers />} />
        <Route path="history" element={<AdminHistory />} />
        <Route path="monitor" element={<AdminMonitor />} />
        <Route path="inventory-ops" element={<AdminInventoryOps />} />
        <Route path="operation-logs" element={<AdminOperationLogs />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="supply-requests" element={<AdminSupplyRequests />} />
        <Route path="feedback" element={<AdminFeedback />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <CheckoutProvider>
          <AppRoutes />
        </CheckoutProvider>
      </CartProvider>
    </BrowserRouter>
  );
}
