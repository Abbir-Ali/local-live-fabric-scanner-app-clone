import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  console.log("[WEBHOOK] Raw request received at /webhooks/fulfillments/update");

  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    console.log(`[WEBHOOK] Verified signature for ${topic} on ${shop}`);
    console.log(`[WEBHOOK] Fulfillment ID: ${payload.id}, Status: ${payload.status}, Order ID: ${payload.order_id}`);

    // Only handle cancelled fulfillments — this is the case where admin cancels a fulfillment
    if (payload.status === "cancelled") {
        const orderGid = `gid://shopify/Order/${payload.order_id}`;

        // Get the most recent log for this order
        const latestLog = await db.scanLog.findFirst({
            where: { shop, orderId: orderGid },
            orderBy: { timestamp: "desc" }
        });

        // Only void if the order was previously tracked and isn't already voided
        if (!latestLog) {
            console.log(`[WEBHOOK] Fulfillment canceled for ${orderGid} but no prior logs. Skipping.`);
            return new Response();
        }

        if (latestLog.status === "VOID") {
            console.log(`[WEBHOOK] Fulfillment canceled for ${orderGid} but already VOID. Skipping.`);
            return new Response();
        }

        // Extract order name from the latest log details if available
        const orderNameMatch = latestLog.details?.match(/\[ORDER:(#?[^\]]+)\]/);
        const displayName = orderNameMatch ? orderNameMatch[1] : `Order ${payload.order_id}`;

        // Create VOID log entry
        await db.scanLog.create({
            data: {
                shop,
                orderId: orderGid,
                status: "VOID",
                scannedBy: "System",
                staffEmail: null,
                details: `[ORDER:${displayName}] Fulfillment canceled via Shopify Admin. [${new Date().toLocaleString()}]`
            }
        });

        console.log(`[WEBHOOK] Created VOID log for ${orderGid} (${displayName}) — fulfillment canceled.`);
    } else {
        console.log(`[WEBHOOK] Fulfillment status "${payload.status}" — no action needed.`);
    }

  } catch (error) {
    console.error(`[WEBHOOK ERROR] ${error.message}`);
  }

  return new Response();
};
