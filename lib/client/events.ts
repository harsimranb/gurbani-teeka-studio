/** Window event fired after every successful non-GET API call (and by the mock when state changes mid-request). */
export const DATA_CHANGED_EVENT = "eko:data-changed";
/** Window event fired when the stored user name changes. */
export const NAME_CHANGED_EVENT = "eko:name-changed";
/** localStorage key holding the typed user name. */
export const NAME_STORAGE_KEY = "eko.name";

export function notifyDataChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}
