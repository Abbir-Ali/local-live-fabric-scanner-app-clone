import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { getScanLogs, getLogStats } from "../models/logs.server";
import { Page, Text, Icon } from "@shopify/polaris";
import { FilterIcon, ViewIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const query = url.searchParams.get("query") || "";
  const limit = parseInt(url.searchParams.get("limit") || "5");

  const { logs, pagination } = await getScanLogs(session.shop, { page, query, limit });
  const stats = await getLogStats(session.shop);

  return {
    logs,
    pagination,
    query,
    shopDomain: session.shop.replace('.myshopify.com', ''),
    stats,
  };
};

export default function Logs() {
  const { logs, pagination, query: initialQuery, shopDomain, stats } = useLoaderData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [filterOpen, setFilterOpen] = useState(!!initialQuery);
  const [pageSize, setPageSize] = useState(String(pagination.limit || 5));

  const handlePageSizeChange = (e) => {
    const newLimit = e.target.value;
    setPageSize(newLimit);
    const params = new URLSearchParams(searchParams);
    params.set("limit", newLimit);
    params.set("page", "1");
    navigate(`?${params.toString()}`);
  };

  const handleSearchChange = useCallback((e) => setSearchValue(e.target.value), []);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchValue) params.set("query", searchValue);
    else params.delete("query");
    params.set("page", "1");
    navigate(`?${params.toString()}`);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") handleSearchSubmit();
  };

  const handlePagination = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    navigate(`?${params.toString()}`);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ["#", "Timestamp", "Order ID", "Status", "Scanned By", "Email", "Details"];
    const rows = logs.map((log, i) => [
      (pagination.page - 1) * pagination.limit + i + 1,
      new Date(log.timestamp).toLocaleString(),
      log.orderId || "-",
      log.status,
      log.scannedBy || "System",
      log.staffEmail || "",
      (log.details || "").replace(/,/g, ";"),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-logs-page-${pagination.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "FULFILLED":
        return <span style={{ padding: "4px 12px", borderRadius: "6px", background: "#D4F5E0", color: "#1A7A4C", fontSize: "12px", fontWeight: "600", letterSpacing: "0.3px" }}>FULFILLED</span>;
      case "PARTIALLY FULFILLED":
        return <span style={{ padding: "4px 12px", borderRadius: "6px", background: "#FFF3E0", color: "#E65100", fontSize: "12px", fontWeight: "600", letterSpacing: "0.3px" }}>PARTIALLY FULFILLED</span>;
      case "VOID":
        return <span style={{ padding: "4px 12px", borderRadius: "6px", background: "#F5F5F5", color: "#757575", fontSize: "12px", fontWeight: "600", letterSpacing: "0.3px" }}>VOID</span>;
      default:
        return <span style={{ padding: "4px 12px", borderRadius: "6px", background: "#E3F2FD", color: "#1565C0", fontSize: "12px", fontWeight: "600", letterSpacing: "0.3px" }}>{status}</span>;
    }
  };

  const getStaffInitials = (name) => {
    if (!name) return "S";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  };

  const getAvatarColor = (name) => {
    const colors = ["#C9A273", "#7B9E89", "#A07CB5", "#5C8DB5", "#D4896A", "#6B8E7B"];
    const index = (name || "").length % colors.length;
    return colors[index];
  };

  const startIndex = (pagination.page - 1) * pagination.limit + 1;
  const endIndex = Math.min(pagination.page * pagination.limit, pagination.totalCount);

  return (
    <Page title=" ">
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Page Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <Text variant="headingXl" as="h1">Scan Logs</Text>
            <Text variant="bodyMd" tone="subdued">Detailed fabric scanning audit trail for warehouse floor operations.</Text>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", borderRadius: "8px",
                border: "1px solid #E3DDD6", background: filterOpen ? "#F1ECE5" : "#FFFFFF",
                cursor: "pointer", fontSize: "13px", fontWeight: "500",
              }}
            >
              <Icon source={FilterIcon} />
              Filter
            </button>
            <button
              onClick={handleExportCSV}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", borderRadius: "8px",
                border: "none", background: "#1A1A1A", color: "#FFFFFF",
                cursor: "pointer", fontSize: "13px", fontWeight: "500",
              }}
            >
              <span style={{ fontSize: "14px" }}>↓</span>
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px" }}>
            <Text variant="bodyXs" tone="subdued" fontWeight="medium">TOTAL SCANS (24H)</Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "36px", fontWeight: "700", lineHeight: 1.1 }}>{stats.totalScans24h}</span>
            </div>
          </div>
          <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px" }}>
            <Text variant="bodyXs" tone="subdued" fontWeight="medium">FULFILLED RATE</Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "36px", fontWeight: "700", lineHeight: 1.1 }}>{stats.fulfilledRate}%</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: parseFloat(stats.fulfilledRate) >= 90 ? "#1A7A4C" : "#E65100" }}>
                {parseFloat(stats.fulfilledRate) >= 90 ? "Optimal" : "Needs Attention"}
              </span>
            </div>
          </div>
          <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px" }}>
            <Text variant="bodyXs" tone="subdued" fontWeight="medium">PARTIAL SCANS</Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "36px", fontWeight: "700", lineHeight: 1.1 }}>{stats.partialCount}</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#757575" }}>
                {stats.partialCount === 0 ? "None" : "Stable"}
              </span>
            </div>
          </div>
          <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E3DDD6", padding: "20px" }}>
            <Text variant="bodyXs" tone="subdued" fontWeight="medium">VOID LOGS</Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "36px", fontWeight: "700", lineHeight: 1.1 }}>
                {String(stats.voidCount).padStart(2, "0")}
              </span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: stats.voidCount > 0 ? "#D32F2F" : "#1A7A4C" }}>
                {stats.voidReversedCount > 0
                  ? `${stats.voidReversedCount} Reversed`
                  : stats.voidCount > 0 ? "Active" : "Clear"}
              </span>
            </div>
          </div>
        </div>

        {/* Filter/Search bar (collapsible) */}
        {filterOpen && (
          <div style={{
            background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E3DDD6",
            padding: "16px", marginBottom: "16px", display: "flex", gap: "12px", alignItems: "center",
          }}>
            <input
              type="text"
              value={searchValue}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by Order ID, Staff Name or Email..."
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "8px",
                border: "1px solid #E3DDD6", fontSize: "14px",
                outline: "none", fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleSearchSubmit}
              style={{
                padding: "10px 20px", borderRadius: "8px",
                border: "none", background: "#1A1A1A", color: "#FFFFFF",
                cursor: "pointer", fontSize: "13px", fontWeight: "500",
              }}
            >
              Search
            </button>
            {searchValue && (
              <button
                onClick={() => { setSearchValue(""); navigate("?"); }}
                style={{
                  padding: "10px 16px", borderRadius: "8px",
                  border: "1px solid #E3DDD6", background: "#FFFFFF",
                  cursor: "pointer", fontSize: "13px", fontWeight: "500",
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E3DDD6", overflow: "hidden" }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "60px 1.5fr 1.2fr 1.2fr 1.5fr 60px",
            padding: "14px 20px",
            borderBottom: "1px solid #E3DDD6",
            background: "#FAFAFA",
          }}>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#999", letterSpacing: "0.5px" }}>#</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#999", letterSpacing: "0.5px" }}>TIMESTAMP</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#999", letterSpacing: "0.5px" }}>ORDER ID</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#999", letterSpacing: "0.5px" }}>STATUS</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#999", letterSpacing: "0.5px" }}>STAFF ATTRIBUTION</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#999", letterSpacing: "0.5px" }}>DETAILS</span>
          </div>

          {/* Table Rows */}
          {logs.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center" }}>
              <Text variant="bodyMd" tone="subdued">No scan logs found.</Text>
            </div>
          ) : (
            logs.map((log, index) => {
              const rowNum = (pagination.page - 1) * pagination.limit + index + 1;
              const numericId = log.orderId ? log.orderId.split("/").pop() : "-";
              // Extract order name from details if available (format: [ORDER:#1035])
              const orderNameMatch = log.details?.match(/\[ORDER:(#?[^\]]+)\]/);
              const orderDisplay = orderNameMatch ? orderNameMatch[1] : numericId;
              const orderLink = log.orderId
                ? `https://admin.shopify.com/store/${shopDomain}/orders/${log.orderId.split('/').pop()}`
                : null;
              const staffName = log.scannedBy || "System";
              const avatarColor = getAvatarColor(staffName);

              return (
                <div
                  key={log.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1.5fr 1.2fr 1.2fr 1.5fr 60px",
                    padding: "16px 20px",
                    borderBottom: index < logs.length - 1 ? "1px solid #F1ECE5" : "none",
                    alignItems: "center",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#FAFAFA"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  {/* Row number */}
                  <span style={{ fontSize: "14px", color: "#999", fontWeight: "500" }}>{String(rowNum).padStart(4, "0")}</span>

                  {/* Timestamp */}
                  <span style={{ fontSize: "14px", color: "#333" }}>
                    {new Date(log.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    {new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>

                  {/* Order ID */}
                  <span>
                    {orderLink ? (
                      <a
                        href={orderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "14px", fontWeight: "600", color: "#1A1A1A", textDecoration: "none" }}
                      >
                        {orderDisplay}
                      </a>
                    ) : (
                      <span style={{ fontSize: "14px", color: "#999" }}>-</span>
                    )}
                  </span>

                  {/* Status */}
                  <span>{getStatusBadge(log.status)}</span>

                  {/* Staff Attribution */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "50%",
                      background: avatarColor, color: "#FFFFFF",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", fontWeight: "700", flexShrink: 0,
                    }}>
                      {getStaffInitials(staffName)}
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: "500" }}>{staffName}</span>
                  </div>

                  {/* Details (eye icon linking to order) */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {orderLink ? (
                      <a
                        href={orderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#999", display: "flex" }}
                        title="View order details"
                      >
                        <Icon source={ViewIcon} />
                      </a>
                    ) : (
                      <span style={{ color: "#DDD", display: "flex" }}>
                        <Icon source={ViewIcon} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Footer / Pagination */}
          {logs.length > 0 && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 20px", borderTop: "1px solid #E3DDD6", background: "#FAFAFA",
            }}>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#999", letterSpacing: "0.3px" }}>
                SHOWING {startIndex} TO {endIndex} OF {pagination.totalCount} LOGS
              </span>
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                style={{
                  padding: "6px 10px", borderRadius: "6px",
                  border: "1px solid #E3DDD6", background: "#FFFFFF",
                  fontSize: "12px", fontWeight: "500", color: "#333",
                  cursor: "pointer", outline: "none",
                }}
              >
                <option value="5">5 per page</option>
                <option value="10">10 per page</option>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
              </select>
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                {/* Previous */}
                <button
                  onClick={() => pagination.page > 1 && handlePagination(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  style={{
                    width: "32px", height: "32px", borderRadius: "6px",
                    border: "1px solid #E3DDD6", background: "#FFFFFF",
                    cursor: pagination.page <= 1 ? "not-allowed" : "pointer",
                    opacity: pagination.page <= 1 ? 0.4 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", color: "#333",
                  }}
                >
                  ‹
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (pagination.page <= 3) {
                    pageNum = i + 1;
                  } else if (pagination.page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = pagination.page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePagination(pageNum)}
                      style={{
                        width: "32px", height: "32px", borderRadius: "6px",
                        border: pageNum === pagination.page ? "none" : "1px solid #E3DDD6",
                        background: pageNum === pagination.page ? "#1A1A1A" : "#FFFFFF",
                        color: pageNum === pagination.page ? "#FFFFFF" : "#333",
                        cursor: "pointer", fontSize: "13px", fontWeight: "600",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {pagination.totalPages > 5 && (
                  <>
                    <span style={{ padding: "0 4px", color: "#999" }}>…</span>
                    <button
                      onClick={() => handlePagination(pagination.totalPages)}
                      style={{
                        minWidth: "32px", height: "32px", borderRadius: "6px",
                        border: pagination.page === pagination.totalPages ? "none" : "1px solid #E3DDD6",
                        background: pagination.page === pagination.totalPages ? "#1A1A1A" : "#FFFFFF",
                        color: pagination.page === pagination.totalPages ? "#FFFFFF" : "#333",
                        cursor: "pointer", fontSize: "13px", fontWeight: "600",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "0 8px",
                      }}
                    >
                      {pagination.totalPages}
                    </button>
                  </>
                )}
                {/* Next */}
                <button
                  onClick={() => pagination.page < pagination.totalPages && handlePagination(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  style={{
                    width: "32px", height: "32px", borderRadius: "6px",
                    border: "1px solid #E3DDD6", background: "#FFFFFF",
                    cursor: pagination.page >= pagination.totalPages ? "not-allowed" : "pointer",
                    opacity: pagination.page >= pagination.totalPages ? 0.4 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", color: "#333",
                  }}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
