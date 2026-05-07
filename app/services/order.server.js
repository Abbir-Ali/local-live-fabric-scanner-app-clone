export async function getFabricOrders(admin, cursor = null, direction = "next", searchQuery = "", limit = 5) {
  try {
    const paginationArgs = direction === "prev" ? `last: ${limit}, before: "${cursor}"` : `first: ${limit}, after: ${cursor ? `"${cursor}"` : "null"}`;

    // Build the query string with search - match the exact format used in count queries
    let queryString = "fulfillment_status:unfulfilled AND (tag:fabric-scanner)";
    if (searchQuery && searchQuery.trim()) {
      // Search by order number, customer name, or email
      const searchTerm = searchQuery.trim();
      queryString += ` AND (name:*${searchTerm}* OR email:*${searchTerm}* OR customer.first_name:*${searchTerm}* OR customer.last_name:*${searchTerm}*)`;
    }

    console.log(`[PENDING ORDERS] Query string:`, queryString);

    const response = await admin.graphql(
      `#graphql
        query getFabricOrders($query: String) {
          orders(${paginationArgs}, reverse: true, query: $query) {
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                email
                customer {
                  id
                  firstName
                  lastName
                  email
                  phone
                }
                totalPriceSet { shopMoney { amount currencyCode } }
                subtotalPriceSet { shopMoney { amount } }
                totalTaxSet { shopMoney { amount } }
                shippingLine { title originalPriceSet { shopMoney { amount } } }
                shippingAddress { name company address1 address2 city zip provinceCode country phone }
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      sku
                      unfulfilledQuantity
                      originalUnitPriceSet { shopMoney { amount } }
                      variant {
                        barcode
                        sku
                        product {
                          id
                          productType
                          featuredImage {
                            url
                          }
                          binLocation: metafield(namespace: "custom", key: "bin_locations") {
                            namespace
                            key
                            value
                          }
                        }
                      }
                    }
                  }
                }
                fulfillmentOrders(first: 10) {
                  edges {
                    node {
                      id
                      status
                      lineItems(first: 50) {
                        edges {
                          node {
                            id
                            totalQuantity
                            remainingQuantity
                            lineItem {
                              id
                              title
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      { variables: { query: queryString } }
    );
    const responseJson = await response.json();
    console.log(`[PENDING ORDERS] Response:`, {
      edgesCount: responseJson.data?.orders?.edges?.length || 0,
      hasErrors: !!responseJson.errors,
      errors: responseJson.errors,
      fullResponse: JSON.stringify(responseJson, null, 2)
    });

    if (responseJson.errors) {
      console.error('[PENDING ORDERS] GraphQL Errors:', responseJson.errors);
    }

    return {
      edges: responseJson.data?.orders?.edges || [],
      pageInfo: responseJson.data?.orders?.pageInfo
    };
  } catch (error) {
    console.error("Unfulfilled Service Error:", error);
    return { edges: [], pageInfo: null };
  }
}

export async function getFulfilledFabricOrders(admin, cursor = null, direction = "next", searchQuery = "", limit = 5) {
  try {
    const paginationArgs = direction === "prev" ? `last: ${limit}, before: "${cursor}"` : `first: ${limit}, after: ${cursor ? `"${cursor}"` : "null"}`;

    // Build the query string with search - match the exact format used in count queries
    let queryString = "fulfillment_status:fulfilled AND (tag:fabric-scanner)";
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      queryString += ` AND (name:*${searchTerm}* OR email:*${searchTerm}* OR customer.first_name:*${searchTerm}* OR customer.last_name:*${searchTerm}*)`;
    }

    const response = await admin.graphql(
      `#graphql
        query getFulfilledOrders($query: String) {
          orders(${paginationArgs}, reverse: true, query: $query) {
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            edges {
              node {
                id
                name
                updatedAt
                displayFinancialStatus
                email
                customer {
                  id
                  firstName
                  lastName
                  email
                  phone
                }
                totalPriceSet { shopMoney { amount currencyCode } }
                shippingAddress {
                  name
                  company
                  address1
                  address2
                  city
                  zip
                  provinceCode
                  country
                  phone
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      sku
                      unfulfilledQuantity
                      variant {
                         barcode
                         product {
                           featuredImage {
                             url
                           }
                         }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      { variables: { query: queryString } }
    );
    const responseJson = await response.json();
    return {
      edges: responseJson.data?.orders?.edges || [],
      pageInfo: responseJson.data?.orders?.pageInfo
    };
  } catch (error) {
    console.error("Fulfilled Service Error:", error);
    return { edges: [], pageInfo: null };
  }
}

export async function getFabricInventory(admin, cursor = null, { query = "", sortKey = "ID", reverse = false, direction = "next", locationId = null, isBinSearch = false, limit = 5 } = {}) {
  try {
    // For BIN searches, fetch more items to ensure we get products from all BIN locations
    const fetchLimit = isBinSearch ? 100 : limit;

    // For BIN searches, don't use sorting to ensure we get diverse products
    const activeSortKey = (query && !isBinSearch) ? "RELEVANCE" : (isBinSearch ? "ID" : sortKey);
    const activeReverse = (query && !isBinSearch) ? false : (isBinSearch ? false : reverse);

    let finalQuery;
    if (isBinSearch) {
      // For BIN searches, fetch all swatch items (no text search) - we'll filter by BIN on server
      finalQuery = 'product_type:"Swatch Item"';
    } else if (query) {
      // Check if query looks like a SKU (alphanumeric with dashes/spaces)
      const escapedQuery = query.replace(/"/g, '\\"');
      const looksLikeSKU = /^[A-Z0-9\s\-]+$/i.test(query);

      if (looksLikeSKU) {
        // Use SKU filter with wildcards for partial matching
        finalQuery = `product_type:"Swatch Item" AND sku:*${escapedQuery}*`;
      } else {
        // General search for title and other fields
        finalQuery = `product_type:"Swatch Item" AND "${escapedQuery}"`;
      }
    } else {
      // No search query
      finalQuery = 'product_type:"Swatch Item"';
    }

    const paginationArgs = direction === "prev" ? `last: ${fetchLimit}, before: "${cursor}"` : `first: ${fetchLimit}, after: ${cursor ? `"${cursor}"` : "null"}`;

    console.log(`[INVENTORY SEARCH] Variables:`, { finalQuery, activeSortKey, activeReverse, isBinSearch, fetchLimit, requestedLimit: limit, pagination: isBinSearch ? `Fetch ${fetchLimit}, filter, show ${limit}` : `${limit} items` });

    let resJson;
    try {
      const response = await admin.graphql(
        `#graphql
        query getInventory($query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
          products(${paginationArgs}, query: $query, sortKey: $sortKey, reverse: $reverse) {
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            edges {
              node {
                id
                legacyResourceId
                title
                totalInventory
                featuredImage {
                  url
                }
                binLocation: metafield(namespace: "custom", key: "bin_locations") {
                  namespace
                  key
                  value
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      sku
                      barcode
                      inventoryItem {
                        id
                        inventoryLevels(first: 10) {
                          edges {
                            node {
                              id
                              location { id name }
                              quantities(names: ["available"]) {
                                name
                                quantity
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { variables: { query: finalQuery, sortKey: activeSortKey, reverse: activeReverse } }
      );
      resJson = await response.json();
    } catch (err) {
      console.error("[INVENTORY SEARCH] FATAL ERROR:", err);
      throw err;
    }

    if (resJson.errors) {
      console.error("[INVENTORY SEARCH] GRAPHQL ERRORS:", JSON.stringify(resJson.errors, null, 2));
    }

    let edges = resJson.data?.products?.edges || [];

    // Debug: Log metafields for first few products
    if (edges.length > 0) {
      console.log(`[DEBUG METAFIELDS] First product bin_locations:`, edges[0].node.binLocation?.value || "null");
    }

    // Apply BIN filtering server-side if this is a BIN search
    if (isBinSearch && query) {
      const searchLower = query.toLowerCase().trim();
      const beforeFilter = edges.length;
      console.log(`[BIN SEARCH DEBUG] Filtering ${beforeFilter} products for BIN: "${query}"`);

      edges = edges.filter((edge) => {
        const binValue = (edge.node.binLocation?.value || '').toLowerCase().trim();

        // Debug: Log all BIN values we encounter
        if (binValue) {
          console.log(`[BIN VALUE FOUND] Product "${edge.node.title}" has BIN: "${binValue}"`);
        }

        // Try multiple matching strategies
        const exactMatch = binValue === searchLower;
        const containsMatch = binValue.includes(searchLower);
        const normalizedMatch = binValue.replace(/\s+/g, '').includes(searchLower.replace(/\s+/g, ''));

        const matches = binValue && (exactMatch || containsMatch || normalizedMatch);

        if (matches) {
          console.log(`[BIN MATCH] Query "${query}" matched BIN "${binValue}" for product ${edge.node.title} (exact: ${exactMatch}, contains: ${containsMatch}, normalized: ${normalizedMatch})`);
        }
        return matches;
      });
      console.log(`[INVENTORY BIN FILTER] Server-side filtered from ${beforeFilter} to ${edges.length} items for BIN search: "${query}"`);

      // If no matches found, log all available BIN values for debugging
      if (edges.length === 0) {
        console.log(`[BIN SEARCH DEBUG] No matches found for "${query}". Available BIN values in this batch:`);
        resJson.data?.products?.edges?.forEach(edge => {
          if (edge.node.binLocation?.value) {
            console.log(`  - "${edge.node.binLocation.value}" (${edge.node.title})`);
          }
        });
      }
    }

    console.log(`[INVENTORY SEARCH] Success: Found ${edges.length} products for query: "${finalQuery}"${isBinSearch ? ' (BIN filtered)' : ''}`);
    if (edges.length === 0 && !query) {
      console.log("[INVENTORY SEARCH] WARNING: No products found with 'Swatch Item' type. Checking all products...");
    }

    return {
      edges: edges,
      pageInfo: resJson.data?.products?.pageInfo
    };
  } catch (error) {
    console.error("Inventory Service Error:", error);
    return { edges: [], pageInfo: null, error: error.message };
  }
}
export async function getPartiallyFulfilledOrders(admin, cursor = null, direction = "next", searchQuery = "", limit = 5) {
  try {
    const paginationArgs = direction === "prev" ? `last: ${limit}, before: "${cursor}"` : `first: ${limit}, after: ${cursor ? `"${cursor}"` : "null"}`;

    // Build the query string with search - match the exact format used in count queries
    let queryString = "fulfillment_status:partial AND (tag:fabric-scanner)";
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      queryString += ` AND (name:*${searchTerm}* OR email:*${searchTerm}* OR customer.first_name:*${searchTerm}* OR customer.last_name:*${searchTerm}*)`;
    }

    const response = await admin.graphql(
      `#graphql
        query getPartiallyFulfilledOrders($query: String) {
          orders(${paginationArgs}, reverse: true, query: $query) {
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            edges {
              node {
                id
                name
                createdAt
                updatedAt
                displayFinancialStatus
                email
                customer {
                  id
                  firstName
                  lastName
                  email
                  phone
                }
                totalPriceSet { shopMoney { amount currencyCode } }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      sku
                      unfulfilledQuantity
                      variant {
                        barcode
                        sku
                        product {
                          id
                          productType
                          featuredImage {
                            url
                          }
                          binLocation: metafield(namespace: "custom", key: "bin_locations") {
                            namespace
                            key
                            value
                          }
                        }
                      }
                    }
                  }
                }
                fulfillmentOrders(first: 10) {
                  edges {
                    node {
                      id
                      status
                      lineItems(first: 50) {
                        edges {
                          node {
                            id
                            totalQuantity
                            remainingQuantity
                            lineItem {
                              id
                              title
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      { variables: { query: queryString } }
    );
    const responseJson = await response.json();
    return {
      edges: responseJson.data?.orders?.edges || [],
      pageInfo: responseJson.data?.orders?.pageInfo
    };
  } catch (error) {
    console.error("Partially Fulfilled Service Error:", error);
    return { edges: [], pageInfo: null };
  }
}

export async function getFulfilledOrdersCount(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
        query getFulfilledCount {
          orders(first: 1, query: "fulfillment_status:fulfilled AND (tag:fabric-scanner)") {
             nodes { id }
          }
        }`
    );
    const resJson = await response.json();
    // In Shopify GraphQL, the total count is available if you request it via connection,
    // but the simplest way here is to use the nodes count or a dedicated count query if allowed.
    // However, the standard way is to use the query above.
    // To get the ACTUAL total count efficiently:
    const countResponse = await admin.graphql(
      `#graphql
      query getCount {
        ordersCount(query: "fulfillment_status:fulfilled AND (tag:fabric-scanner)") {
          count
        }
      }`
    );
    const countData = await countResponse.json();
    return countData.data?.ordersCount?.count || 0;
  } catch (error) {
    console.error("Fulfilled Count Error:", error);
    return 0;
  }
}

export async function getPendingOrdersCount(admin) {
  try {
    const countResponse = await admin.graphql(
      `#graphql
      query getPendingCount {
        ordersCount(query: "fulfillment_status:unfulfilled AND (tag:fabric-scanner)") {
          count
        }
      }`
    );
    const countData = await countResponse.json();
    return countData.data?.ordersCount?.count || 0;
  } catch (error) {
    console.error("Pending Count Error:", error);
    return 0;
  }
}

export async function getPartialOrdersCount(admin) {
  try {
    const countResponse = await admin.graphql(
      `#graphql
      query getPartialCount {
        ordersCount(query: "fulfillment_status:partial AND (tag:fabric-scanner)") {
          count
        }
      }`
    );
    const countData = await countResponse.json();
    return countData.data?.ordersCount?.count || 0;
  } catch (error) {
    console.error("Partial Count Error:", error);
    return 0;
  }
}

export async function getShopLocations(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
      query getLocations {
        locations(first: 10) {
          nodes {
            id
            name
            isActive
            shipsInventory
          }
        }
      }`
    );
    const resJson = await response.json();
    return resJson.data?.locations?.nodes || [];
  } catch (error) {
    console.error("Get Locations Error:", error);
    return [];
  }
}

export async function getAllFabricInventory(admin) {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  try {
    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
        query getAllInventory($cursor: String) {
          products(first: 50, after: $cursor, query: "product_type:'Swatch Item'") {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                title
                binLocation: metafield(namespace: "custom", key: "bin_locations") {
                  value
                }
                variants(first: 1) {
                  edges {
                    node {
                      sku
                      barcode
                    }
                  }
                }
              }
            }
          }
        }`,
        { variables: { cursor } }
      );

      const resJson = await response.json();
      const products = resJson.data?.products?.edges || [];
      allProducts = allProducts.concat(products.map(p => {
        return {
          title: p.node.title,
          sku: p.node.variants.edges[0]?.node?.sku || "N/A",
          barcode: p.node.variants.edges[0]?.node?.barcode || "",
          binNumber: p.node.binLocation?.value || ""
        };
      }));

      hasNextPage = resJson.data?.products?.pageInfo.hasNextPage;
      cursor = resJson.data?.products?.pageInfo.endCursor;
    }
    return allProducts;
  } catch (error) {
    console.error("GetAllInventory Error:", error);
    return [];
  }
}

/**
 * Get all assigned bin locations across products.
 * Returns a map of binLocation → { productId, productTitle }
 * Used to enforce uniqueness — a bin location can only be assigned to one product at a time.
 */
export async function getAssignedBinLocations(admin) {
  const assignedBins = {};
  let hasNextPage = true;
  let cursor = null;

  try {
    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
        query getAssignedBins($cursor: String) {
          products(first: 100, after: $cursor, query: "product_type:'Swatch Item'") {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                title
                binLocation: metafield(namespace: "custom", key: "bin_locations") {
                  value
                }
              }
            }
          }
        }`,
        { variables: { cursor } }
      );

      const resJson = await response.json();

      if (resJson.errors) {
        console.error("[getAssignedBinLocations] GraphQL errors:", resJson.errors);
        break;
      }

      const products = resJson.data?.products?.edges || [];

      for (const { node } of products) {
        const binValue = node.binLocation?.value?.trim();
        if (binValue) {
          assignedBins[binValue] = {
            productId: node.id,
            productTitle: node.title,
          };
        }
      }

      hasNextPage = resJson.data?.products?.pageInfo?.hasNextPage || false;
      cursor = resJson.data?.products?.pageInfo?.endCursor || null;
    }

    return assignedBins;
  } catch (error) {
    console.error("[getAssignedBinLocations] Error:", error);
    return {};
  }
}

export async function getGlobalInventoryStats(admin, locationId) {
  let stats = { total: 0, lowStock: 0, outOfStock: 0 };
  let hasNextPage = true;
  let cursor = null;

  try {
    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
        query getGlobalStats($cursor: String) {
          products(first: 100, after: $cursor, query: "product_type:'Swatch Item'") {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                variants(first: 1) {
                  edges {
                    node {
                      inventoryItem {
                        inventoryLevel(locationId: "${locationId}") {
                          quantities(names: ["available"]) {
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { variables: { cursor } }
      );

      const resJson = await response.json();
      if (resJson.errors) {
        console.error("[GLOBAL STATS] GraphQL Errors:", JSON.stringify(resJson.errors, null, 2));
        break;
      }

      const products = resJson.data?.products?.edges || [];
      products.forEach(p => {
        const variant = p.node.variants.edges[0]?.node;
        const available = variant?.inventoryItem?.inventoryLevel?.quantities[0]?.quantity || 0;

        stats.total++;
        if (available <= 0) stats.outOfStock++;
        else if (available < 10) stats.lowStock++;
      });

      hasNextPage = resJson.data?.products?.pageInfo.hasNextPage;
      cursor = resJson.data?.products?.pageInfo.endCursor;
    }
    return stats;
  } catch (error) {
    console.error("GetGlobalInventoryStats Error:", error);
    return stats;
  }
}
