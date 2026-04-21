import { Suspense, lazy, useCallback } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useCart, CartProvider } from "./cart";
import { useCheckout, CheckoutProvider } from "./checkout";

const Shop = lazy(() => import("./pages/Shop").then((m) => ({ default: m.Shop })));
const Done = lazy(() => import("./pages/Done").then((m) => ({ default: m.Done })));
const Feedback = lazy(() => import("./pages/Feedback").then((m) => ({ default: m.Feedback })));
const SupplyRequest = lazy(() => import("./pages/SupplyRequest").then((m) => ({ default: m.SupplyRequest })));
const SlotPreview = lazy(() => import("./pages/SlotPreview").then((m) => ({ default: m.SlotPreview })));

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin").then((m) => ({ default: m.AdminLogin })));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminItems = lazy(() => import("./pages/admin/AdminItems").then((m) => ({ default: m.AdminItems })));
const AdminBuyers = lazy(() => import("./pages/admin/AdminBuyers").then((m) => ({ default: m.AdminBuyers })));
const AdminHistory = lazy(() => import("./pages/admin/AdminHistory").then((m) => ({ default: m.AdminHistory })));
const AdminMonitor = lazy(() => import("./pages/admin/AdminMonitor").then((m) => ({ default: m.AdminMonitor })));
const AdminInventoryOps = lazy(() =>
  import("./pages/admin/AdminInventoryOps").then((m) => ({ default: m.AdminInventoryOps }))
);
const AdminOperationLogs = lazy(() =>
  import("./pages/admin/AdminOperationLogs").then((m) => ({ default: m.AdminOperationLogs }))
);
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings").then((m) => ({ default: m.AdminSettings })));
const AdminSupplyRequests = lazy(() =>
  import("./pages/admin/AdminSupplyRequests").then((m) => ({ default: m.AdminSupplyRequests }))
);
const AdminFeedback = lazy(() => import("./pages/admin/AdminFeedback").then((m) => ({ default: m.AdminFeedback })));

function AppRoutes() {
  const { clear: clearCart } = useCart();
  const { reset: resetCheckout } = useCheckout();
  const resetAll = useCallback(() => {
    clearCart();
    resetCheckout();
  }, [clearCart, resetCheckout]);

  return (
    <Suspense fallback={<div className="page">読み込み中...</div>}>
      <Routes>
        <Route path="/" element={<Shop onIdleReset={resetAll} />} />
        <Route path="/buyer" element={<Navigate to="/" replace />} />
        <Route path="/payment" element={<Navigate to="/" replace />} />
        <Route path="/done" element={<Done onIdleReset={resetAll} />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/supply-request" element={<SupplyRequest />} />
        <Route path="/slot-preview" element={<SlotPreview />} />

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
    </Suspense>
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
