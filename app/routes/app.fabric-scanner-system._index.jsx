import { boundary } from "@shopify/shopify-app-remix/server";
import { authenticate } from "../shopify.server";
import { getAppSettings } from "../models/settings.server";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Layout, Button, Text, Box } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getAppSettings(session.shop);
  return { settings };
};

export default function Index() {
  const { settings } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page title=" ">
      {/* Header — logo + title */}
      <Box
        padding="4"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1.5rem",
        }}
      >
        <Box
          style={{
            width: "96px",
            height: "96px",
            borderRadius: "999px",
            overflow: "hidden",
            boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
          }}
        >
          <img
            src="/app-logo.jpg"
            alt="Fabric Scanner logo"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Box>

        <Box>
          <Text variant="headingXl" as="h1">
            Fabric Scanner
          </Text>
          <Text variant="bodyLg" as="p" tone="subdued">
            Scan fabric orders effortlessly with your phone&apos;s camera — no external scanner needed.
          </Text>
        </Box>
      </Box>

      <Layout>
        <Layout.Section>
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "2.5rem",
              alignItems: "center",
              padding: "2rem 0",
            }}
          >
            {/* Portrait video column */}
            <Box
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1.5rem",
              }}
            >
              {/* Portrait phone-style frame */}
              <div
                style={{
                  width: "260px",
                  borderRadius: "28px",
                  overflow: "hidden",
                  boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
                  border: "3px solid #D8BFA4",
                  background: "#000",
                  aspectRatio: "9 / 16",
                  position: "relative",
                }}
              >
                <video
                  src="/Welcome-portrate-video.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  disableRemotePlayback
                  style={{
                    width: "115%",
                    height: "115%",
                    objectFit: "cover",
                    display: "block",
                    pointerEvents: "none",
                    position: "absolute",
                    top: "0",
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                />
                {/* Transparent overlay blocks all native browser video UI */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 1,
                    cursor: "default",
                  }}
                />
              </div>

              <Button variant="primary" size="large" onClick={() => navigate("/app/fabric-scanner-system/home")}>
                Get Started
              </Button>
            </Box>

            {/* How it works column */}
            <Box style={{ maxWidth: "560px", margin: "0 auto" }}>
              <Text variant="headingMd" as="h2" alignment="center">
                How it works
              </Text>
              <Box style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {[
                  {
                    step: "1",
                    title: "Open the scanner",
                    desc: "Navigate to the scanner screen and allow camera access.",
                  },
                  {
                    step: "2",
                    title: "Scan the barcode",
                    desc: "Hold your phone over the barcode and let the app capture it instantly.",
                  },
                  {
                    step: "3",
                    title: "Fulfill orders faster",
                    desc: "Generate shipping labels and mark items as fulfilled in seconds.",
                  },
                  {
                    step: "4",
                    title: "Start scanning now",
                    desc: "Open the staff scanner on your phone to begin fulfilling orders.",
                    action: true,
                  },
                ].map(({ step, title, desc, action }) => (
                  <div
                    key={step}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1rem",
                      padding: "1.25rem 1.5rem",
                      borderRadius: "14px",
                      background: action ? "#F1ECE5" : "#FAF7F3",
                      border: action ? "1px solid #C9A273" : "1px solid #EFDFD0",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: "#C9A273",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "800",
                        fontSize: "14px",
                        flexShrink: 0,
                      }}
                    >
                      {step}
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text as="p" variant="headingSm" fontWeight="semibold">
                        {title}
                      </Text>
                      <Text tone="subdued">{desc}</Text>
                      {action && (
                        <div style={{ marginTop: "10px" }}>
                          <Button
                            url="https://tovfurniture.com/pages/swatch-fabric-scanner"
                            external
                            target="_blank"
                            variant="primary"
                            size="slim"
                          >
                            Open Scanner Page
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </Box>
            </Box>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
