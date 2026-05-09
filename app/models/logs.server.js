import db from "../db.server";

export async function createScanLog(shop, data) {
  return await db.scanLog.create({
    data: {
      shop,
      orderId: data.orderId,
      status: data.status,
      scannedBy: data.scannedBy,
      staffEmail: data.staffEmail,
      details: data.details,
    },
  });
}

export async function getScanLogs(shop, { page = 1, limit = 5, query = "" } = {}) {
  const skip = (page - 1) * limit;
  const where = {
    shop,
    ...(query ? {
      OR: [
        { orderId: { contains: query } },
        { scannedBy: { contains: query } },
        { staffEmail: { contains: query } },
      ]
    } : {})
  };

  const [logs, totalCount] = await Promise.all([
    db.scanLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      skip: skip,
    }),
    db.scanLog.count({ where })
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    }
  };
}

export async function getDashboardStats(shop) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [scansToday, fulfilledGroups] = await Promise.all([
    db.scanLog.count({
      where: {
        shop,
        status: { equals: "FULFILLED" },
        timestamp: { gte: today },
      },
    }),
    db.scanLog.groupBy({
      by: ['orderId'],
      where: {
        shop,
        status: "FULFILLED",
      },
    })
  ]);

  return {
    scansToday,
    totalFulfilled: fulfilledGroups.length
  };
}

export async function getLogStats(shop) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get total scans in last 24h (raw count for the card)
  const totalScans24h = await db.scanLog.count({
    where: { shop, timestamp: { gte: today } },
  });

  // Get all logs to compute order-level stats
  const allLogs = await db.scanLog.findMany({
    where: { shop },
    select: { orderId: true, status: true, timestamp: true },
    orderBy: { timestamp: "desc" },
  });

  const totalAll = allLogs.length;

  // Determine the effective status per order based on the latest log entry
  // An order's effective status is its most recent log status
  const orderLatestStatus = {};
  for (const log of allLogs) {
    // Since logs are ordered desc by timestamp, the first entry per order is the latest
    if (!orderLatestStatus[log.orderId]) {
      orderLatestStatus[log.orderId] = log.status;
    }
  }

  // Count unique orders by their effective (latest) status
  let fulfilledOrders = 0;
  let partialOrders = 0;
  let voidOrders = 0;

  for (const orderId of Object.keys(orderLatestStatus)) {
    const latestStatus = orderLatestStatus[orderId];
    if (latestStatus === "FULFILLED") {
      fulfilledOrders++;
    } else if (latestStatus === "PARTIALLY FULFILLED") {
      partialOrders++;
    } else if (latestStatus === "VOID") {
      voidOrders++;
    }
  }

  // Also count raw log entries for reference
  const fulfilledCount = allLogs.filter(l => l.status === "FULFILLED").length;

  // Fulfilled rate: based on unique orders — how many orders ended up fulfilled
  // vs total unique orders that have been processed
  const totalUniqueOrders = Object.keys(orderLatestStatus).length;
  const fulfilledRate = totalUniqueOrders > 0
    ? ((fulfilledOrders / totalUniqueOrders) * 100).toFixed(1)
    : "0.0";

  // Void reversed count: orders that have VOID logs but latest status is FULFILLED
  // (meaning the void was effectively reversed by a re-fulfillment)
  let voidReversedCount = 0;
  for (const orderId of Object.keys(orderLatestStatus)) {
    if (orderLatestStatus[orderId] === "FULFILLED") {
      const hasVoid = allLogs.some(l => l.orderId === orderId && l.status === "VOID");
      if (hasVoid) {
        voidReversedCount++;
      }
    }
  }

  return {
    totalScans24h,
    fulfilledCount,
    fulfilledRate,
    partialCount: partialOrders,
    voidCount: voidOrders,
    voidReversedCount,
    totalAll,
  };
}

export async function getLogForOrder(shop, orderId) {
  return await db.scanLog.findFirst({
    where: {
      shop,
      orderId: { contains: orderId },
      OR: [
        { status: "FULFILLED" },
        { status: "PARTIALLY FULFILLED" }
      ]
    },
    orderBy: { timestamp: "desc" }
  });
}

export async function getLogsForOrder(shop, orderId) {
  return await db.scanLog.findMany({
    where: {
      shop,
      orderId: { contains: orderId },
      OR: [
        { status: "FULFILLED" },
        { status: "PARTIALLY FULFILLED" }
      ]
    },
    orderBy: { timestamp: "desc" }
  });
}
