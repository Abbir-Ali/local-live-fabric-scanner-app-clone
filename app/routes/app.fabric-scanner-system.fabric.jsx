import { useLoaderData, useFetcher, useNavigate, useSearchParams, useNavigation, useRevalidator } from "@remix-run/react";
import { createPortal } from "react-dom";
import { authenticate } from "../shopify.server";
import {
  Page, Layout, Card, IndexTable, Button, BlockStack, Badge,
  InlineStack, Thumbnail, Text, Pagination, Box, IndexFilters, TextField, Select, useSetIndexFiltersMode,
  Popover, Banner, Grid, Modal, Tabs, Icon
} from "@shopify/polaris";
import { ArrowRightIcon, EditIcon, ExportIcon, SearchIcon, PlusIcon, DeleteIcon, LocationIcon } from "@shopify/polaris-icons";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getFabricInventory, getShopLocations, getAllFabricInventory, getGlobalInventoryStats, getAssignedBinLocations } from "../services/order.server";
import { adjustInventory, setInventory } from "../services/inventory.server";
import { getBinLocations, importBinLocations, addManualBinLocation, deleteBinLocation, clearAllBinLocations } from "../models/binLocations.server";

import BarcodeImage from "../components/BarcodeImage";

/**
 * LOADER
 * Fetches fabric products, pagination info, and shop locations.
 */
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("direction") || "next";
  const page = parseInt(url.searchParams.get("page") || "1");
  const query = url.searchParams.get("query") || "";
  const sortKey = url.searchParams.get("sortKey") || "CREATED_AT";
  const reverse = url.searchParams.get("reverse") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "5");

  // Improved BIN detection: only trigger for patterns that look like actual BIN locations
  // BIN format: Letter(s) + Number + optional colon + optional number (e.g., A1, A1:2, AA12:5)
  const isBinSearch = query && (
    /^[A-Z]+\d+:\d+$/i.test(query) || // Exact BIN format: A1:2, AA12:5
    /^[A-Z]+\d+:$/i.test(query) ||    // Partial with colon: A1:, AA12:
    (/^[A-Z]+\d+$/i.test(query) && query.length <= 4) // Short letter+number: A1, B2, AA1 (but not long SKUs)
  );

  console.log(`[LOADER] Query: "${query}", isBinSearch: ${isBinSearch}, length: ${query.length}`);

  const locations = await getShopLocations(admin);
  const primaryLocation = locations.find(loc => loc.isPrimary) || locations[0];
  const locationId = url.searchParams.get("locationId") || primaryLocation?.id || null;

  const { edges, pageInfo } = await getFabricInventory(admin, cursor, {
    query, sortKey, reverse, direction, locationId, isBinSearch, limit
  });

  const globalStats = await getGlobalInventoryStats(admin, locationId);

  const shopDomain = session.shop.replace(".myshopify.com", "");
  const binLocations = await getBinLocations(session.shop);
  const assignedBins = await getAssignedBinLocations(admin);

  return {
    products: edges,
    pageInfo,
    page,
    shopDomain,
    locations,
    currentLocationId: locationId,
    initialQuery: query,
    initialSort: sortKey,
    initialReverse: reverse,
    initialLimit: limit,
    globalStats,
    isBinSearch,
    binLocations,
    assignedBins,
  };
};

