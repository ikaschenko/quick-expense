import fs from "node:fs/promises";
import path from "node:path";

const runtimeDataPath = path.resolve(process.cwd(), "config", "runtime-data.json");

const emptyStore = {
  users: {},
};

async function ensureStoreExists() {
  await fs.mkdir(path.dirname(runtimeDataPath), { recursive: true });

  try {
    await fs.access(runtimeDataPath);
  } catch {
    await fs.writeFile(runtimeDataPath, JSON.stringify(emptyStore, null, 2), "utf8");
  }
}

export async function loadStore() {
  await ensureStoreExists();
  const raw = await fs.readFile(runtimeDataPath, "utf8");
  return JSON.parse(raw);
}

export async function saveStore(store) {
  await ensureStoreExists();
  await fs.writeFile(runtimeDataPath, JSON.stringify(store, null, 2), "utf8");
}

export async function getUserRecord(email) {
  const store = await loadStore();
  return store.users[email.toLowerCase()] ?? null;
}

export async function updateUserRecord(email, updater) {
  const normalizedEmail = email.toLowerCase();
  const store = await loadStore();
  const currentRecord = store.users[normalizedEmail] ?? {
    email,
  };

  const nextRecord = updater(currentRecord);
  store.users[normalizedEmail] = nextRecord;
  await saveStore(store);
  return nextRecord;
}
