
/**
 * Shopify Inventory Service
 * Handles individual and bulk inventory updates
 * Updated for API version 2026-04:
 * - @idempotent(key: "uuid") directive required on mutation fields
 * - changeFromQuantity field required (null to opt-out)
 */

function generateKey() {
  // Use globalThis.crypto for broad compatibility (Node 20+, Vite SSR)
  if (globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback: generate a simple unique key
  return `${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

/**
 * Adjusts inventory level by balanced amount (e.g. +5 or -3)
 * @param {Object} admin - Shopify Admin API instance
 * @param {String} inventoryItemId - GID of the inventory item
 * @param {String} locationId - GID of the location
 * @param {Number} delta - Amount to adjust by
 */
export async function adjustInventory(admin, inventoryItemId, locationId, delta) {
  console.log(`[INVENTORY] Adjusting: Item=${inventoryItemId}, Location=${locationId}, Delta=${delta}`);

  // First, ensure the inventory is activated at this location
  await ensureInventoryActivated(admin, inventoryItemId, locationId);

  const idempotencyKey = generateKey();

  const response = await admin.graphql(
    `#graphql
    mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) @idempotent(key: "${idempotencyKey}") {
        inventoryAdjustmentGroup {
          createdAt
          reason
          changes {
            name
            delta
            quantityAfterChange
          }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          reason: "correction",
          name: "available",
          changes: [
            {
              delta: parseInt(delta, 10),
              inventoryItemId: inventoryItemId,
              locationId: locationId,
              changeFromQuantity: null
            }
          ]
        }
      }
    }
  );

  const resData = await response.json();
  console.log(`[INVENTORY] Response:`, JSON.stringify(resData?.data || resData?.errors, null, 2));

  if (resData.errors) {
    console.error(`[INVENTORY] GraphQL Errors:`, resData.errors);
    throw new Error(resData.errors[0].message);
  }

  const userErrors = resData.data?.inventoryAdjustQuantities?.userErrors || [];
  if (userErrors.length > 0) {
    console.error(`[INVENTORY] User Errors:`, userErrors);
    throw new Error(userErrors[0].message);
  }

  const group = resData.data.inventoryAdjustQuantities.inventoryAdjustmentGroup;
  const change = group?.changes?.find(c => c.name === "available");
  console.log(`[INVENTORY] Success: New available=${change?.quantityAfterChange}`);

  return group;
}

/**
 * Activates inventory for an item at a location if not already active
 */
async function ensureInventoryActivated(admin, inventoryItemId, locationId) {
  try {
    const idempotencyKey = generateKey();

    const response = await admin.graphql(
      `#graphql
      mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
        inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) @idempotent(key: "${idempotencyKey}") {
          inventoryLevel {
            id
            location { id name }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          inventoryItemId,
          locationId
        }
      }
    );

    const resData = await response.json();
    if (resData.errors) {
      console.error(`[INVENTORY] Activation GraphQL Errors:`, resData.errors);
      return false;
    }

    const userErrors = resData.data?.inventoryActivate?.userErrors || [];
    if (userErrors.length > 0) {
      console.error(`[INVENTORY] Activation User Errors:`, userErrors);
      return false;
    }

    console.log(`[INVENTORY] Activated inventory at location`);
    return true;
  } catch (error) {
    console.error(`[INVENTORY] Activation failed:`, error);
    return false;
  }
}

/**
 * Sets inventory level to an absolute value
 */
export async function setInventory(admin, inventoryItemId, locationId, quantity) {
  // First, ensure the inventory is activated at this location
  await ensureInventoryActivated(admin, inventoryItemId, locationId);

  const idempotencyKey = generateKey();

  const response = await admin.graphql(
    `#graphql
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) @idempotent(key: "${idempotencyKey}") {
        inventoryAdjustmentGroup {
          createdAt
          reason
          changes {
            name
            delta
            quantityAfterChange
          }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          reason: "correction",
          name: "available",
          quantities: [
            {
              quantity: parseInt(quantity, 10),
              inventoryItemId: inventoryItemId,
              locationId: locationId,
              changeFromQuantity: null
            }
          ]
        }
      }
    }
  );

  const resData = await response.json();
  console.log(`[INVENTORY SET] Response:`, JSON.stringify(resData?.data || resData?.errors, null, 2));
  if (resData.errors) throw new Error(resData.errors[0].message);

  const userErrors = resData.data?.inventorySetQuantities?.userErrors || [];
  if (userErrors.length > 0) throw new Error(userErrors[0].message);

  const group = resData.data.inventorySetQuantities.inventoryAdjustmentGroup;

  return group;
}
