import { useLoaderData, useNavigate, useSearchParams, useRevalidator, useNavigation } from "@remix-run/react";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getFabricOrders, getFulfilledFabricOrders, getPartiallyFulfilledOrders, getFulfilledOrdersCount, getPendingOrdersCount, getPartialOrdersCount } from "../services/order.server";
import BarcodeImage from "../components/BarcodeImage";

// Components
import { Page, Layout, Card, BlockStack, Text, InlineGrid, Collapsible, Button, Badge, InlineStack, Thumbnail, Icon, TextField, Select } from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon, PersonIcon, ViewIcon } from "@shopify/polaris-icons";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { getDashboardStats, getLogsForOrder } = await import("../models/logs.server");
  const { getAppSettings } = await import("../models/settings.server");
  const { default: shopify } = await import("../shopify.server");
  const url = new URL(request.url);

  // Only register webhooks on initial page load, not on every auto-refresh or pagination
  const isInitialLoad = !url.searchParams.has("pendingCursor") && !url.searchParams.has("partialCursor") && !url.searchParams.has("fulfilledCursor") && !url.searchParams.has("pendingPage") && !url.searchParams.has("partialPage") && !url.searchParams.has("fulfilledPage");
  if (isInitialLoad) {
    try {
      await shopify.registerWebhooks({ session });
    } catch (e) {
      console.error("Webhook Registration Error:", e);
    }
  }

  const pendingCursor = url.searchParams.get("pendingCursor");
  const pendingDir = url.searchParams.get("pendingDir") || "next";
  const pendingSearch = url.searchParams.get("pendingSearch") || "";
  const pendingLimit = parseInt(url.searchParams.get("pendingLimit") || "5");

  const partialCursor = url.searchParams.get("partialCursor");
  const partialDir = url.searchParams.get("partialDir") || "next";
  const partialSearch = url.searchParams.get("partialSearch") || "";
  const partialLimit = parseInt(url.searchParams.get("partialLimit") || "5");

  const fulfilledCursor = url.searchParams.get("fulfilledCursor");
  const fulfilledDir = url.searchParams.get("fulfilledDir") || "next";
  const fulfilledSearch = url.searchParams.get("fulfilledSearch") || "";
  const fulfilledLimit = parseInt(url.searchParams.get("fulfilledLimit") || "5");

  const [pendingData, partialData, fulfilledData, stats, liveFulfilledCount, livePendingCount, livePartialCount, settings] = await Promise.all([
    getFabricOrders(admin, pendingCursor, pendingDir, pendingSearch, pendingLimit),
    getPartiallyFulfilledOrders(admin, partialCursor, partialDir, partialSearch, partialLimit),
    getFulfilledFabricOrders(admin, fulfilledCursor, fulfilledDir, fulfilledSearch, fulfilledLimit),
    getDashboardStats(session.shop),
    getFulfilledOrdersCount(admin),
    getPendingOrdersCount(admin),
    getPartialOrdersCount(admin),
    getAppSettings(session.shop)
  ]);

  const partialWithLogs = await Promise.all(partialData.edges.map(async (edge) => {
    const logs = await getLogsForOrder(session.shop, edge.node.id);
    return { ...edge, logs: logs || [] };
  }));

  const fulfilledWithLogs = await Promise.all(fulfilledData.edges.map(async (edge) => {
    const logs = await getLogsForOrder(session.shop, edge.node.id);
    return { ...edge, logs: logs || [] };
  }));

  return {
    swatchOrders: pendingData.edges,
    pendingPageInfo: pendingData.pageInfo,
    pendingSearch,
    pendingLimit,
    partialOrders: partialWithLogs,
    partialPageInfo: partialData.pageInfo,
    partialSearch,
    partialLimit,
    fulfilledOrders: fulfilledWithLogs,
    fulfilledPageInfo: fulfilledData.pageInfo,
    fulfilledSearch,
    fulfilledLimit,
    stats: {
      ...stats,
      totalFulfilled: liveFulfilledCount,
      totalPending: livePendingCount,
      totalPartial: livePartialCount
    },
    settings,
    shopDomain: session.shop.replace('.myshopify.com', '')
  };
};

