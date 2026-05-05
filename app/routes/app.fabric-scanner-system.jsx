import { Link, Outlet, useLoaderData, useRouteError, useNavigation } from "@remix-run/react";
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
  const isLoading = navigation.state !== "idle";

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app/fabric-scanner-system/home" rel="home">Dashboard</Link>
        <Link to="/app/fabric-scanner-system/fabric">Swatch Item Inventory</Link>
        <Link to="/app/fabric-scanner-system/logs">Scan Logs</Link>
        <Link to="/app/fabric-scanner-system/settings">Staff & Settings</Link>
      </NavMenu>

      {isLoading && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(10, 14, 20, 0.82)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(2px)",
        }}>
          <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "#EFDFD0",
                  animation: "fsBounce 0.9s ease-in-out infinite",
                  animationDelay: `${i * 0.18}s`,
                  boxShadow: "0 0 18px rgba(239, 223, 208, 0.45)",
                }}
              />
            ))}
          </div>
          <style>{`
            @keyframes fsBounce {
              0%, 80%, 100% {
                transform: scale(0.7);
                opacity: 0.45;
              }
              40% {
                transform: scale(1.15);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}

      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
