export async function getFabricOrders(admin, cursor = null, direction = "next", searchQuery = "", limit = 5) {
  try {
    // Build the query string with search - match the exact format used in count queries
    let queryString = "fulfillment_status:unfulfilled AND (tag:fabric-scanner)";
    let isNoteSearch = false;

    if (searchQuery && searchQuery.trim()) {
      // Search by order number, customer name, or email via Shopify query syntax
      // Note: Shopify API does not support `note:` filter, so note search is done server-side
      const searchTerm = searchQuery.trim();
      queryString += ` AND (name:*${searchTerm}* OR email:*${searchTerm}* OR customer.first_name:*${searchTerm}* OR customer.last_name:*${searchTerm}*)`;
      isNoteSearch = true; // Always attempt note matching as fallback
    }

    // If searching, fetch more to allow server-side note filtering
    const fetchLimit = (searchQuery && searchQuery.trim()) ? Math.max(limit, 25) : limit;
    const paginationArgs = direction === "prev" ? `last: ${fetchLimit}, before: "${cursor}"` : `first: ${fetchLimit}, after: ${cursor ? `"${cursor}"` : "null"}`;

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
                note
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
      errors: responseJson.errors
    });

    if (responseJson.errors) {
      console.error('[PENDING ORDERS] GraphQL Errors:', responseJson.errors);
    }

    let edges = responseJson.data?.orders?.edges || [];
    let pageInfo = responseJson.data?.orders?.pageInfo;

    // If standard search returned no results and we have a search query, try note-based search
    if (edges.length === 0 && isNoteSearch && searchQuery && searchQuery.trim()) {
      console.log(`[PENDING ORDERS] No results from standard search, trying note-based search for: "${searchQuery}"`);
      // Fetch orders without the text search filter, then filter by note server-side
      const noteQueryString = "fulfillment_status:unfulfilled AND (tag:fabric-scanner)";
      const notePaginationArgs = direction === "prev" ? `last: 50, before: "${cursor}"` : `first: 50, after: ${cursor ? `"${cursor}"` : "null"}`;

      const noteResponse = await admin.graphql(
        `#graphql
          query getFabricOrdersByNote($query: String) {
            orders(${notePaginationArgs}, reverse: true, query: $query) {
              pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
              edges {
                node {
                  id
                  name
                  note
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
        { variables: { query: noteQueryString } }
      );
      const noteResponseJson = await noteResponse.json();
      const allEdges = noteResponseJson.data?.orders?.edges || [];
      const searchLower = searchQuery.trim().toLowerCase();

      // Filter by note content
      edges = allEdges.filter(edge => {
        const note = (edge.node.note || '').toLowerCase();
        return note.includes(searchLower);
      });

      console.log(`[PENDING ORDERS] Note search: filtered ${allEdges.length} orders to ${edges.length} matching note "${searchQuery}"`);
      // For note-based search, pagination is handled differently
      pageInfo = edges.length > 0 ? noteResponseJson.data?.orders?.pageInfo : null;
      edges = edges.slice(0, limit);
    } else {
      // Trim to requested limit if we fetched more
      edges = edges.slice(0, limit);
    }

    return {
      edges,
      pageInfo
    };
  } catch (error) {
    console.error("Unfulfilled Service Error:", error);
    return { edges: [], pageInfo: null };
  }
}

export async function getFulfilledFabricOrders(admin, cursor = null, direction = "next", searchQuery = "", limit = 5) {
  try {
    // Build the query string with search - match the exact format used in count queries
    let queryString = "fulfillment_status:fulfilled AND (tag:fabric-scanner)";
    let isNoteSearch = false;

    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      queryString += ` AND (name:*${searchTerm}* OR email:*${searchTerm}* OR customer.first_name:*${searchTerm}* OR customer.last_name:*${searchTerm}*)`;
      isNoteSearch = true;
    }

    const fetchLimit = (searchQuery && searchQuery.trim()) ? Math.max(limit, 25) : limit;
    const paginationArgs = direction === "prev" ? `last: ${fetchLimit}, before: "${cursor}"` : `first: ${fetchLimit}, after: ${cursor ? `"${cursor}"` : "null"}`;

    const response = await admin.graphql(
      `#graphql
        query getFulfilledOrders($query: String) {
          orders(${paginationArgs}, reverse: true, query: $query) {
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            edges {
              node {
                id
                name
                note
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

    let edges = responseJson.data?.orders?.edges || [];
    let pageInfo = responseJson.data?.orders?.pageInfo;

    // If standard search returned no results and we have a search query, try note-based search
    if (edges.length === 0 && isNoteSearch && searchQuery && searchQuery.trim()) {
      console.log(`[FULFILLED ORDERS] No results from standard search, trying note-based search for: "${searchQuery}"`);
      const noteQueryString = "fulfillment_status:fulfilled AND (tag:fabric-scanner)";
      const notePaginationArgs = direction === "prev" ? `last: 50, before: "${cursor}"` : `first: 50, after: ${cursor ? `"${cursor}"` : "null"}`;

      const noteResponse = await admin.graphql(
        `#graphql
          query getFulfilledOrdersByNote($query: String) {
            orders(${notePaginationArgs}, reverse: true, query: $query) {
              pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
              edges {
                node {
                  id
                  name
                  note
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
        { variables: { query: noteQueryString } }
      );
      const noteResponseJson = await noteResponse.json();
      const allEdges = noteResponseJson.data?.orders?.edges || [];
      const searchLower = searchQuery.trim().toLowerCase();

      edges = allEdges.filter(edge => {
        const note = (edge.node.note || '').toLowerCase();
        return note.includes(searchLower);
      });

      console.log(`[FULFILLED ORDERS] Note search: filtered ${allEdges.length} orders to ${edges.length} matching note "${searchQuery}"`);
      pageInfo = edges.length > 0 ? noteResponseJson.data?.orders?.pageInfo : null;
      edges = edges.slice(0, limit);
    } else {
      edges = edges.slice(0, limit);
    }

    return {
      edges,
      pageInfo
    };
  } catch (error) {
    console.error("Fulfilled Service Error:", error);
    return { edges: [], pageInfo: null };
  }
}

export async function getFabricInventory(admin, cursor = null, { query = "", sortKey = "ID", reverse = false, direction = "next", locationId = null, isBinSearch = false, limit = 5 } = {}) {
  try {
    // For BIN searches, paginate through ALL products since BIN is a metafield (not indexed by Shopify)
    if (isBinSearch && query) {
      let allMatches = [];
      let binCursor = null;
      let hasMore = true;
      const searchLower = query.toLowerCase().trim();

      console.log(`[BIN SEARCH] Scanning all products for BIN: "${query}"`);

      while (hasMore) {
        const binPaginationArgs = `first: 100, after: ${binCursor ? `"${binCursor}"` : "null"}`;

        const binResponse = await admin.graphql(
          `#graphql
          query getBinProducts($query: String) {
            products(${binPaginationArgs}, query: $query) {
              pageInfo { hasNextPage endCursor }
              edges {
                node {
                  id
                  legacyResourceId
                  title
                  totalInventory
                  featuredImage { url }
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
          { variables: { query: 'product_type:"Swatch Item"' } }
        );

        const binResJson = await binResponse.json();
        if (binResJson.errors) {
          console.error("[BIN SEARCH] GraphQL errors:", binResJson.errors);
          break;
        }

        const batchEdges = binResJson.data?.products?.edges || [];

        // Filter this batch for BIN matches
        const matches = batchEdges.filter((edge) => {
          const binValue = (edge.node.binLocation?.value || '').toLowerCase().trim();
          if (!binValue) return false;
          return binValue === searchLower || binValue.includes(searchLower) || binValue.replace(/\s+/g, '').includes(searchLower.replace(/\s+/g, ''));
        });

        allMatches = allMatches.concat(matches);

        hasMore = binResJson.data?.products?.pageInfo?.hasNextPage || false;
        binCursor = binResJson.data?.products?.pageInfo?.endCursor || null;

        // Stop early if we have enough matches
        if (allMatches.length >= limit) {
          break;
        }
      }

      console.log(`[BIN SEARCH] Found ${allMatches.length} matches for BIN: "${query}"`);

      return {
        edges: allMatches.slice(0, limit),
        pageInfo: { hasNextPage: allMatches.length > limit, hasPreviousPage: false, startCursor: null, endCursor: null }
      };
    }

    // Normal (non-BIN) search logic
    const activeSortKey = (query && !isBinSearch) ? "RELEVANCE" : sortKey;
    const activeReverse = (query && !isBinSearch) ? false : reverse;

    let finalQuery;
    if (query) {
      // Check if query looks like a SKU (alphanumeric with dashes, no spaces, typically short codes)
      const escapedQuery = query.replace(/"/g, '\\"');
      const looksLikeSKU = /^[A-Z0-9\-]+$/i.test(query) && !query.includes(' ');

      if (looksLikeSKU) {
        // SKU fragment without spaces — use wildcards for partial matching
        finalQuery = `product_type:"Swatch Item" AND sku:*${escapedQuery}*`;
      } else if (/^[A-Z0-9\s\-]+$/i.test(query) && query.includes(' ') && query.length < 20) {
        // SKU with space (e.g. "DC6198-EVA 1") — try exact SKU match first
        finalQuery = `product_type:"Swatch Item" AND sku:"${escapedQuery}"`;
      } else {
        // General search — full-text search across title and other indexed fields
        // Wrap in quotes for phrase matching on multi-word queries
        finalQuery = `product_type:"Swatch Item" AND "${escapedQuery}"`;
      }
    } else {
      // No search query
      finalQuery = 'product_type:"Swatch Item"';
    }

    const paginationArgs = direction === "prev" ? `last: ${limit}, before: "${cursor}"` : `first: ${limit}, after: ${cursor ? `"${cursor}"` : "null"}`;

    console.log(`[INVENTORY SEARCH] Variables:`, { finalQuery, activeSortKey, activeReverse, limit });

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

    console.log(`[INVENTORY SEARCH] Success: Found ${edges.length} products for query: "${finalQuery}"`);
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
    // Build the query string with search - match the exact format used in count queries
    let queryString = "fulfillment_status:partial AND (tag:fabric-scanner)";
    let isNoteSearch = false;

    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      queryString += ` AND (name:*${searchTerm}* OR email:*${searchTerm}* OR customer.first_name:*${searchTerm}* OR customer.last_name:*${searchTerm}*)`;
      isNoteSearch = true;
    }

    const fetchLimit = (searchQuery && searchQuery.trim()) ? Math.max(limit, 25) : limit;
    const paginationArgs = direction === "prev" ? `last: ${fetchLimit}, before: "${cursor}"` : `first: ${fetchLimit}, after: ${cursor ? `"${cursor}"` : "null"}`;

    const response = await admin.graphql(
      `#graphql
        query getPartiallyFulfilledOrders($query: String) {
          orders(${paginationArgs}, reverse: true, query: $query) {
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            edges {
              node {
                id
                name
                note
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

    let edges = responseJson.data?.orders?.edges || [];
    let pageInfo = responseJson.data?.orders?.pageInfo;

    // If standard search returned no results and we have a search query, try note-based search
    if (edges.length === 0 && isNoteSearch && searchQuery && searchQuery.trim()) {
      console.log(`[PARTIAL ORDERS] No results from standard search, trying note-based search for: "${searchQuery}"`);
      const noteQueryString = "fulfillment_status:partial AND (tag:fabric-scanner)";
      const notePaginationArgs = direction === "prev" ? `last: 50, before: "${cursor}"` : `first: 50, after: ${cursor ? `"${cursor}"` : "null"}`;

      const noteResponse = await admin.graphql(
        `#graphql
          query getPartialOrdersByNote($query: String) {
            orders(${notePaginationArgs}, reverse: true, query: $query) {
              pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
              edges {
                node {
                  id
                  name
                  note
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
        { variables: { query: noteQueryString } }
      );
      const noteResponseJson = await noteResponse.json();
      const allEdges = noteResponseJson.data?.orders?.edges || [];
      const searchLower = searchQuery.trim().toLowerCase();

      edges = allEdges.filter(edge => {
        const note = (edge.node.note || '').toLowerCase();
        return note.includes(searchLower);
      });

      console.log(`[PARTIAL ORDERS] Note search: filtered ${allEdges.length} orders to ${edges.length} matching note "${searchQuery}"`);
      pageInfo = edges.length > 0 ? noteResponseJson.data?.orders?.pageInfo : null;
      edges = edges.slice(0, limit);
    } else {
      edges = edges.slice(0, limit);
    }

    return {
      edges,
      pageInfo
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

export async function getLowStockProducts(admin, locationId) {
  let lowStockItems = [];
  let hasNextPage = true;
  let cursor = null;

  try {
    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
        query getLowStockProducts($cursor: String) {
          products(first: 100, after: $cursor, query: "product_type:'Swatch Item'") {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                title
                binLocation: metafield(namespace: "custom", key: "bin_locations") {
                  value
                }
                variants(first: 1) {
                  edges {
                    node {
                      sku
                      barcode
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
        console.error("[LOW STOCK] GraphQL Errors:", JSON.stringify(resJson.errors, null, 2));
        break;
      }

      const products = resJson.data?.products?.edges || [];
      products.forEach(p => {
        const variant = p.node.variants.edges[0]?.node;
        const available = variant?.inventoryItem?.inventoryLevel?.quantities[0]?.quantity || 0;

        if (available > 0 && available <= 10) {
          lowStockItems.push({
            id: p.node.id,
            title: p.node.title,
            sku: variant?.sku || "N/A",
            barcode: variant?.barcode || "",
            binLocation: p.node.binLocation?.value || "N/A",
            stock: available,
          });
        }
      });

      hasNextPage = resJson.data?.products?.pageInfo.hasNextPage;
      cursor = resJson.data?.products?.pageInfo.endCursor;
    }

    // Sort by stock ascending (lowest first)
    lowStockItems.sort((a, b) => a.stock - b.stock);

    console.log(`[LOW STOCK] Found ${lowStockItems.length} low stock products`);
    return lowStockItems;
  } catch (error) {
    console.error("[LOW STOCK] Error:", error);
    return [];
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
        else if (available <= 10) stats.lowStock++;
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