export default function Index() {
  const { swatchOrders, partialOrders, fulfilledOrders, stats, pendingPageInfo, partialPageInfo, fulfilledPageInfo, settings, shopDomain, pendingSearch: initialPendingSearch = "", partialSearch: initialPartialSearch = "", fulfilledSearch: initialFulfilledSearch = "", pendingLimit: initialPendingLimit = 5, partialLimit: initialPartialLimit = 5, fulfilledLimit: initialFulfilledLimit = 5 } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const navigation = useNavigation();

  // Per-section loading — determine which section triggered the navigation
  const isNavigating = navigation.state === "loading";
  const nextParams = new URLSearchParams(navigation.location?.search || "");
  const isPendingLoading = isNavigating && (
    nextParams.has("pendingCursor") || nextParams.has("pendingDir") || nextParams.has("pendingSearch") || nextParams.has("pendingLimit")
  );
  const isPartialLoading = isNavigating && (
    nextParams.has("partialCursor") || nextParams.has("partialDir") || nextParams.has("partialSearch") || nextParams.has("partialLimit")
  );
  const isFulfilledLoading = isNavigating && (
    nextParams.has("fulfilledCursor") || nextParams.has("fulfilledDir") || nextParams.has("fulfilledSearch") || nextParams.has("fulfilledLimit")
  );
  // If none of the specific sections triggered it (e.g. auto-refresh), don't show loader overlay
  const isLoading = isNavigating;

  // Debug logging
  console.log('[DASHBOARD] Loaded data:', {
    swatchOrdersCount: swatchOrders?.length || 0,
    partialOrdersCount: partialOrders?.length || 0,
    fulfilledOrdersCount: fulfilledOrders?.length || 0,
    stats
  });

  // Search state for each tab
  const [pendingSearchValue, setPendingSearchValue] = useState(initialPendingSearch);
  const [partialSearchValue, setPartialSearchValue] = useState(initialPartialSearch);
  const [fulfilledSearchValue, setFulfilledSearchValue] = useState(initialFulfilledSearch);

  // Page size state for each tab
  const [pendingPageSize, setPendingPageSize] = useState(String(initialPendingLimit));
  const [partialPageSize, setPartialPageSize] = useState(String(initialPartialLimit));
  const [fulfilledPageSize, setFulfilledPageSize] = useState(String(initialFulfilledLimit));

  const pageSizeOptions = [
    { label: '5 per page', value: '5' },
    { label: '10 per page', value: '10' },
    { label: '25 per page', value: '25' },
    { label: '50 per page', value: '50' },
  ];

  // Auto-refresh the dashboard every 5 seconds to keep it sync with scanner activity
  useEffect(() => {
    const interval = setInterval(() => {
      // Only revalidate if the tab is visible and the app is not currently performing another navigation
      if (document.visibilityState === "visible" && revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [revalidator]);

  // Search handlers with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (pendingSearchValue !== initialPendingSearch) {
        const params = new URLSearchParams(searchParams);
        if (pendingSearchValue) {
          params.set("pendingSearch", pendingSearchValue);
        } else {
          params.delete("pendingSearch");
        }
        params.delete("pendingCursor");
        params.delete("pendingPage");
        navigate(`?${params.toString()}`, { replace: true, preventScrollReset: true });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [pendingSearchValue, initialPendingSearch, searchParams, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (partialSearchValue !== initialPartialSearch) {
        const params = new URLSearchParams(searchParams);
        if (partialSearchValue) {
          params.set("partialSearch", partialSearchValue);
        } else {
          params.delete("partialSearch");
        }
        params.delete("partialCursor");
        params.delete("partialPage");
        navigate(`?${params.toString()}`, { replace: true, preventScrollReset: true });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [partialSearchValue, initialPartialSearch, searchParams, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fulfilledSearchValue !== initialFulfilledSearch) {
        const params = new URLSearchParams(searchParams);
        if (fulfilledSearchValue) {
          params.set("fulfilledSearch", fulfilledSearchValue);
        } else {
          params.delete("fulfilledSearch");
        }
        params.delete("fulfilledCursor");
        params.delete("fulfilledPage");
        navigate(`?${params.toString()}`, { replace: true, preventScrollReset: true });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [fulfilledSearchValue, initialFulfilledSearch, searchParams, navigate]);

  // Page size change handlers
  const handlePendingPageSizeChange = (value) => {
    setPendingPageSize(value);
    const params = new URLSearchParams(searchParams);
    params.set("pendingLimit", value);
    params.delete("pendingCursor");
    params.delete("pendingPage");
    navigate(`?${params.toString()}`, { preventScrollReset: true });
  };

  const handlePartialPageSizeChange = (value) => {
    setPartialPageSize(value);
    const params = new URLSearchParams(searchParams);
    params.set("partialLimit", value);
    params.delete("partialCursor");
    params.delete("partialPage");
    navigate(`?${params.toString()}`, { preventScrollReset: true });
  };

  const handleFulfilledPageSizeChange = (value) => {
    setFulfilledPageSize(value);
    const params = new URLSearchParams(searchParams);
    params.set("fulfilledLimit", value);
    params.delete("fulfilledCursor");
    params.delete("fulfilledPage");
    navigate(`?${params.toString()}`, { preventScrollReset: true });
  };

  const handlePendingNext = () => {
    if (pendingPageInfo?.hasNextPage) {
      const newParams = new URLSearchParams(searchParams);
      const currentPage = parseInt(searchParams.get("pendingPage") || "1");
      newParams.set("pendingCursor", pendingPageInfo.endCursor);
      newParams.set("pendingPage", (currentPage + 1).toString());
      newParams.set("pendingDir", "next");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    }
  };

  const handlePendingPrev = () => {
    if (pendingPageInfo?.hasPreviousPage) {
      const newParams = new URLSearchParams(searchParams);
      const currentPage = parseInt(searchParams.get("pendingPage") || "1");
      newParams.set("pendingCursor", pendingPageInfo.startCursor);
      newParams.set("pendingPage", (currentPage - 1).toString());
      newParams.set("pendingDir", "prev");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    } else {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("pendingCursor");
      newParams.delete("pendingPage");
      newParams.delete("pendingDir");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    }
  };

  const handleFulfilledNext = () => {
    if (fulfilledPageInfo?.hasNextPage) {
      const newParams = new URLSearchParams(searchParams);
      const currentPage = parseInt(searchParams.get("fulfilledPage") || "1");
      newParams.set("fulfilledCursor", fulfilledPageInfo.endCursor);
      newParams.set("fulfilledPage", (currentPage + 1).toString());
      newParams.set("fulfilledDir", "next");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    }
  };

  const handleFulfilledPrev = () => {
    if (fulfilledPageInfo?.hasPreviousPage) {
      const newParams = new URLSearchParams(searchParams);
      const currentPage = parseInt(searchParams.get("fulfilledPage") || "1");
      newParams.set("fulfilledCursor", fulfilledPageInfo.startCursor);
      newParams.set("fulfilledPage", (currentPage - 1).toString());
      newParams.set("fulfilledDir", "prev");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    } else {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("fulfilledCursor");
      newParams.delete("fulfilledPage");
      newParams.delete("fulfilledDir");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    }
  };

  const handlePartialNext = () => {
    if (partialPageInfo?.hasNextPage) {
      const newParams = new URLSearchParams(searchParams);
      const currentPage = parseInt(searchParams.get("partialPage") || "1");
      newParams.set("partialCursor", partialPageInfo.endCursor);
      newParams.set("partialPage", (currentPage + 1).toString());
      newParams.set("partialDir", "next");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    }
  };

  const handlePartialPrev = () => {
    if (partialPageInfo?.hasPreviousPage) {
      const newParams = new URLSearchParams(searchParams);
      const currentPage = parseInt(searchParams.get("partialPage") || "1");
      newParams.set("partialCursor", partialPageInfo.startCursor);
      newParams.set("partialPage", (currentPage - 1).toString());
      newParams.set("partialDir", "prev");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    } else {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("partialCursor");
      newParams.delete("partialPage");
      newParams.delete("partialDir");
      navigate(`?${newParams.toString()}`, { preventScrollReset: true });
    }
  };

  return (
    <Page title="Dashboard">
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={4} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Total Scans Today</Text>
                <Text variant="heading2xl" as="p">{stats.scansToday}</Text>
                <Text tone="subdued" variant="bodySm">Collective scans from all staff</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Pending Orders</Text>
                <Text variant="heading2xl" as="p">{stats.totalPending || 0}</Text>
                <Text tone="subdued" variant="bodySm">Orders awaiting fulfillment</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Partially Fulfilled</Text>
                <Text variant="heading2xl" as="p" tone="warning">{stats.totalPartial || 0}</Text>
                <Text tone="subdued" variant="bodySm">Orders with items remaining</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Total Fulfilled</Text>
                <Text variant="heading2xl" as="p">{stats.totalFulfilled}</Text>
                <Text tone="subdued" variant="bodySm">Lifetime fulfilled via scanner</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <Text variant="headingMd" as="h2">Pending Swatch Orders</Text>
                <InlineStack gap="200" wrap={false}>
                  <div style={{ width: '140px' }}>
                    <Select
                      label=""
                      labelHidden
                      options={pageSizeOptions}
                      value={pendingPageSize}
                      onChange={handlePendingPageSizeChange}
                      disabled={isLoading}
                    />
                  </div>
                  <div style={{ width: '300px' }}>
                    <TextField
                      placeholder="Search by order #, name, email, note..."
                      value={pendingSearchValue}
                      onChange={setPendingSearchValue}
                      clearButton
                      onClearButtonClick={() => setPendingSearchValue("")}
                      autoComplete="off"
                      disabled={isLoading}
                    />
                  </div>
                </InlineStack>
              </InlineStack>
              <div style={{ position: 'relative', minHeight: '200px' }}>
                {isPendingLoading && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(3px)',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '16px',
                    borderRadius: 'var(--p-border-radius-200)',
                    pointerEvents: 'all',
                    cursor: 'wait',
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      border: '4px solid #E3E3E3',
                      borderTop: '4px solid #C9A273',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <Text variant="bodyMd" tone="subdued" fontWeight="semibold">
                      {pendingSearchValue ? 'Searching...' : 'Loading orders...'}
                    </Text>
                  </div>
                )}
                {swatchOrders.length === 0 ? (
                  <Text tone="subdued">{pendingSearchValue ? "No orders found matching your search." : "No pending orders."}</Text>
                ) : (
                  <BlockStack gap="400">
                    {swatchOrders.map(({ node: order }, idx) => (
                      <OrderRow key={order.id} order={order} status="pending" index={(parseInt(searchParams.get("pendingPage") || "1") - 1) * parseInt(pendingPageSize) + idx + 1} shopDomain={shopDomain} />
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #E3DDD6', background: '#FAFAFA', borderRadius: '0 0 8px 8px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#999', letterSpacing: '0.3px' }}>
                        PAGE {searchParams.get("pendingPage") || "1"} · {pendingPageSize} PER PAGE
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={handlePendingPrev} disabled={!pendingPageInfo?.hasPreviousPage || isPendingLoading} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E3DDD6', background: '#FFFFFF', cursor: !pendingPageInfo?.hasPreviousPage ? 'not-allowed' : 'pointer', opacity: !pendingPageInfo?.hasPreviousPage ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#333' }}>‹</button>
                        <button onClick={handlePendingNext} disabled={!pendingPageInfo?.hasNextPage || isPendingLoading} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E3DDD6', background: '#FFFFFF', cursor: !pendingPageInfo?.hasNextPage ? 'not-allowed' : 'pointer', opacity: !pendingPageInfo?.hasNextPage ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#333' }}>›</button>
                      </div>
                    </div>
                  </BlockStack>
                )}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <Text variant="headingMd" as="h2">Partially Fulfilled Orders</Text>
                <InlineStack gap="200" wrap={false}>
                  <div style={{ width: '140px' }}>
                    <Select
                      label=""
                      labelHidden
                      options={pageSizeOptions}
                      value={partialPageSize}
                      onChange={handlePartialPageSizeChange}
                      disabled={isLoading}
                    />
                  </div>
                  <div style={{ width: '300px' }}>
                    <TextField
                      placeholder="Search by order #, name, email, note..."
                      value={partialSearchValue}
                      onChange={setPartialSearchValue}
                      clearButton
                      onClearButtonClick={() => setPartialSearchValue("")}
                      autoComplete="off"
                      disabled={isLoading}
                    />
                  </div>
                </InlineStack>
              </InlineStack>
              <div style={{ position: 'relative', minHeight: '200px' }}>
                {isPartialLoading && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(3px)',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '16px',
                    borderRadius: 'var(--p-border-radius-200)',
                    pointerEvents: 'all',
                    cursor: 'wait',
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      border: '4px solid #E3E3E3',
                      borderTop: '4px solid #C9A273',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <Text variant="bodyMd" tone="subdued" fontWeight="semibold">
                      {partialSearchValue ? 'Searching...' : 'Loading orders...'}
                    </Text>
                  </div>
                )}
                {partialOrders.length === 0 ? (
                  <Text tone="subdued">{partialSearchValue ? "No orders found matching your search." : "No partially fulfilled orders."}</Text>
                ) : (
                  <BlockStack gap="400">
                    {partialOrders.map(({ node: order, logs }, idx) => (
                      <PartialOrderRow
                        key={order.id}
                        order={order}
                        logs={logs}
                        index={(parseInt(searchParams.get("partialPage") || "1") - 1) * parseInt(partialPageSize) + idx + 1}
                        shopDomain={shopDomain}
                      />
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #E3DDD6', background: '#FAFAFA', borderRadius: '0 0 8px 8px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#999', letterSpacing: '0.3px' }}>
                        PAGE {searchParams.get("partialPage") || "1"} · {partialPageSize} PER PAGE
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={handlePartialPrev} disabled={!partialPageInfo?.hasPreviousPage || isPartialLoading} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E3DDD6', background: '#FFFFFF', cursor: !partialPageInfo?.hasPreviousPage ? 'not-allowed' : 'pointer', opacity: !partialPageInfo?.hasPreviousPage ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#333' }}>‹</button>
                        <button onClick={handlePartialNext} disabled={!partialPageInfo?.hasNextPage || isPartialLoading} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E3DDD6', background: '#FFFFFF', cursor: !partialPageInfo?.hasNextPage ? 'not-allowed' : 'pointer', opacity: !partialPageInfo?.hasNextPage ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#333' }}>›</button>
                      </div>
                    </div>
                  </BlockStack>
                )}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <Text variant="headingMd" as="h2">Fulfilled History</Text>
                <InlineStack gap="200" wrap={false}>
                  <div style={{ width: '140px' }}>
                    <Select
                      label=""
                      labelHidden
                      options={pageSizeOptions}
                      value={fulfilledPageSize}
                      onChange={handleFulfilledPageSizeChange}
                      disabled={isLoading}
                    />
                  </div>
                  <div style={{ width: '300px' }}>
                    <TextField
                      placeholder="Search by order #, name, email, note..."
                      value={fulfilledSearchValue}
                      onChange={setFulfilledSearchValue}
                      clearButton
                      onClearButtonClick={() => setFulfilledSearchValue("")}
                      autoComplete="off"
                      disabled={isLoading}
                    />
                  </div>
                </InlineStack>
              </InlineStack>
              <div style={{ position: 'relative', minHeight: '200px' }}>
                {isFulfilledLoading && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(3px)',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '16px',
                    borderRadius: 'var(--p-border-radius-200)',
                    pointerEvents: 'all',
                    cursor: 'wait',
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      border: '4px solid #E3E3E3',
                      borderTop: '4px solid #C9A273',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <Text variant="bodyMd" tone="subdued" fontWeight="semibold">
                      {fulfilledSearchValue ? 'Searching...' : 'Loading orders...'}
                    </Text>
                  </div>
                )}
                {fulfilledOrders.length === 0 ? (
                  <Text tone="subdued">{fulfilledSearchValue ? "No orders found matching your search." : "No fulfilled orders found."}</Text>
                ) : (
                  <BlockStack gap="400">
                    {fulfilledOrders.map((edge, idx) => (
                      <OrderRow
                        key={edge.node.id}
                        order={edge.node}
                        status="fulfilled"
                        logs={edge.logs}
                        index={(parseInt(searchParams.get("fulfilledPage") || "1") - 1) * parseInt(fulfilledPageSize) + idx + 1}
                        shopDomain={shopDomain}
                      />
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #E3DDD6', background: '#FAFAFA', borderRadius: '0 0 8px 8px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#999', letterSpacing: '0.3px' }}>
                        PAGE {searchParams.get("fulfilledPage") || "1"} · {fulfilledPageSize} PER PAGE
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={handleFulfilledPrev} disabled={!fulfilledPageInfo?.hasPreviousPage || isFulfilledLoading} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E3DDD6', background: '#FFFFFF', cursor: !fulfilledPageInfo?.hasPreviousPage ? 'not-allowed' : 'pointer', opacity: !fulfilledPageInfo?.hasPreviousPage ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#333' }}>‹</button>
                        <button onClick={handleFulfilledNext} disabled={!fulfilledPageInfo?.hasNextPage || isFulfilledLoading} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E3DDD6', background: '#FFFFFF', cursor: !fulfilledPageInfo?.hasNextPage ? 'not-allowed' : 'pointer', opacity: !fulfilledPageInfo?.hasNextPage ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#333' }}>›</button>
                      </div>
                    </div>
                  </BlockStack>
                )}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function PartialOrderRow({ order, logs, index, shopDomain }) {
  const [open, setOpen] = useState(false);

  const fabricItems = order.lineItems.edges.filter(
    i => i.node.variant?.product?.productType?.toLowerCase() === "swatch item"
  );

  // Calculate fulfillment progress using fulfillmentOrders data
  // lineItem.fulfillmentStatus might not be reliable, so we check fulfillmentOrders
  const fulfilledLineItemIds = new Set();
  const unfulfilledLineItemIds = new Set();

  // Check fulfillmentOrders to see which items are fulfilled
  if (order.fulfillmentOrders?.edges) {
    order.fulfillmentOrders.edges.forEach(foEdge => {
      const fo = foEdge.node;
      if (fo.lineItems?.edges) {
        fo.lineItems.edges.forEach(foLineEdge => {
          const foLineItem = foLineEdge.node;
          const lineItemId = foLineItem.lineItem.id;
          const remainingQty = foLineItem.remainingQuantity || 0;
          const totalQty = foLineItem.totalQuantity || 0;

          // If remaining quantity is 0, the item is fully fulfilled
          if (remainingQty === 0 && totalQty > 0) {
            fulfilledLineItemIds.add(lineItemId);
            // Remove from unfulfilled if it was there (due to split FOs)
            unfulfilledLineItemIds.delete(lineItemId);
          } else if (remainingQty > 0 && !fulfilledLineItemIds.has(lineItemId)) {
            // Only add to unfulfilled if not already marked as fulfilled
            unfulfilledLineItemIds.add(lineItemId);
          }
        });
      }
    });
  }

  const fulfilledItems = fabricItems.filter(i => fulfilledLineItemIds.has(i.node.id));
  const unfulfilledItems = fabricItems.filter(i => unfulfilledLineItemIds.has(i.node.id));
  const progress = `${fulfilledItems.length}/${fabricItems.length}`;

  // Helper to find which staff member scanned a specific item
  const getStaffForItem = (lineItemId) => {
    if (!logs || logs.length === 0) return null;

    // Look through logs for one that contains this item ID in its details metadata
    const itemLog = logs.find(l => {
      // Regex to match [ITEMS:id1,id2]
      const match = l.details?.match(/\[ITEMS:(.*?)\]/);
      if (match && match[1]) {
        const itemIds = match[1].split(',');
        return itemIds.includes(lineItemId);
      }
      return false;
    });

    return itemLog ? itemLog.scannedBy : null;
  };

  // Find the primary log (the most recent one) for the header summary
  const primaryLog = logs?.[0];

  if (fabricItems.length === 0) return null;

  const orderId = order.id.split('/').pop(); // Extract ID from GID
  const orderUrl = `https://admin.shopify.com/store/${shopDomain}/orders/${orderId}`;

  return (
    <div style={{ border: '2px solid #C9A273', borderRadius: '8px', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '12px 16px',
          background: '#FAEBE1',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        }}
      >
        <InlineStack gap="400" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyMd" fontWeight="bold" tone="subdued" as="span">{index}.</Text>
          <Text variant="bodyMd" fontWeight="bold" as="span">{order.name}</Text>
          <Badge tone="warning">PARTIALLY FULFILLED</Badge>
          <Badge tone="info">{progress} items shipped</Badge>
          {order.note && <Text variant="bodySm" tone="subdued" as="span">📝 {order.note}</Text>}
          <Text tone="subdued" as="span" style={{ whiteSpace: 'nowrap' }}>{new Date(order.updatedAt || order.createdAt).toLocaleString()}</Text>
        </InlineStack>

        <InlineStack gap="400" blockAlign="center" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button
            icon={ViewIcon}
            variant="plain"
            onClick={(e) => { e.stopPropagation(); window.open(orderUrl, '_blank'); }}
            accessibilityLabel="View order"
          >
            View Order
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <Icon source={PersonIcon} tone="subdued" />
            <Text variant="bodySm" tone="subdued">
              {primaryLog?.scannedBy || primaryLog?.staffEmail || "Unknown"}
            </Text>
          </div>
          <Button icon={open ? ChevronUpIcon : ChevronDownIcon} variant="plain" />
        </InlineStack>
      </div>

      <Collapsible open={open} id={`collapse-${order.id}`}>
        <div style={{ padding: '16px', background: '#fff' }}>
          <BlockStack gap="400">
            <Text variant="headingSm" as="h4">Fulfilled Items ({fulfilledItems.length})</Text>
            {fulfilledItems.map(({ node: item }, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 2fr 1fr 2fr', alignItems: 'center', gap: '20px', padding: '8px', background: '#F1ECE5', borderRadius: '4px' }}>
                 <Thumbnail source={item.variant?.product?.featuredImage?.url || ""} alt={item.title} size="small" />
                <div>
                  <Text variant="bodyMd" fontWeight="bold">{item.title}</Text>
                  <Text variant="bodySm" tone="subdued">SKU: {item.sku || 'N/A'}</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Badge tone="success">✓ Shipped</Badge>
                  {getStaffForItem(item.id) && (
                    <div style={{ marginTop: '4px' }}>
                      <Text variant="bodyXs" tone="subdued">By: {getStaffForItem(item.id)}</Text>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <BarcodeImage value={item.variant?.barcode} />
                </div>
              </div>
            ))}

            <Text variant="headingSm" as="h4" tone="critical">Unfulfilled Items ({unfulfilledItems.length})</Text>
            {unfulfilledItems.map(({ node: item }, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 2fr 1fr 2fr', alignItems: 'center', gap: '20px', padding: '8px', background: '#FAF7F3', borderRadius: '4px' }}>
                <Thumbnail source={item.variant?.product?.featuredImage?.url || ""} alt={item.title} size="small" />
                <div>
                  <Text variant="bodyMd" fontWeight="bold">{item.title}</Text>
                  <Text variant="bodySm" tone="subdued">SKU: {item.sku || 'N/A'}</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Badge tone="attention">Pending</Badge>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <BarcodeImage value={item.variant?.barcode} />
                </div>
              </div>
            ))}
          </BlockStack>
        </div>
      </Collapsible>
    </div>
  );
}

function OrderRow({ order, status, logs, index, shopDomain }) {
  const [open, setOpen] = useState(false);

  const fabricItems = order.lineItems.edges.filter(
    i => (status === 'fulfilled' || i.node.variant?.product?.productType?.toLowerCase() === "swatch item")
  );

  if (fabricItems.length === 0) return null;

  // Helper to find which staff member scanned a specific item
  const getStaffForItem = (lineItemId) => {
    if (!logs || logs.length === 0) return null;
    const itemLog = logs.find(l => {
      const match = l.details?.match(/\[ITEMS:(.*?)\]/);
      if (match && match[1]) {
        const itemIds = match[1].split(',');
        return itemIds.includes(lineItemId);
      }
      return false;
    });
    return itemLog ? itemLog.scannedBy : null;
  };

  const primaryLog = logs?.[0];

  const orderId = order.id.split('/').pop(); // Extract ID from GID
  const orderUrl = `https://admin.shopify.com/store/${shopDomain}/orders/${orderId}`;

  return (
    <div style={{ border: '1px solid #D8BFA4', borderRadius: '8px', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '12px 16px',
          background: '#FAF7F3',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        }}
      >
        <InlineStack gap="400" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyMd" fontWeight="bold" tone="subdued" as="span">{index}.</Text>
          <Text variant="bodyMd" fontWeight="bold" as="span">{order.name}</Text>
          <Badge tone={status === 'fulfilled' ? 'success' : 'attention'}>{status.toUpperCase()}</Badge>
          {order.note && <Text variant="bodySm" tone="subdued" as="span">📝 {order.note}</Text>}
          <Text tone="subdued" as="span" style={{ whiteSpace: 'nowrap' }}>{new Date(order.updatedAt || order.createdAt).toLocaleString()}</Text>
        </InlineStack>

        <InlineStack gap="400" blockAlign="center" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button
            icon={ViewIcon}
            variant="plain"
            onClick={(e) => { e.stopPropagation(); window.open(orderUrl, '_blank'); }}
            accessibilityLabel="View order"
          >
            View Order
          </Button>
          {status === 'fulfilled' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <Icon source={PersonIcon} tone="subdued" />
              <Text variant="bodySm" tone="subdued">
                {primaryLog?.scannedBy || primaryLog?.staffEmail || "Unknown"}
              </Text>
            </div>
          )}
          <Button icon={open ? ChevronUpIcon : ChevronDownIcon} variant="plain" />
        </InlineStack>
      </div>

      <Collapsible open={open} id={`collapse-${order.id}`}>
        <div style={{ padding: '16px' }}>
          <BlockStack gap="400">
            {fabricItems.map(({ node: item }, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 2fr 1fr 2fr', alignItems: 'center', gap: '20px' }}>
                 <Thumbnail source={item.variant?.product?.featuredImage?.url || ""} alt={item.title} size="small" />
                <div>
                  <Text variant="bodyMd" fontWeight="bold">{item.title}</Text>
                  <Text variant="bodySm" tone="subdued">SKU: {item.sku || 'N/A'}</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text alignment="center" as="span">Qty: {item.quantity}</Text>
                  {status === 'fulfilled' && getStaffForItem(item.id) && (
                    <div style={{ marginTop: '4px' }}>
                      <Text variant="bodyXs" tone="subdued">By: {getStaffForItem(item.id)}</Text>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <BarcodeImage value={item.variant?.barcode} />
                </div>
              </div>
            ))}
          </BlockStack>
        </div>
      </Collapsible>
    </div>
  );
}
