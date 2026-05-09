import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  console.log("[WEBHOOK] Raw request received at /webhooks/orders/cancelled");

  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    console.log(`[WEBHOOK] Verified signature for ${topic} on ${shop}`);
    console.log(`[WEBHOOK] Order ID: ${payload.id}, Order Name: ${payload.name}`);

    const orderGid = `gid://shopify/Order/${payload.id}`;
    const orderName = payload.name || `#${payload.order_number || payload.id}`;

    // Get the most recent log for this order
    const latestLog = await db.scanLog.findFirst({
        where: { shop, orderId: orderGid },
        orderBy: { timestamp: "desc" }
    });

    // Only void if the order was previously tracked and isn't already voided
    if (!latestLog) {
        console.log(`[WEBHOOK] Order ${orderGid} (${orderName}) cancelled but no prior logs. Skipping.`);
        return new Response();
    }

    if (latestLog.status === "VOID") {
        console.log(`[WEBHOOK] Order ${orderGid} (${orderName}) cancelled but already VOID. Skipping.`);
        return new Response();
    }

    // Create VOID log entry
    await db.scanLog.create({
        data: {
            shop,
            orderId: orderGid,
            status: "VOID",
            scannedBy: "System",
            staffEmail: null,
            details: `[ORDER:${orderName}] Order cancelled via Shopify Admin. [${new Date().toLocaleString()}]`
        }
    });

    console.log(`[WEBHOOK] Created VOID log for ${orderGid} (${orderName}) — order cancelled.`);

  } catch (error) {
    console.error(`[WEBHOOK ERROR] ${error.message}`);
  }

  return new Response();
};