/**
 * ACTION
 * Handles inventory adjustments, bulk updates, bin location management.
 */
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const actionType = formData.get("actionType");
  console.log(`[ACTION] Received action: ${actionType}`);

  if (actionType === "updateBin") {
    const productId = formData.get("productId");
    const binValue = formData.get("binValue");

    // Check if this bin location is already assigned to another product
    if (binValue && binValue.trim()) {
      try {
        const assignedBins = await getAssignedBinLocations(admin);
        const existing = assignedBins[binValue.trim()];
        if (existing && existing.productId !== productId) {
          console.log(`[UPDATE BIN] Bin "${binValue}" already in use by "${existing.productTitle}" (${existing.productId})`);
          return {
            success: false,
            error: `Bin location "${binValue}" is already assigned to "${existing.productTitle}". Each bin can only be used by one product at a time.`,
            field: "bin",
            conflictProduct: existing.productTitle,
          };
        }
      } catch (checkError) {
        console.error("[UPDATE BIN] Uniqueness check failed:", checkError);
        // Continue with the save — don't block on a failed check
      }
    }

    try {
      const metafieldsMutation = `#graphql
        mutation updateBin($ownerId: ID!, $value: String!) {
          metafieldsSet(metafields: [
            {
              ownerId: $ownerId,
              namespace: "custom",
              key: "bin_locations",
              type: "single_line_text_field",
              value: $value
            }
          ]) {
            metafields { id value }
            userErrors { field message }
          }
        }`;
      const metafieldsVars = { ownerId: productId, value: binValue || "" };

      const response = await admin.graphql(metafieldsMutation, { variables: metafieldsVars });
      const resData = await response.json();
      const errors = resData.data?.metafieldsSet?.userErrors || [];

      if (errors.length > 0) {
        console.error("[UPDATE BIN] User errors:", errors);

        // If the error is about a missing definition, auto-create it and retry
        const isDefinitionError = errors.some(e =>
          e.message?.toLowerCase().includes("definition") ||
          e.message?.toLowerCase().includes("not found") ||
          e.message?.toLowerCase().includes("invalid") ||
          e.field?.includes("definition")
        );

        if (isDefinitionError) {
          console.log("[UPDATE BIN] Metafield definition missing — auto-creating...");
          try {
            await admin.graphql(
              `#graphql
              mutation createMetafieldDefinition($definition: MetafieldDefinitionInput!) {
                metafieldDefinitionCreate(definition: $definition) {
                  createdDefinition { id }
                  userErrors { field message }
                }
              }`,
              {
                variables: {
                  definition: {
                    name: "Bin Locations",
                    namespace: "custom",
                    key: "bin_locations",
                    type: "single_line_text_field",
                    ownerType: "PRODUCT",
                    description: "Warehouse bin location (e.g. A1:2)",
                  },
                },
              }
            );

            // Retry the original mutation
            const retryResponse = await admin.graphql(metafieldsMutation, { variables: metafieldsVars });
            const retryData = await retryResponse.json();
            const retryErrors = retryData.data?.metafieldsSet?.userErrors || [];

            if (retryErrors.length > 0) {
              console.error("[UPDATE BIN] Retry errors:", retryErrors);
              return {
                success: false,
                error: `Failed to save bin location after creating definition: ${retryErrors[0].message}`,
                field: "bin"
              };
            }
            return { success: true, field: "bin", updatedValue: binValue };
          } catch (defError) {
            console.error("[UPDATE BIN] Failed to create definition:", defError);
            return {
              success: false,
              error: `Metafield definition missing and auto-creation failed: ${defError.message}. Try clicking "Setup Bin Metafield" manually.`,
              field: "bin"
            };
          }
        }

        return {
          success: false,
          error: `Failed to save bin location: ${errors[0].message}. The metafield definition may be missing — try clicking "Setup Bin Metafield" first.`,
          field: "bin"
        };
      }
      return { success: true, field: "bin", updatedValue: binValue };
    } catch (error) {
      console.error("[UPDATE BIN] Error:", error);
      return {
        success: false,
        error: `Unable to save bin location: ${error.message}`,
        field: "bin"
      };
    }
  }

  if (actionType === "importBinLocations") {
    const locationsJson = formData.get("locations");
    try {
      const locations = JSON.parse(locationsJson || "[]");
      if (locations.length === 0) {
        return {
          success: false,
          actionType,
          error: "No valid bin locations found in the file. Please check the file format."
        };
      }
      const result = await importBinLocations(shop, locations);
      return { success: true, actionType, ...result };
    } catch (error) {
      console.error("[IMPORT BINS] Error:", error);
      return {
        success: false,
        actionType,
        error: `Import failed: ${error.message}. Please check your file format.`
      };
    }
  }

  if (actionType === "addManualBinLocation") {
    const location = formData.get("location");
    const result = await addManualBinLocation(shop, location);
    return { ...result, actionType };
  }

  if (actionType === "deleteBinLocation") {
    const location = formData.get("location");
    await deleteBinLocation(shop, location);
    return { success: true, actionType, deleted: location };
  }

  if (actionType === "clearAllBinLocations") {
    await clearAllBinLocations(shop);
    return { success: true, actionType };
  }

  if (actionType === "clearBin") {
    const productId = formData.get("productId");

    try {
      // Use metafieldsDelete (plural) with ownerId + namespace + key
      // This works whether the metafield exists or not — no error if already cleared
      const deleteResponse = await admin.graphql(
        `#graphql
        mutation clearBinMetafield($ownerId: ID!) {
          metafieldsDelete(metafields: [
            {
              ownerId: $ownerId,
              namespace: "custom",
              key: "bin_locations"
            }
          ]) {
            deletedMetafields {
              ownerId
              namespace
              key
            }
            userErrors { field message }
          }
        }`,
        { variables: { ownerId: productId } }
      );

      const deleteData = await deleteResponse.json();

      if (deleteData.errors) {
        console.error("[CLEAR BIN] GraphQL errors:", deleteData.errors);
        return {
          success: false,
          error: `Failed to clear bin location: ${deleteData.errors[0]?.message || "Unknown error"}`,
          field: "bin",
        };
      }

      const userErrors = deleteData.data?.metafieldsDelete?.userErrors || [];
      if (userErrors.length > 0) {
        console.error("[CLEAR BIN] User errors:", userErrors);
        return {
          success: false,
          error: `Failed to clear bin location: ${userErrors[0].message}`,
          field: "bin",
        };
      }

      console.log(`[CLEAR BIN] Cleared bin metafield for product ${productId}`);
      return { success: true, field: "bin", updatedValue: "", actionType: "clearBin" };
    } catch (error) {
      console.error("[CLEAR BIN] Error:", error);
      return {
        success: false,
        error: `Unable to clear bin location: ${error.message}`,
        field: "bin",
      };
    }
  }

  if (actionType === "adjustInventory") {
    const inventoryItemId = formData.get("inventoryItemId");
    const locationId = formData.get("locationId");
    const delta = formData.get("delta");

    try {
      await adjustInventory(admin, inventoryItemId, locationId, delta);
      return { success: true, message: "Inventory adjusted successfully" };
    } catch (error) {
      console.error("[ACTION] Adjust Error:", error);
      return { success: false, error: error.message };
    }
  }

  if (actionType === "setInventory") {
    const inventoryItemId = formData.get("inventoryItemId");
    const locationId = formData.get("locationId");
    const quantity = formData.get("quantity");

    try {
      await setInventory(admin, inventoryItemId, locationId, quantity);
      return { success: true, message: "Inventory set successfully" };
    } catch (error) {
      console.error("[ACTION] Set Error:", error);
      return { success: false, error: error.message };
    }
  }

  if (actionType === "exportAllBarcodes") {
    try {
      const allBarcodes = await getAllFabricInventory(admin);
      return { success: true, allBarcodes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: false, error: "Invalid action type" };
};

/**
 * COMPONENT: FabricInventory
 * Main page component.
 */
export default function FabricInventory() {
  const { products: rawProducts, pageInfo, page, shopDomain, locations, currentLocationId, initialQuery, initialSort, initialReverse, initialLimit = 5, globalStats: initialGlobalStats, isBinSearch: initialIsBinSearch, binLocations: serverBinLocations, assignedBins: serverAssignedBins } = useLoaderData();
  const products = rawProducts || [];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const { mode, setMode } = useSetIndexFiltersMode();
  const revalidator = useRevalidator();

  const stats = initialGlobalStats || { total: 0, lowStock: 0, outOfStock: 0 };
  const isBinSearch = initialIsBinSearch || false;

  // Bin locations come from the server (DB) — always in sync across all admin users
  const [binLocations, setBinLocations] = useState(serverBinLocations || []);
  const [assignedBins, setAssignedBins] = useState(serverAssignedBins || {});
  const [importModalActive, setImportModalActive] = useState(false);
  const [importFeedback, setImportFeedback] = useState(null); // { type: 'success'|'error', message }

  // Setup metafield
  const [setupModalActive, setSetupModalActive] = useState(false);
  const setupFetcher = useFetcher();

  // Page size state
  const [pageSize, setPageSize] = useState(String(initialLimit));

  const pageSizeOptions = [
    { label: '5 per page', value: '5' },
    { label: '10 per page', value: '10' },
    { label: '25 per page', value: '25' },
    { label: '50 per page', value: '50' },
    { label: '100 per page', value: '100' },
  ];

  // Keep local state in sync when loader refreshes
  useEffect(() => {
    setBinLocations(serverBinLocations || []);
  }, [serverBinLocations]);

  useEffect(() => {
    setAssignedBins(serverAssignedBins || {});
  }, [serverAssignedBins]);

  const locationOptions = useMemo(() => {
    if (!locations || locations.length === 0) return [{ label: "No locations found", value: "" }];
    return locations.map(loc => ({ label: loc.name, value: loc.id }));
  }, [locations]);
  // sort options
  const sortOptions = [
    { label: 'Date', value: 'CREATED_AT desc', directionLabel: 'Newest first' },
    { label: 'Date', value: 'CREATED_AT asc', directionLabel: 'Oldest first' },
    { label: 'Title', value: 'TITLE asc', directionLabel: 'A-Z' },
    { label: 'Title', value: 'TITLE desc', directionLabel: 'Z-A' },
    { label: 'Stock', value: 'INVENTORY_TOTAL asc', directionLabel: 'Low to High' },
    { label: 'Stock', value: 'INVENTORY_TOTAL desc', directionLabel: 'High to Low' },
  ];

  const [sortSelected, setSortSelected] = useState([`${initialSort} ${initialReverse ? 'desc' : 'asc'}`]);
  const [queryValue, setQueryValue] = useState(initialQuery || "");

  useEffect(() => {
    setQueryValue(initialQuery || "");
  }, [initialQuery]);

  const handleQueryChange = useCallback((value) => setQueryValue(value), []);

  useEffect(() => {
    const urlQuery = searchParams.get("query") || "";
    if (queryValue === urlQuery) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (queryValue) params.set("query", queryValue);
      else params.delete("query");
      params.delete("cursor");
      params.delete("direction");
      params.set("page", "1");
      navigate(`?${params.toString()}`, { replace: true });
    }, 1200);

    return () => clearTimeout(timer);
  }, [queryValue, searchParams, navigate]);

  const handleQueryClear = useCallback(() => {
    setQueryValue("");
    const params = new URLSearchParams(searchParams);
    params.delete("query");
    params.delete("cursor");
    params.delete("direction");
    params.set("page", "1");
    navigate(`?${params.toString()}`);
  }, [searchParams, navigate]);

  const handleSortChange = useCallback((value) => {
    if (!value || value.length === 0 || !value[0]) return;

    setSortSelected(value);
    const splitVal = value[0].split(" ");
    if (splitVal.length < 2) return;

    const [key, direction] = splitVal;
    const rev = direction === "desc";

    const params = new URLSearchParams(searchParams);
    params.set("sortKey", key);
    params.set("reverse", rev ? "true" : "false");
    params.delete("cursor");
    params.delete("direction");
    params.set("page", "1");
    navigate(`?${params.toString()}`);
  }, [searchParams, navigate]);

  const handleLocationChange = useCallback((value) => {
    const params = new URLSearchParams(searchParams);
    params.set("locationId", value);
    navigate(`?${params.toString()}`);
  }, [searchParams, navigate]);

  const handlePageSizeChange = useCallback((value) => {
    setPageSize(value);
    const params = new URLSearchParams(searchParams);
    params.set("limit", value);
    params.delete("cursor");
    params.delete("direction");
    params.set("page", "1");
    navigate(`?${params.toString()}`);
  }, [searchParams, navigate]);

  const handlePagination = (cursor, direction) => {
    const params = new URLSearchParams(searchParams);
    if (cursor) {
      params.set("cursor", cursor);
      params.set("direction", direction);
      params.set("page", direction === "next" ? (page + 1).toString() : (page - 1).toString());
    }
    navigate(`?${params.toString()}`);
  };

  const handleImportBinLocations = useCallback((locations) => {
    fetcher.submit(
      { actionType: "importBinLocations", locations: JSON.stringify(locations) },
      { method: "post" }
    );
  }, [fetcher]);

  const handleClearBinLocations = useCallback(() => {
    if (window.confirm(`Clear all ${binLocations.length} bin locations? This cannot be undone.`)) {
      fetcher.submit({ actionType: "clearAllBinLocations" }, { method: "post" });
    }
  }, [fetcher, binLocations.length]);

  // Handle fetcher responses for bin location actions
  useEffect(() => {
    if (!fetcher.data) return;
    const d = fetcher.data;
    if (d.actionType === "importBinLocations") {
      if (d.success) {
        const message = d.added > 0
          ? `✓ Import successful! Added ${d.added} new location${d.added !== 1 ? 's' : ''}${d.duplicates > 0 ? `, skipped ${d.duplicates} duplicate${d.duplicates !== 1 ? 's' : ''}` : ''}. Total: ${d.total} locations.`
          : `✓ Import complete. All ${d.duplicates} location${d.duplicates !== 1 ? 's were' : ' was'} already in your database. Total: ${d.total} locations.`;
        setImportFeedback({ type: "success", message });
        setImportModalActive(false);
        navigate(".", { replace: true });
      } else {
        setImportFeedback({ type: "critical", message: `Import failed: ${d.error || "Unknown error"}` });
      }
    }
    if (d.actionType === "addManualBinLocation") {
      if (d.success) {
        navigate(".", { replace: true });
      }
    }
    if (d.actionType === "deleteBinLocation" && d.success) {
      navigate(".", { replace: true });
    }
    if (d.actionType === "clearAllBinLocations" && d.success) {
      setImportFeedback({ type: "success", message: "✓ All bin locations cleared successfully" });
      navigate(".", { replace: true });
    }
  }, [fetcher.data, navigate]);

  // Handle setup metafield response
  useEffect(() => {
    if (!setupFetcher.data) return;
    const d = setupFetcher.data;
    if (d.success) {
      setImportFeedback({
        type: "success",
        message: d.alreadyExists
          ? "✓ Bin Locations metafield is already set up and ready to use!"
          : "✓ Bin Locations metafield created successfully! You can now assign bins to products."
      });
      setSetupModalActive(false);
    } else {
      setImportFeedback({
        type: "critical",
        message: `Setup failed: ${d.error || "Unknown error"}. Please try creating the metafield manually in Settings → Custom Data → Products.`
      });
    }
  }, [setupFetcher.data]);

  const handlePrint = (barcode, title, sku, binNumber) => {
    const printWindow = window.open('', '_blank', 'width=600,height=400');

    if (!printWindow) {
      alert("Please allow popups to print barcodes.");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Barcode - ${barcode}</title>
          <style>
            @page {
              size: 58mm 30mm;
              margin: 0;
            }
            html, body {
              width: 58mm;
              height: 30mm;
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              font-family: monospace;
              box-sizing: border-box;
              padding-top: 2mm;
            }
            .header {
              width: 100%;
              text-align: center;
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 2mm;
            }
            .barcode-container {
              width: 100%;
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0 2mm;
              box-sizing: border-box;
            }
            svg {
              max-width: 54mm;
              max-height: 18mm;
              height: auto;
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
        </head>
        <body>
          <div class="header">
            Bin: ${binNumber || "N/A"}
          </div>
          <div class="barcode-container">
            <svg id="barcode"></svg>
          </div>
          <script>
            window.onload = function() {
              if (window.JsBarcode) {
                JsBarcode("#barcode", "${barcode}", {
                  format: "CODE128",
                  width: 2,
                  height: 50,
                  displayValue: false,
                  fontSize: 14,
                  margin: 0
                });
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 600);
              }
            };
          <\/script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleBulkPrint = (barcodes) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (!printWindow) {
      alert("Please allow popups to print barcodes.");
      return;
    }

    const labelsHtml = barcodes.map((item, idx) => `
      <div class="label-page">
        <div class="header">
          Bin: ${item.binNumber || "N/A"}
        </div>
        <div class="barcode-container">
          <svg id="barcode-${idx}"></svg>
        </div>
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bulk Print Barcodes</title>
          <style>
            @page {
              size: 58mm 30mm;
              margin: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              font-family: monospace;
            }
            .label-page {
              width: 58mm;
              height: 30mm;
              page-break-after: always;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              overflow: hidden;
              box-sizing: border-box;
              padding-top: 2mm;
            }
            .header {
              width: 100%;
              text-align: center;
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 2mm;
            }
            .barcode-container {
              width: 100%;
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0 2mm;
              box-sizing: border-box;
            }
            svg {
              max-width: 54mm;
              max-height: 18mm;
              height: auto;
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
        </head>
        <body>
          ${labelsHtml}
          <script>
            window.onload = function() {
              if (window.JsBarcode) {
                const barcodesData = ${JSON.stringify(barcodes)};
                barcodesData.forEach((item, idx) => {
                  if (item.barcode) {
                    JsBarcode("#barcode-" + idx, item.barcode, {
                      format: "CODE128",
                      width: 2,
                      height: 50,
                      displayValue: false,
                      fontSize: 14,
                      margin: 0
                    });
                  }
                });
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 1000);
              }
            };
          <\/script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  useEffect(() => {
    if (fetcher.data?.allBarcodes) {
      const barcodesToPrint = fetcher.data.allBarcodes.filter(b => b.barcode);
      if (barcodesToPrint.length === 0) {
        alert("No barcodes found to export.");
      } else {
        handleBulkPrint(barcodesToPrint);
      }
    }
  }, [fetcher.data]);


  const resourceName = { singular: 'product', plural: 'products' };
  const isLoading = navigation.state === "loading";
  const isFetching = fetcher.state !== "idle";
  const isSearching = navigation.state === "loading" && searchParams.get("query");

  const rowMarkup = products.map(({ node }, index) => {
    const { title, id, legacyResourceId, featuredImage, variants, binLocation } = node;
    const variant = variants.edges[0]?.node;
    const sku = variant?.sku || "N/A";
    const barcode = variant?.barcode || "";
    const inventoryItemId = variant?.inventoryItem?.id;
    const binMeta = binLocation;
    const adminUrl = `https://admin.shopify.com/store/${shopDomain}/products/${legacyResourceId}`;

    // Calculate global index based on page number
    const globalIndex = (page - 1) * parseInt(pageSize) + index + 1;

    // Find the inventory level matching the selected locationId
    const levels = variant?.inventoryItem?.inventoryLevels?.edges || [];
    const matchingLevel = levels.find(l => l.node.location.id === currentLocationId);
    const available = matchingLevel?.node?.quantities?.find(q => q.name === "available")?.quantity || 0;

    return (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <Box paddingInlineStart="300">
            <Text variant="bodySm" tone="subdued" fontWeight="bold">#{globalIndex}</Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ padding: '8px 0' }}>
            <Thumbnail source={featuredImage?.url || ""} alt={title} size="large" />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ padding: '12px 0' }}>
            <BlockStack gap="100">
              <Text variant="bodyMd" fontWeight="bold" breakWord>{title}</Text>
              <InlineStack gap="200">
                <Badge tone="info" size="small">SKU: {sku}</Badge>
                <Button
                  icon={ArrowRightIcon}
                  variant="plain"
                  external
                  target="_blank"
                  url={adminUrl}
                  size="micro"
                  onClick={(e) => e.stopPropagation()}
                >
                  View in Admin
                </Button>
              </InlineStack>
            </BlockStack>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Badge tone={available > 10 ? "success" : available > 0 ? "warning" : "critical"}>
              {available} {available === 1 ? 'unit' : 'units'}
            </Badge>
            <InventoryAdjuster inventoryItemId={inventoryItemId} locationId={currentLocationId} />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BinEditor productId={id} initialBin={binMeta?.value || ""} binLocations={binLocations} assignedBins={assignedBins} onBinChanged={() => revalidator.revalidate()} />
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Box
              padding="100"
              background="bg-surface-secondary"
              borderRadius="200"
              borderWidth="025"
              borderColor="border"
              minWidth="100px"
              style={{ display: 'flex', justifyContent: 'center' }}
            >
              <div style={{ transform: 'scale(0.7)', transformOrigin: 'center', opacity: barcode ? 1 : 0.4, height: '35px' }}>
                <BarcodeImage value={barcode} />
              </div>
            </Box>
            {barcode && (
              <Button
                icon={ExportIcon}
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrint(barcode, title, sku, binMeta?.value || "");
                }}
                size="slim"
                accessibilityLabel="Print Label"
              />
            )}
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Swatch Item Inventory"
      fullWidth
      primaryAction={{
        content: 'Manage Bin Locations',
        onAction: () => setImportModalActive(true),
      }}
      secondaryActions={[
        {
          content: 'Setup Bin Metafield',
          onAction: () => setSetupModalActive(true),
        },
        {
          content: 'Bulk Export Barcodes',
          icon: ExportIcon,
          onAction: () => fetcher.submit({ actionType: "exportAllBarcodes" }, { method: "post" }),
          loading: fetcher.state === "submitting" && fetcher.formData?.get("actionType") === "exportAllBarcodes"
        },
      ].filter(Boolean)}
    >
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <Layout>
        <BinLocationModal
          active={importModalActive}
          onClose={() => setImportModalActive(false)}
          onImport={handleImportBinLocations}
          onClear={handleClearBinLocations}
          binLocations={binLocations}
          fetcher={fetcher}
        />

        <SetupMetafieldModal
          active={setupModalActive}
          onClose={() => setSetupModalActive(false)}
          fetcher={setupFetcher}
        />

        {importFeedback && (
          <Layout.Section>
            <Banner
              tone={importFeedback.type === "success" ? "success" : "critical"}
              onDismiss={() => setImportFeedback(null)}
            >
              <p>{importFeedback.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {binLocations.length > 0 && (
          <Layout.Section>
            <div style={{
              background: "#F1ECE5",
              border: "1px solid #C9A273",
              borderRadius: "var(--p-border-radius-300)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}>
              <InlineStack gap="200" align="center" blockAlign="center">
                <div style={{ color: "#C9A273", display: "flex" }}>
                  <Icon source={LocationIcon} />
                </div>
                <Text variant="bodySm" fontWeight="semibold">
                  {binLocations.length} bin locations loaded
                </Text>
                <span style={{
                  background: "#EAAF7E",
                  color: "#945528",
                  fontSize: "11px",
                  fontWeight: "600",
                  padding: "2px 8px",
                  borderRadius: "20px",
                  letterSpacing: "0.3px",
                }}>Active</span>
              </InlineStack>
              <Button size="slim" variant="tertiary" onClick={() => setImportModalActive(true)}>
                Manage
              </Button>
            </div>
          </Layout.Section>
        )}

        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3, xl: 3 }} gap={{ xs: '400', md: '400' }}>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }}>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h2">Inventory Summary</Text>
                  <InlineStack gap="1000" align="start">
                    <BlockStack gap="100">
                      <Text variant="bodyXs" tone="subdued" fontWeight="medium">TOTAL ITEMS</Text>
                      <Text variant="headingLg" as="p">{stats.total}</Text>
                    </BlockStack>
                    <div style={{ width: '1px', background: 'var(--p-color-border-subdued)', height: '40px' }} />
                    <BlockStack gap="100">
                      <Text variant="bodyXs" tone="subdued" fontWeight="medium">LOW STOCK</Text>
                      <Text variant="headingLg" as="p" tone="warning">{stats.lowStock}</Text>
                    </BlockStack>
                    <div style={{ width: '1px', background: 'var(--p-color-border-subdued)', height: '40px' }} />
                    <BlockStack gap="100">
                      <Text variant="bodyXs" tone="subdued" fontWeight="medium">OUT OF STOCK</Text>
                      <Text variant="headingLg" as="p" tone="critical">{stats.outOfStock}</Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 1, lg: 1, xl: 1 }}>
              <Card height="100%">
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h2">Stock Location</Text>
                  <BlockStack gap="200">
                    <Select
                      label="Select Warehouse / Location"
                      labelHidden
                      options={locationOptions}
                      onChange={handleLocationChange}
                      value={currentLocationId}
                    />
                    <Text variant="bodyXs" tone="subdued">Inventory actions will update the selected warehouse.</Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Box minHeight="400px" position="relative">
              {/* Loading Overlay */}
              {isLoading && (
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
                    {isSearching ? 'Searching...' : 'Loading...'}
                  </Text>
                </div>
              )}

              {isBinSearch && queryValue && (
                <Box padding="400" borderBottomWidth="025" borderColor="border" background="bg-fill-tertiary">
                  <InlineStack gap="200" align="start">
                    <Badge tone="info">BIN Search Active</Badge>
                    <Text variant="bodySm">Searching for BIN: <strong>{queryValue}</strong></Text>
                  </InlineStack>
                </Box>
              )}
              <IndexFilters
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                onSort={handleSortChange}
                onQueryChange={handleQueryChange}
                onQueryClear={handleQueryClear}
                queryValue={queryValue}
                tabs={[]}
                selected={0}
                onSelect={() => { }}
                mode={mode}
                setMode={setMode}
                loading={false}
                filters={[]}
                canCreateNewView={false}
                queryPlaceholder="Search by SKU, title, or bin location..."
                disabled={isLoading}
              />

              <IndexTable
                resourceName={resourceName}
                itemCount={products.length}
                selectable={false}
                headings={[
                  { title: 'No.' },
                  { title: 'Image' },
                  { title: 'Product Detail' },
                  { title: 'Stock Status' },
                  { title: 'Bin Location' },
                  { title: 'Barcode Reference' },
                ]}
                hasMoreItems={pageInfo?.hasNextPage}
                loading={false}
              >
                {rowMarkup}
              </IndexTable>

              <Box padding="400" borderTopWidth="025" borderColor="border">
                <InlineStack align="space-between" blockAlign="center">
                  <div style={{ width: '140px' }}>
                    <Select
                      label=""
                      labelHidden
                      options={pageSizeOptions}
                      value={pageSize}
                      onChange={handlePageSizeChange}
                      disabled={isLoading}
                    />
                  </div>
                  <Pagination
                    hasPrevious={pageInfo?.hasPreviousPage && !isLoading}
                    onPrevious={() => handlePagination(pageInfo.startCursor, "prev")}
                    hasNext={pageInfo?.hasNextPage && !isLoading}
                    onNext={() => handlePagination(pageInfo.endCursor, "next")}
                  />
                  <div style={{ width: '140px' }} />
                </InlineStack>
              </Box>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>

    </Page>
  );
}

