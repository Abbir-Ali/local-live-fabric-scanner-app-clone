import { Link, Outlet, useLoaderData, useRouteError, useNavigation, useLocation } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { getAppSettings } = await import("../models/settings.server");
  const settings = await getAppSettings(session.shop);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    settings
  };
};

export default function App() {
  const { apiKey, settings } = useLoaderData();
  const navigation = useNavigation();
  const location = useLocation();

  // Only show skeleton when navigating to a DIFFERENT page (not same-page search/filter)
  const isPageTransition = navigation.state === "loading" &&
    navigation.location?.pathname !== location.pathname;

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app/fabric-scanner-system/home" rel="home">Dashboard</Link>
        <Link to="/app/fabric-scanner-system/fabric">Swatch Item Inventory</Link>
        <Link to="/app/fabric-scanner-system/logs">Scan Logs</Link>
        <Link to="/app/fabric-scanner-system/settings">Staff & Settings</Link>
      </NavMenu>

      <style>{`
        @keyframes fsSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes fsPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Top progress bar — always shows during any navigation */}
      {navigation.state !== "idle" && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          zIndex: 99999,
          background: "#E3DDD6",
          overflow: "hidden",
          pointerEvents: "none",
        }}>
          <div style={{
            width: "40%",
            height: "100%",
            background: "linear-gradient(90deg, transparent, #C9A273, #EFDFD0, #C9A273, transparent)",
            borderRadius: "2px",
            animation: "fsSlide 1s ease-in-out infinite",
          }} />
        </div>
      )}

      {/* Skeleton placeholder during page transitions */}
      {isPageTransition ? <SkeletonPage /> : <Outlet />}
    </AppProvider>
  );
}

/**
 * SkeletonPage — shows page-specific placeholder content while a new page loads.
 * Detects the target route and renders a matching skeleton layout.
 */
function SkeletonPage() {
  const navigation = useNavigation();
  const targetPath = navigation.location?.pathname || "";

  if (targetPath.includes("/fabric")) return <SkeletonInventory />;
  if (targetPath.includes("/home")) return <SkeletonDashboard />;
  if (targetPath.includes("/logs")) return <SkeletonLogs />;
  if (targetPath.includes("/settings")) return <SkeletonSettings />;
  // Welcome/index page
  return <SkeletonWelcome />;
}

function SkeletonBlock({ width, height, radius, style }) {
  return (
    <div style={{
      width: width || "100%",
      height: height || "16px",
      borderRadius: radius || "6px",
      background: "linear-gradient(90deg, #F1ECE5 25%, #E8E0D6 50%, #F1ECE5 75%)",
      backgroundSize: "200% 100%",
      animation: "fsPulse 1.5s ease-in-out infinite",
      ...style,
    }} />
  );
}

/** Welcome page skeleton — logo + video frame + steps */
function SkeletonWelcome() {
  return (
    <div style={{ padding: "20px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "2rem" }}>
        <SkeletonBlock width="96px" height="96px" radius="50%" />
        <div>
          <SkeletonBlock width="200px" height="28px" style={{ marginBottom: "8px" }} />
          <SkeletonBlock width="380px" height="16px" />
        </div>
      </div>
      {/* Two column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5rem", alignItems: "center" }}>
        {/* Video frame */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          <SkeletonBlock width="260px" height="460px" radius="28px" />
          <SkeletonBlock width="120px" height="40px" radius="8px" />
        </div>
        {/* Steps */}
        <div>
          <SkeletonBlock width="120px" height="20px" style={{ margin: "0 auto 1.25rem" }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              display: "flex", gap: "1rem", padding: "1.25rem 1.5rem",
              borderRadius: "14px", background: "#FAF7F3", border: "1px solid #EFDFD0",
              marginBottom: "1rem",
            }}>
              <SkeletonBlock width="32px" height="32px" radius="50%" />
              <div style={{ flex: 1 }}>
                <SkeletonBlock width="140px" height="16px" style={{ marginBottom: "8px" }} />
                <SkeletonBlock width="90%" height="12px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Dashboard skeleton — 4 stat cards + 3 order sections */
function SkeletonDashboard() {
  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Title */}
      <SkeletonBlock width="140px" height="28px" style={{ marginBottom: "20px" }} />
      {/* 4 stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "16px" }}>
            <SkeletonBlock width="100px" height="12px" style={{ marginBottom: "12px" }} />
            <SkeletonBlock width="50px" height="32px" style={{ marginBottom: "8px" }} />
            <SkeletonBlock width="130px" height="11px" />
          </div>
        ))}
      </div>
      {/* Order sections */}
      {[0, 1, 2].map((section) => (
        <div key={section} style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <SkeletonBlock width="180px" height="18px" />
            <div style={{ display: "flex", gap: "8px" }}>
              <SkeletonBlock width="90px" height="32px" radius="6px" />
              <SkeletonBlock width="180px" height="32px" radius="6px" />
            </div>
          </div>
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 16px", borderRadius: "10px", background: "#FAF7F3",
              border: "1px solid #EFDFD0", marginBottom: "8px",
            }}>
              <SkeletonBlock width="20px" height="14px" />
              <SkeletonBlock width="70px" height="16px" />
              <SkeletonBlock width="70px" height="22px" radius="12px" />
              <SkeletonBlock width="140px" height="14px" style={{ flex: 1 }} />
              <SkeletonBlock width="80px" height="14px" />
              <SkeletonBlock width="16px" height="16px" />
            </div>
          ))}
          {/* Pagination */}
          <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
            <SkeletonBlock width="32px" height="32px" radius="6px" />
            <SkeletonBlock width="32px" height="32px" radius="6px" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Inventory page skeleton — stats row + table with images */
function SkeletonInventory() {
  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Title + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <SkeletonBlock width="240px" height="28px" />
        <div style={{ display: "flex", gap: "8px" }}>
          <SkeletonBlock width="130px" height="36px" radius="8px" />
          <SkeletonBlock width="140px" height="36px" radius="8px" />
          <SkeletonBlock width="160px" height="36px" radius="8px" />
        </div>
      </div>
      {/* Bin locations bar */}
      <SkeletonBlock width="100%" height="40px" radius="8px" style={{ marginBottom: "16px" }} />
      {/* Stats + location grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <div style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px" }}>
          <SkeletonBlock width="140px" height="16px" style={{ marginBottom: "16px" }} />
          <div style={{ display: "flex", gap: "40px" }}>
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <SkeletonBlock width="70px" height="11px" style={{ marginBottom: "8px" }} />
                <SkeletonBlock width="40px" height="28px" />
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px" }}>
          <SkeletonBlock width="110px" height="16px" style={{ marginBottom: "12px" }} />
          <SkeletonBlock width="100%" height="36px" radius="6px" style={{ marginBottom: "8px" }} />
          <SkeletonBlock width="200px" height="11px" />
        </div>
      </div>
      {/* Table */}
      <div style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", overflow: "hidden" }}>
        {/* Search/filter bar */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #E3DDD6" }}>
          <SkeletonBlock width="100%" height="36px" />
        </div>
        {/* Table header */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #E3DDD6", display: "flex", gap: "24px" }}>
          {["30px", "50px", "120px", "80px", "90px", "120px"].map((w, i) => (
            <SkeletonBlock key={i} width={w} height="13px" />
          ))}
        </div>
        {/* Table rows */}
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} style={{
            padding: "14px 16px", borderBottom: "1px solid #F1ECE5",
            display: "flex", alignItems: "center", gap: "20px",
          }}>
            <SkeletonBlock width="24px" height="14px" />
            <SkeletonBlock width="64px" height="64px" radius="8px" />
            <div style={{ flex: 1 }}>
              <SkeletonBlock width="60%" height="14px" style={{ marginBottom: "8px" }} />
              <div style={{ display: "flex", gap: "8px" }}>
                <SkeletonBlock width="100px" height="20px" radius="12px" />
                <SkeletonBlock width="80px" height="14px" />
              </div>
            </div>
            <SkeletonBlock width="55px" height="24px" radius="12px" />
            <SkeletonBlock width="80px" height="28px" radius="6px" />
            <SkeletonBlock width="90px" height="35px" radius="4px" />
          </div>
        ))}
        {/* Pagination */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #E3DDD6", display: "flex", justifyContent: "space-between" }}>
          <SkeletonBlock width="100px" height="32px" radius="6px" />
          <div style={{ display: "flex", gap: "6px" }}>
            <SkeletonBlock width="32px" height="32px" radius="6px" />
            <SkeletonBlock width="32px" height="32px" radius="6px" />
          </div>
          <div style={{ width: "100px" }} />
        </div>
      </div>
    </div>
  );
}

/** Logs page skeleton — search + table */
function SkeletonLogs() {
  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <SkeletonBlock width="120px" height="28px" style={{ marginBottom: "20px" }} />
      <div style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", overflow: "hidden" }}>
        {/* Search bar */}
        <div style={{ padding: "16px", display: "flex", gap: "12px", borderBottom: "1px solid #E3DDD6" }}>
          <SkeletonBlock width="100%" height="36px" radius="6px" />
          <SkeletonBlock width="80px" height="36px" radius="6px" />
        </div>
        {/* Table header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #E3DDD6", display: "flex", gap: "24px" }}>
          {["24px", "140px", "180px", "100px", "120px", "160px"].map((w, i) => (
            <SkeletonBlock key={i} width={w} height="13px" />
          ))}
        </div>
        {/* Table rows */}
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} style={{
            padding: "16px", borderBottom: "1px solid #F1ECE5",
            display: "flex", alignItems: "center", gap: "24px",
          }}>
            <SkeletonBlock width="16px" height="14px" />
            <SkeletonBlock width="140px" height="14px" />
            <SkeletonBlock width="180px" height="14px" />
            <SkeletonBlock width="90px" height="24px" radius="12px" />
            <div>
              <SkeletonBlock width="80px" height="14px" style={{ marginBottom: "4px" }} />
              <SkeletonBlock width="160px" height="12px" />
            </div>
            <SkeletonBlock width="140px" height="14px" />
          </div>
        ))}
        {/* Pagination */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #E3DDD6", display: "flex", justifyContent: "center", gap: "8px" }}>
          <SkeletonBlock width="32px" height="32px" radius="6px" />
          <SkeletonBlock width="80px" height="32px" radius="6px" />
          <SkeletonBlock width="32px" height="32px" radius="6px" />
        </div>
      </div>
    </div>
  );
}

/** Settings page skeleton — tabs + staff table + admin form */
function SkeletonSettings() {
  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <SkeletonBlock width="220px" height="28px" style={{ marginBottom: "20px" }} />
      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
        <SkeletonBlock width="110px" height="34px" radius="6px" />
        <SkeletonBlock width="100px" height="34px" radius="6px" />
        <SkeletonBlock width="130px" height="34px" radius="6px" />
      </div>
      {/* Staff Members card */}
      <div style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <SkeletonBlock width="130px" height="18px" />
          <SkeletonBlock width="90px" height="34px" radius="6px" />
        </div>
        <SkeletonBlock width="300px" height="13px" style={{ marginBottom: "16px" }} />
        {/* Table header */}
        <div style={{ display: "flex", gap: "24px", padding: "10px 0", borderBottom: "1px solid #E3DDD6", marginBottom: "8px" }}>
          {["80px", "200px", "60px", "60px"].map((w, i) => (
            <SkeletonBlock key={i} width={w} height="13px" />
          ))}
        </div>
        {/* Staff rows */}
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} style={{ display: "flex", alignItems: "center", gap: "24px", padding: "12px 0", borderBottom: "1px solid #F1ECE5" }}>
            <SkeletonBlock width="80px" height="14px" />
            <SkeletonBlock width="200px" height="14px" />
            <SkeletonBlock width="50px" height="14px" />
            <div style={{ display: "flex", gap: "8px" }}>
              <SkeletonBlock width="24px" height="24px" radius="4px" />
              <SkeletonBlock width="24px" height="24px" radius="4px" />
            </div>
          </div>
        ))}
      </div>
      {/* Admin Credentials card */}
      <div style={{ background: "#FFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px" }}>
        <SkeletonBlock width="190px" height="18px" style={{ marginBottom: "8px" }} />
        <SkeletonBlock width="280px" height="13px" style={{ marginBottom: "20px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <SkeletonBlock width="80px" height="12px" style={{ marginBottom: "6px" }} />
            <SkeletonBlock width="100%" height="36px" radius="6px" />
          </div>
          <div>
            <SkeletonBlock width="70px" height="12px" style={{ marginBottom: "6px" }} />
            <SkeletonBlock width="100%" height="36px" radius="6px" />
          </div>
        </div>
        <SkeletonBlock width="170px" height="36px" radius="6px" />
      </div>
    </div>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
