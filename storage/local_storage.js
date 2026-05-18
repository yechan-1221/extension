export function saveLocal(key, value) {

    localStorage.setItem(
        key,
        JSON.stringify(value)
    );
}


export function loadLocal(key) {

    const value = localStorage.getItem(key);

    return JSON.parse(value);
}