/**
 * HELPER: InventoryAdjuster
 */
function InventoryAdjuster({ inventoryItemId, locationId }) {
  const fetcher = useFetcher();
  const [active, setActive] = useState(false);
  const [value, setValue] = useState("0");
  const [mode, setMode] = useState("adjust"); // 'adjust' or 'set'

  const toggleActive = useCallback(() => setActive((prev) => !prev), []);

  const handleSync = () => {
    const actionType = mode === "adjust" ? "adjustInventory" : "setInventory";
    const fieldName = mode === "adjust" ? "delta" : "quantity";

    fetcher.submit(
      { actionType, inventoryItemId, locationId, [fieldName]: value },
      { method: "post" }
    );
    setActive(false);
    setValue("0");
  };

  const isLoading = fetcher.state !== "idle";

  return (
    <Popover
      active={active}
      activator={<Button icon={EditIcon} variant="plain" onClick={(e) => { e.stopPropagation(); toggleActive(); }} size="slim" />}
      onClose={toggleActive}
      sectioned
    >
      <BlockStack gap="300">
        <Text variant="headingXs">Inventory Management</Text>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <Button
            size="slim"
            pressed={mode === 'adjust'}
            onClick={() => { setMode('adjust'); setValue("0"); }}
          >
            Adjust by
          </Button>
          <Button
            size="slim"
            pressed={mode === 'set'}
            onClick={() => { setMode('set'); setValue("0"); }}
          >
            New
          </Button>
        </div>

        <TextField
          label={mode === 'adjust' ? "Adjust by quantity" : "Set New Quantity"}
          type="number"
          value={value}
          onChange={setValue}
          autoComplete="off"
          helpText={mode === 'adjust' ? "Use + or - values (e.g. 5, -3)" : "Overrides current stock"}
        />

        <Button
          size="slim"
          onClick={(e) => { e.stopPropagation(); handleSync(); }}
          loading={isLoading}
          variant="primary"
          fullWidth
        >
          {mode === 'adjust' ? 'Adjust Stock' : 'Set Stock'}
        </Button>
      </BlockStack>
    </Popover>
  );
}


