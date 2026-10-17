"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ApiRequest, ApiResponse, RouteName } from "../contracts/api";
import { api } from "./api";
import { DATA_CHANGED_EVENT, NAME_CHANGED_EVENT, NAME_STORAGE_KEY } from "./events";

export { DATA_CHANGED_EVENT, NAME_CHANGED_EVENT, NAME_STORAGE_KEY, notifyDataChanged } from "./events";

/** Typed one-shot call. Resolves with the response or throws `ApiClientError` (or a Zod error for a malformed request). */
export function callApi<Name extends RouteName>(name: Name, request: ApiRequest<Name>): Promise<ApiResponse<Name>> {
  return api.request(name, request);
}

// ---- user name -------------------------------------------------------------------
function subscribeName(onChange: () => void): () => void {
  window.addEventListener(NAME_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(NAME_CHANGED_EVENT, onChange); window.removeEventListener("storage", onChange); };
}
function readName(): string {
  try { return window.localStorage.getItem(NAME_STORAGE_KEY) ?? ""; } catch { return ""; }
}
const subscribeNever = () => () => {};

/**
 * The name this person typed in the browser. `name` is "" until one is saved (and on the server).
 * `ready` is false during SSR/hydration, so do not treat "" as "no name" until `ready` is true.
 * Changing the name only affects later actions.
 */
export function useUserName(): { name: string; setName: (next: string) => void; ready: boolean } {
  const name = useSyncExternalStore(subscribeName, readName, () => "");
  const ready = useSyncExternalStore(subscribeNever, () => true, () => false);
  const setName = useCallback((next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    try { window.localStorage.setItem(NAME_STORAGE_KEY, trimmed); } catch { /* keep going; event still syncs components in memory */ }
    window.dispatchEvent(new Event(NAME_CHANGED_EVENT));
  }, []);
  return { name, setName, ready };
}

// ---- data fetching ---------------------------------------------------------------
export interface UseApiResult<Name extends RouteName> {
  data: ApiResponse<Name> | null;
  error: Error | null;
  /** True while a request for the current arguments is in flight (data from a refetch stays visible meanwhile). */
  loading: boolean;
  refetch: () => void;
}
interface Slot<Name extends RouteName> { key: string; data: ApiResponse<Name> | null; error: Error | null; done: boolean }

/**
 * Fetch a route on mount and whenever the request changes or `eko:data-changed` fires.
 * Pass `null` to skip. Memoising the request is unnecessary; it is compared by value.
 */
export function useApi<Name extends RouteName>(name: Name, request: ApiRequest<Name> | null): UseApiResult<Name> {
  const key = request === null ? null : `${name}:${JSON.stringify(request)}`;
  const [slot, setSlot] = useState<Slot<Name> | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const body = JSON.parse(key.slice(name.length + 1)) as ApiRequest<Name>;
    setSlot((prev) => (prev && prev.key === key ? { ...prev, done: false } : { key, data: null, error: null, done: false }));
    callApi(name, body).then(
      (data) => { if (!cancelled) setSlot({ key, data, error: null, done: true }); },
      (error: unknown) => { if (!cancelled) setSlot({ key, data: null, error: error instanceof Error ? error : new Error(String(error)), done: true }); },
    );
    return () => { cancelled = true; };
  }, [name, key, tick]);

  if (key === null) return { data: null, error: null, loading: false, refetch };
  if (!slot || slot.key !== key) return { data: null, error: null, loading: true, refetch };
  return { data: slot.data, error: slot.error, loading: !slot.done, refetch };
}
