import db from "../db.server";

export async function getAppSettings(shop) {
  let settings = await db.appSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await db.appSettings.create({
      data: {
        shop,
        adminPin: "1234",
        adminName: "Admin",
        brandLogo: "",
        showStockTab: true,
        showOrdersTab: true,
        showHistoryTab: true,
        enableScanButton: true,
        enableInventorySearch: true,
        enableInventorySort: true,
        showStaffManagement: true,
        showLogoutButton: true
      },
    });
  }

  return settings;
}

export async function updateAppSettings(shop, data) {
  return await db.appSettings.upsert({
    where: { shop },
    update: data,
    create: {
      shop,
      ...data,
    },
  });
}

// --- STAFF MANAGEMENT ---

export async function getStaffMembers(shop) {
  return await db.staff.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });
}

function validateStaffData({ name, email, pin }) {
  const cleanedName = String(name || "").trim();
  const cleanedEmail = String(email || "").trim();
  const cleanedPin = String(pin || "").trim();

  if (!cleanedName || !cleanedEmail || !cleanedPin) {
    throw new Error("Name, email, and PIN are required.");
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanedEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  if (!/^\d{4,6}$/.test(cleanedPin)) {
    throw new Error("PIN must be 4 to 6 digits.");
  }

  return {
    name: cleanedName,
    email: cleanedEmail,
    pin: cleanedPin,
  };
}

export async function createStaffMember(shop, { name, email, pin }) {
  const validated = validateStaffData({ name, email, pin });

  const existing = await db.staff.findFirst({
    where: {
      shop,
      OR: [
        { name: { equals: validated.name } },
        { email: { equals: validated.email } }
      ]
    }
  });

  if (existing) {
    throw new Error("Staff member with this Name or Email already exists.");
  }

  return await db.staff.create({
    data: { shop, ...validated },
  });
}

export async function updateStaffMember(shop, id, { name, email, pin }) {
  const validated = validateStaffData({ name, email, pin });
  const parsedId = parseInt(id, 10);

  const result = await db.staff.updateMany({
    where: { shop, id: parsedId },
    data: { ...validated },
  });

  if (result.count === 0) {
    throw new Error("Staff member not found.");
  }

  return await db.staff.findUnique({
    where: { id: parsedId },
  });
}

export async function deleteStaffMember(shop, id) {
  return await db.staff.deleteMany({
    where: { shop, id: parseInt(id) },
  });
}

export async function validateStaffAuth(shop, identifier, pin) {
  const staff = await db.staff.findFirst({
    where: { 
      shop, 
      pin,
      OR: [
        { email: { equals: identifier } },
        { name: { equals: identifier } }
      ]
    },
  });
  return staff;
}

export async function validateAdminAuth(shop, identifier, pin) {
  const settings = await getAppSettings(shop);
  if ((settings.adminName.toLowerCase() === identifier.toLowerCase() || identifier.toLowerCase() === "admin") && settings.adminPin === pin) {
    return { name: settings.adminName, email: "admin@store.local", isAdmin: true };
  }
  return null;
}