/**
 * HELPER: BinLocationModal
 * Tabbed modal: Import from file | Add manually | Manage existing
 */
function BinLocationModal({ active, onClose, onImport, onClear, binLocations, fetcher }) {
  const [selectedTab, setSelectedTab] = useState(0);
  const [file, setFile] = useState(null);
  const [previewLocations, setPreviewLocations] = useState([]);
  const [fileProcessing, setFileProcessing] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [manualValue, setManualValue] = useState("");
  const [manualError, setManualError] = useState(null);
  const [searchManage, setSearchManage] = useState("");
  const fileInputRef = useRef(null);

  const isSubmitting = fetcher.state === "submitting";

  const tabs = [
    { id: "import", content: "Import File" },
    { id: "manual", content: "Add Manually" },
    { id: "manage", content: `Manage (${binLocations.length})` },
  ];

  // --- File tab ---
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFileError(null);
    setFileProcessing(true);
    setFile(selectedFile);
    try {
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(selectedFile);
      });
      const { parseBinLocations } = await import("../utils/binLocationParser");
      const locations = await parseBinLocations(selectedFile.type, fileContent);
      setPreviewLocations(locations);
    } catch (err) {
      setFileError(err.message || "Failed to parse file");
      setFile(null);
      setPreviewLocations([]);
    } finally {
      setFileProcessing(false);
    }
  };

  const handleFileImport = () => {
    if (previewLocations.length > 0) {
      onImport(previewLocations);
    }
  };

  const handleFileReset = () => {
    setFile(null);
    setPreviewLocations([]);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- Manual tab ---
  const handleAddManual = () => {
    const val = manualValue.trim();
    if (!val) { setManualError("Please enter a bin location."); return; }
    setManualError(null);
    fetcher.submit({ actionType: "addManualBinLocation", location: val }, { method: "post" });
    setManualValue("");
  };

  // Watch for manual add errors from server
  useEffect(() => {
    if (fetcher.data?.actionType === "addManualBinLocation" && !fetcher.data?.success) {
      setManualError(fetcher.data.error);
    }
  }, [fetcher.data]);

  // --- Manage tab ---
  const filteredManage = useMemo(() => {
    if (!searchManage) return binLocations;
    return binLocations.filter(l => l.toLowerCase().includes(searchManage.toLowerCase()));
  }, [binLocations, searchManage]);

  const handleDelete = (location) => {
    fetcher.submit({ actionType: "deleteBinLocation", location }, { method: "post" });
  };

  const handleClearAll = () => {
    if (window.confirm(`Delete all ${binLocations.length} bin locations? This cannot be undone.`)) {
      onClear();
    }
  };

  return (
    <Modal
      open={active}
      onClose={onClose}
      title="Bin Location Manager"
      size="large"
    >
      <div style={{ borderBottom: "1px solid var(--p-color-border)" }}>
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} fitted />
      </div>

      {/* ── Import File Tab ── */}
      {selectedTab === 0 && (
        <Modal.Section>
          <BlockStack gap="500">
            {fileError && (
              <Banner tone="critical" onDismiss={() => setFileError(null)}>
                <p>{fileError}</p>
              </Banner>
            )}

            {/* Drop zone */}
            <div
              onClick={() => !fileProcessing && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${file ? "#C9A273" : "var(--p-color-border)"}`,
                borderRadius: "var(--p-border-radius-300)",
                background: file ? "#F1ECE5" : "#FAF7F3",
                padding: "32px 24px",
                textAlign: "center",
                cursor: fileProcessing ? "wait" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <BlockStack gap="200" align="center">
                <div style={{ fontSize: "36px", lineHeight: 1 }}>{file ? "✅" : "📂"}</div>
                <Text variant="headingSm" fontWeight="semibold">
                  {file ? file.name : "Click to select a file"}
                </Text>
                {!file && <Text variant="bodySm" tone="subdued">CSV or TXT · Max 5MB</Text>}
                {file && (
                  <Text variant="bodySm" tone="subdued">
                    {(file.size / 1024).toFixed(1)} KB · {previewLocations.length} locations found
                  </Text>
                )}
              </BlockStack>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileSelect}
              style={{ display: "none" }}
              disabled={isSubmitting || fileProcessing}
            />

            {file && (
              <Button size="slim" variant="tertiary" onClick={handleFileReset} disabled={isSubmitting}>
                Choose a different file
              </Button>
            )}

            {/* Preview grid */}
            {previewLocations.length > 0 && (
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingXs" fontWeight="semibold">Preview ({previewLocations.length} locations)</Text>
                  <Badge tone="info">Duplicates will be skipped</Badge>
                </InlineStack>
                <div style={{
                  maxHeight: "220px",
                  overflowY: "auto",
                  border: "1px solid #D8BFA4",
                  borderRadius: "var(--p-border-radius-200)",
                  background: "#FAF7F3",
                  padding: "12px",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: "6px",
                }}>
                  {previewLocations.map((loc, i) => (
                    <div key={i} style={{
                      background: "var(--p-color-bg-surface)",
                      border: "1px solid var(--p-color-border)",
                      borderRadius: "var(--p-border-radius-150)",
                      padding: "6px 8px",
                      textAlign: "center",
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}>
                      {loc}
                    </div>
                  ))}
                </div>
              </BlockStack>
            )}

            {/* Supported formats hint */}
            <div style={{
              background: "#F1ECE5",
              borderRadius: "var(--p-border-radius-200)",
              padding: "12px 16px",
            }}>
              <BlockStack gap="100">
                <Text variant="bodyXs" fontWeight="semibold" tone="subdued">SUPPORTED FORMATS</Text>
                <Text variant="bodySm" tone="subdued">
                  One per line · Comma-separated · Space-separated · Semicolon-separated
                </Text>
                <Text variant="bodySm" tone="subdued" fontFamily="mono">
                  A1:1, A1:2, A1:3 &nbsp;·&nbsp; A1:1 A1:2 A1:3 &nbsp;·&nbsp; A1:1{"\n"}A1:2
                </Text>
              </BlockStack>
            </div>

            <Button
              variant="primary"
              onClick={handleFileImport}
              loading={isSubmitting && fetcher.formData?.get("actionType") === "importBinLocations"}
              disabled={!file || previewLocations.length === 0 || fileProcessing || isSubmitting}
              fullWidth
            >
              Import {previewLocations.length > 0 ? `${previewLocations.length} Locations` : ""}
            </Button>
          </BlockStack>
        </Modal.Section>
      )}

      {/* ── Manual Add Tab ── */}
      {selectedTab === 1 && (
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodySm" tone="subdued">
              Add individual bin locations one at a time. These are saved to the database and visible to all admin users.
            </Text>

            <InlineStack gap="200" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Bin Location"
                  value={manualValue}
                  onChange={(v) => { setManualValue(v); setManualError(null); }}
                  placeholder="e.g. A1:3"
                  autoComplete="off"
                  error={manualError}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddManual(); }}
                />
              </div>
              <div style={{ paddingBottom: manualError ? "22px" : "0" }}>
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  onClick={handleAddManual}
                  loading={isSubmitting && fetcher.formData?.get("actionType") === "addManualBinLocation"}
                  disabled={!manualValue.trim() || isSubmitting}
                >
                  Add
                </Button>
              </div>
            </InlineStack>

            {binLocations.length > 0 && (
              <BlockStack gap="200">
                <Text variant="headingXs" tone="subdued">Recently added</Text>
                <div style={{
                  maxHeight: "280px",
                  overflowY: "auto",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "var(--p-border-radius-200)",
                }}>
                  {[...binLocations].reverse().slice(0, 20).map((loc, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderBottom: i < Math.min(binLocations.length, 20) - 1 ? "1px solid var(--p-color-border-subdued)" : "none",
                    }}>
                      <Text variant="bodySm" fontFamily="mono">{loc}</Text>
                      <Button
                        icon={DeleteIcon}
                        variant="plain"
                        tone="critical"
                        size="micro"
                        onClick={() => handleDelete(loc)}
                        accessibilityLabel={`Delete ${loc}`}
                      />
                    </div>
                  ))}
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      )}

      {/* ── Manage Tab ── */}
      {selectedTab === 2 && (
        <Modal.Section>
          <BlockStack gap="400">
            {binLocations.length === 0 ? (
              <Box padding="800" style={{ textAlign: "center" }}>
                <BlockStack gap="200" align="center">
                  <Text variant="headingSm" tone="subdued">No bin locations yet</Text>
                  <Text variant="bodySm" tone="subdued">Import a file or add locations manually.</Text>
                </BlockStack>
              </Box>
            ) : (
              <>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingXs" tone="subdued">{binLocations.length} total locations</Text>
                  <Button
                    variant="plain"
                    tone="critical"
                    size="slim"
                    icon={DeleteIcon}
                    onClick={handleClearAll}
                    disabled={isSubmitting}
                  >
                    Clear All
                  </Button>
                </InlineStack>

                <TextField
                  label="Search locations"
                  labelHidden
                  placeholder="Search..."
                  value={searchManage}
                  onChange={setSearchManage}
                  prefix={<Icon source={SearchIcon} />}
                  clearButton
                  onClearButtonClick={() => setSearchManage("")}
                  autoComplete="off"
                />

                <div style={{
                  maxHeight: "340px",
                  overflowY: "auto",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "var(--p-border-radius-200)",
                }}>
                  {filteredManage.length === 0 ? (
                    <Box padding="400" style={{ textAlign: "center" }}>
                      <Text variant="bodySm" tone="subdued">No locations match your search.</Text>
                    </Box>
                  ) : (
                    filteredManage.map((loc, i) => (
                      <div key={i} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom: i < filteredManage.length - 1 ? "1px solid var(--p-color-border-subdued)" : "none",
                        background: i % 2 === 0 ? "transparent" : "#FAF7F3",
                      }}>
                        <Text variant="bodySm" fontFamily="mono">{loc}</Text>
                        <Button
                          icon={DeleteIcon}
                          variant="plain"
                          tone="critical"
                          size="micro"
                          onClick={() => handleDelete(loc)}
                          accessibilityLabel={`Delete ${loc}`}
                        />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </BlockStack>
        </Modal.Section>
      )}
    </Modal>
  );
}


/**
 * HELPER: BinEditor
 * Renders the picker panel via a React portal so it sits outside the
 * IndexTable DOM — this is the only reliable way to avoid Polaris table
 * row event interception swallowing clicks inside the picker.
 */
function BinEditor({ productId, initialBin, binLocations = [], assignedBins = {}, onBinChanged }) {
  const fetcher = useFetcher();
  const [bin, setBin] = useState(initialBin);
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedBin, setSelectedBin] = useState(null); // null = nothing chosen yet in this session
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [errorMessage, setErrorMessage] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const buttonRef = useRef(null);
  const searchRef = useRef(null);
  const [portalRoot, setPortalRoot] = useState(null);
  const panelRef = useRef(null);
  const panelId = useRef(`bin-editor-portal-panel-${productId.replace(/[^a-zA-Z0-9]/g, '-')}`).current;

  // Portal root — document.body, resolved client-side only
  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    setBin(initialBin);
  }, [initialBin]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.field === "bin") {
      setBin(fetcher.data.updatedValue);
      setIsOpen(false);
      setSelectedBin(null);
      setSearchValue("");
      setErrorMessage(null);
      // Refresh the page data so assignedBins map updates
      if (onBinChanged) setTimeout(() => onBinChanged(), 300);
    } else if (fetcher.data?.field === "bin" && fetcher.data?.error) {
      setErrorMessage(fetcher.data.error);
      // Auto-hide after 6 seconds
      setTimeout(() => setErrorMessage(null), 6000);
    }
  }, [fetcher.data]);

  // Position the panel below the button
  const openPicker = (e) => {
    e.stopPropagation();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPanelPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
    setSelectedBin(null);
    setSearchValue("");
    setHighlightedIndex(-1);
    setIsOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      // If click is on the button itself, ignore (openPicker handles toggle)
      if (buttonRef.current?.contains(e.target)) return;
      // If click is inside the portal panel, ignore
      const panel = document.getElementById(panelId);
      if (panel?.contains(e.target)) return;
      closePicker();
    };
    // Use capture phase so we get it before Polaris
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [isOpen, panelId]);

  // Auto-focus search when picker opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const closePicker = () => {
    setIsOpen(false);
    setSelectedBin(null);
    setSearchValue("");
    setHighlightedIndex(-1);
  };

  const filteredLocations = useMemo(() => {
    if (!searchValue) return binLocations;
    return binLocations.filter((loc) =>
      loc.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [searchValue, binLocations]);

  const handleSelectBin = (loc) => {
    // Block selection if bin is already in use by another product
    const status = getBinStatus(loc);
    if (status.inUse) {
      setErrorMessage(`"${loc}" is already assigned to "${status.usedBy}". Each bin can only be used by one product.`);
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }
    setSelectedBin(loc);
    setSearchValue("");
    setHighlightedIndex(-1);
  };

  const handleSave = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    fetcher.submit(
      { actionType: "updateBin", productId, binValue: selectedBin },
      { method: "post" }
    );
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((p) => Math.min(p + 1, filteredLocations.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((p) => Math.max(p - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) handleSelectBin(filteredLocations[highlightedIndex]);
        break;
      case "Escape":
        e.preventDefault();
        closePicker();
        break;
    }
  };

  // Check if a bin location is already in use by another product
  const getBinStatus = (loc) => {
    const assigned = assignedBins[loc];
    if (assigned && assigned.productId !== productId) {
      return { inUse: true, usedBy: assigned.productTitle };
    }
    return { inUse: false };
  };

  const handleClearBin = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowClearConfirm(true);
  };

  const confirmClear = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowClearConfirm(false);
    fetcher.submit(
      { actionType: "clearBin", productId },
      { method: "post" }
    );
  };

  const cancelClear = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowClearConfirm(false);
  };

  const isSaving = fetcher.state !== "idle";

  const panel = isOpen && portalRoot ? createPortal(
    <div
      id={panelId}
      ref={panelRef}
      style={{
        position: "absolute",
        top: panelPos.top,
        left: panelPos.left,
        zIndex: 9999,
        width: "260px",
        background: "#FAF7F3",
        border: "1px solid #D8BFA4",
        borderRadius: "var(--p-border-radius-300)",
        boxShadow: "0 4px 20px rgba(148, 85, 40, 0.12)",
        padding: "12px",
      }}
    >
      {selectedBin ? (
        /* ── Selected state: show bin + Save/Change ── */
        <BlockStack gap="200">
          <div style={{
            background: "#FAEBE1",
            border: "1px solid #C9A273",
            borderRadius: "var(--p-border-radius-200)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <InlineStack gap="150" blockAlign="center">
              <div style={{ color: "#C9A273", display: "flex" }}>
                <Icon source={LocationIcon} />
              </div>
              <Text variant="bodySm" fontWeight="semibold" fontFamily="mono">{selectedBin}</Text>
            </InlineStack>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", color: "#945528", fontSize: "12px", padding: "2px 6px", fontWeight: "600" }}
              onMouseDown={(e) => { e.stopPropagation(); setSelectedBin(null); setTimeout(() => searchRef.current?.focus(), 40); }}
            >
              Change
            </button>
          </div>
          <InlineStack gap="200">
            <button
              onMouseDown={handleSave}
              disabled={isSaving}
              style={{
                flex: 1,
                padding: "8px 16px",
                background: isSaving ? "#C9A273" : "#945528",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "var(--p-border-radius-200)",
                cursor: isSaving ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: "600",
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? "Saving..." : "Save Location"}
            </button>
            <button
              onMouseDown={(e) => { e.stopPropagation(); closePicker(); }}
              disabled={isSaving}
              style={{
                padding: "8px 12px",
                background: "none",
                border: "1px solid #D8BFA4",
                borderRadius: "var(--p-border-radius-200)",
                cursor: "pointer",
                fontSize: "13px",
                color: "#945528",
              }}
            >
              Cancel
            </button>
          </InlineStack>
        </BlockStack>
      ) : (
        /* ── Search state ── */
        <BlockStack gap="200">
          {binLocations.length === 0 ? (
            <Text variant="bodySm" tone="subdued">No bin locations available. Import locations first.</Text>
          ) : (
            <>
              <input
                ref={searchRef}
                type="text"
                value={searchValue}
                onChange={(e) => { setSearchValue(e.target.value); setHighlightedIndex(-1); }}
                onKeyDown={handleKeyDown}
                placeholder="Search bin location..."
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #D8BFA4",
                  borderRadius: "var(--p-border-radius-200)",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  background: "#FFFFFF",
                }}
              />
              <div style={{
                border: "1px solid #D8BFA4",
                borderRadius: "var(--p-border-radius-200)",
                maxHeight: "220px",
                overflowY: "auto",
                background: "#FFFFFF",
              }}>
                {filteredLocations.length === 0 ? (
                  <div style={{ padding: "12px", textAlign: "center", color: "#945528", fontSize: "13px" }}>
                    No matches found
                  </div>
                ) : (
                  filteredLocations.map((loc, idx) => {
                    const status = getBinStatus(loc);
                    return (
                      <div
                        key={idx}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (status.inUse) return; // Prevent selecting in-use bins
                          handleSelectBin(loc);
                        }}
                        style={{
                          padding: "9px 12px",
                          cursor: status.inUse ? "not-allowed" : "pointer",
                          borderBottom: idx < filteredLocations.length - 1 ? "1px solid var(--p-color-border-subdued)" : "none",
                          background: status.inUse ? "#FFF4E5" : (highlightedIndex === idx ? "#F1ECE5" : "transparent"),
                          fontFamily: "monospace",
                          fontSize: "13px",
                          userSelect: "none",
                          opacity: status.inUse ? 0.7 : 1,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "8px",
                        }}
                        onMouseEnter={() => !status.inUse && setHighlightedIndex(idx)}
                        title={status.inUse ? `In use by: ${status.usedBy}` : ""}
                      >
                        <span>{loc}</span>
                        {status.inUse && (
                          <span style={{
                            fontSize: "10px",
                            fontWeight: "600",
                            color: "#B44D12",
                            background: "#FFECD6",
                            padding: "2px 6px",
                            borderRadius: "10px",
                            whiteSpace: "nowrap",
                            fontFamily: "inherit",
                          }}>
                            🔒 In Use
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
          <button
            onMouseDown={(e) => { e.stopPropagation(); closePicker(); }}
            style={{
              width: "100%",
              padding: "7px",
              background: "none",
              border: "1px solid #D8BFA4",
              borderRadius: "var(--p-border-radius-200)",
              cursor: "pointer",
              fontSize: "13px",
              color: "#945528",
            }}
          >
            Cancel
          </button>
        </BlockStack>
      )}
    </div>,
    portalRoot
  ) : null;

  return (
    <>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <button
          ref={buttonRef}
          onMouseDown={openPicker}
          style={{
            padding: "5px 12px",
            borderRadius: "var(--p-border-radius-200)",
            border: bin ? "1px solid #D8BFA4" : "1px solid #C9A273",
            background: bin ? "#FAF7F3" : "#FAEBE1",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: bin ? "500" : "600",
            color: bin ? "var(--p-color-text)" : "#7a4800",
            whiteSpace: "nowrap",
          }}
        >
          {bin ? `📍 ${bin}` : "+ Assign Bin"}
        </button>
        {bin && (
          <button
            onMouseDown={handleClearBin}
            disabled={isSaving}
            title="Clear bin location"
            style={{
              padding: "4px 8px",
              borderRadius: "var(--p-border-radius-200)",
              border: "1px solid #E0B4B4",
              background: "#FFF0F0",
              cursor: isSaving ? "not-allowed" : "pointer",
              fontSize: "11px",
              fontWeight: "600",
              color: "#B44D12",
              whiteSpace: "nowrap",
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            ✕ Clear
          </button>
        )}
        {/* Inline clear confirmation tooltip */}
        {showClearConfirm && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: "0",
            marginTop: "6px",
            padding: "10px 14px",
            background: "#FAF7F3",
            border: "1px solid #D8BFA4",
            borderRadius: "var(--p-border-radius-300)",
            boxShadow: "0 4px 16px rgba(148, 85, 40, 0.12)",
            zIndex: 10001,
            width: "220px",
          }}>
            <div style={{ fontSize: "12px", color: "#945528", marginBottom: "8px", fontWeight: "500" }}>
              Remove <strong>{bin}</strong> from this product?
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onMouseDown={confirmClear}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  background: "#B44D12",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "var(--p-border-radius-200)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                Yes, Clear
              </button>
              <button
                onMouseDown={cancelClear}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  background: "none",
                  border: "1px solid #D8BFA4",
                  borderRadius: "var(--p-border-radius-200)",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "#945528",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {errorMessage && !showClearConfirm && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: "0",
            marginTop: "4px",
            padding: "8px 12px",
            background: "#FFF4E5",
            border: "1px solid #FFA500",
            borderRadius: "var(--p-border-radius-200)",
            fontSize: "12px",
            color: "#8B4513",
            whiteSpace: "normal",
            maxWidth: "300px",
            zIndex: 10000,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}>
            ⚠️ {errorMessage}
          </div>
        )}
      </div>
      {panel}
    </>
  );
}


/**
 * HELPER: SetupMetafieldModal
 * Creates the bin_locations metafield definition in the store so bin
 * assignments can be saved. Only needed once per store.
 */
function SetupMetafieldModal({ active, onClose, fetcher }) {
  const handleSetup = () => {
    fetcher.load("/app/fabric-scanner-system/setup-metafields");
  };

  const isLoading = fetcher.state === "loading";

  return (
    <Modal
      open={active}
      onClose={onClose}
      title="Setup Bin Location Metafield"
      primaryAction={{
        content: "Create Metafield",
        onAction: handleSetup,
        loading: isLoading,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text variant="bodyMd">
            This will create the <strong>Bin Locations</strong> metafield definition in your store so bin assignments can be saved to products.
          </Text>

          <div style={{
            background: "#F1ECE5",
            border: "1px solid #C9A273",
            borderRadius: "var(--p-border-radius-200)",
            padding: "12px 16px",
          }}>
            <BlockStack gap="200">
              <Text variant="headingXs" fontWeight="semibold">Metafield Details</Text>
              <Text variant="bodySm" tone="subdued">
                <strong>Namespace:</strong> custom<br />
                <strong>Key:</strong> bin_locations<br />
                <strong>Type:</strong> Single line text<br />
                <strong>Owner:</strong> Product
              </Text>
            </BlockStack>
          </div>

          <Text variant="bodySm" tone="subdued">
            If the metafield already exists in your store, this operation will do nothing — it is safe to run multiple times.
          </Text>

          <Banner tone="info">
            <p>
              <strong>When do I need this?</strong><br />
              If bin assignments aren't saving, it's likely because the metafield definition doesn't exist in your store yet. Run this setup once to fix it.
            </p>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
