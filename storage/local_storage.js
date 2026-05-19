export async function saveLocal(key, value) {
    await chrome.storage.local.set({ [key]: value });
}

export async function loadLocal(key) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
}

export async function removeLocal(key) {
    await chrome.storage.local.remove(key);
}