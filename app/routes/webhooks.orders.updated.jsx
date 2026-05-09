import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  console.log("[WEBHOOK] Raw request received at /webhooks/orders/updated");

  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    console.log(`[WEBHOOK] Verified signature for ${topic} on ${shop}`);
    console.log(`[WEBHOOK] Order ID: ${payload.id}, Fulfillment Status: ${payload.fulfillment_status}, Order Name: ${payload.name}`);

    const orderGid = `gid://shopify/Order/${payload.id}`;
    const orderName = payload.name || `#${payload.order_number || payload.id}`;

    // Map Shopify fulfillment_status to our log status
    let newStatus = null;
    if (payload.fulfillment_status === "partial") {
        newStatus = "PARTIALLY FULFILLED";
    } else if (payload.fulfillment_status === null || payload.fulfillment_status === "" || payload.fulfillment_status === "unfulfilled") {
        newStatus = "VOID";
    } else if (payload.fulfillment_status === "fulfilled") {
        newStatus = "FULFILLED";
    }

    if (!newStatus) {
        console.log(`[WEBHOOK] No action needed for status: ${payload.fulfillment_status}`);
        return new Response();
    }

    // Get the most recent log for this order
    const latestLog = await db.scanLog.findFirst({
        where: { shop, orderId: orderGid },
        orderBy: { timestamp: "desc" }
    });

    // RULE 1: If the latest log already has the same status, always skip.
    // The webhook fires multiple times for the same status (fulfill/cancel within partial),
    // and we only want to log actual STATUS TRANSITIONS.
    if (latestLog && latestLog.status === newStatus) {
        console.log(`[WEBHOOK] Order ${orderGid} (${orderName}) already has status ${newStatus}. Skipping (no transition).`);
        return new Response();
    }

    // RULE 2: If the latest log was created via Scanner UI within the last 60 seconds
    // and represents the same transition, skip (it's the webhook echo of the scanner action).
    const recentThreshold = new Date(Date.now() - 60000);
    if (latestLog && latestLog.details?.includes("via Scanner UI") && latestLog.timestamp >= recentThreshold) {
        console.log(`[WEBHOOK] Order ${orderGid} (${orderName}) was just handled via Scanner UI. Skipping echo.`);
        return new Response();
    }

    // RULE 3: VOID should only be logged if the order was previously tracked (fulfilled/partial).
    // A new unfulfilled order should NOT get a VOID entry — VOID means a reversal happened.
    if (newStatus === "VOID" && !latestLog) {
        console.log(`[WEBHOOK] Order ${orderGid} (${orderName}) is unfulfilled but has no prior logs. Skipping (not a reversal).`);
        return new Response();
    }

    // RULE 4: PARTIALLY FULFILLED from webhook should only log if the order was previously
    // tracked with a different status. If there's no prior log, the scanner will handle it.
    if (newStatus === "PARTIALLY FULFILLED" && !latestLog) {
        console.log(`[WEBHOOK] Order ${orderGid} (${orderName}) is partial but has no prior logs. Skipping (scanner will log it).`);
        return new Response();
    }

    // Create the log entry — this is a genuine status transition
    const detailsMap = {
        "VOID": `[ORDER:${orderName}] Auto-voided via Shopify Admin: Order reverted to unfulfilled by admin. [${new Date().toLocaleString()}]`,
        "FULFILLED": `[ORDER:${orderName}] Fulfilled via Shopify Admin. [${new Date().toLocaleString()}]`,
        "PARTIALLY FULFILLED": `[ORDER:${orderName}] Partial fulfillment via Shopify Admin. [${new Date().toLocaleString()}]`
    };

    await db.scanLog.create({
        data: {
            shop,
            orderId: orderGid,
            status: newStatus,
            scannedBy: "System",
            staffEmail: null,
            details: detailsMap[newStatus]
        }
    });

    console.log(`[WEBHOOK] Created ${newStatus} log for ${orderGid} (${orderName}).`);

  } catch (error) {
    console.error(`[WEBHOOK ERROR] ${error.message}`);
  }

  return new Response();
};
