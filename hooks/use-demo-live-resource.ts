"use client"

import { useEffect, useRef, useState } from "react"
import { useDemo } from "@/components/demo-provider"

interface Options<T> {
  demoData: T
  liveUrl: string
  emptyData: T
}

// Module-level so all hook instances share one cache — navigation doesn't re-pay fetch cost.
const liveResourceCache = new Map<string, unknown>()

// Call on sign-out: cache is URL-keyed, so a new user on the same tab would
// briefly see the previous user's data before the first fetch resolves.
export function clearLiveResourceCache() {
  liveResourceCache.clear()
}

export function useDemoLiveResource<T>({ demoData, liveUrl, emptyData }: Options<T>) {
  const { isDemoMode } = useDemo()
  const cachedOnMount = isDemoMode ? undefined : (liveResourceCache.get(liveUrl) as T | undefined)
  const [data, setData] = useState<T>(isDemoMode ? demoData : cachedOnMount ?? emptyData)
  const [isLoading, setIsLoading] = useState(!isDemoMode && typeof cachedOnMount === "undefined")
  // hasLoaded distinguishes "fetch completed" from "data is empty" — callers
  // that call notFound() need the former, not just a falsy data check.
  const [hasLoaded, setHasLoaded] = useState(isDemoMode || typeof cachedOnMount !== "undefined")
  const [reloadKey, setReloadKey] = useState(0)
  const demoDataRef = useRef(demoData)
  const emptyDataRef = useRef(emptyData)
  // Guards against pollers calling refetch() faster than the endpoint responds:
  // bumping reloadKey kills the in-flight effect (ignore = true), discarding
  // its result — stacking these would mean the UI never updates.
  const isFetchingRef = useRef(false)

  demoDataRef.current = demoData
  emptyDataRef.current = emptyData

  useEffect(() => {
    let ignore = false

    if (isDemoMode) {
      setData(demoDataRef.current)
      setIsLoading(false)
      setHasLoaded(true)
      return
    }

    // Stale-while-revalidate: serve cache instantly while always refetching.
    const cached = liveResourceCache.get(liveUrl) as T | undefined
    const hasCached = typeof cached !== "undefined"

    if (hasCached) {
      setData(cached)
      setHasLoaded(true)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }

    isFetchingRef.current = true

    fetch(liveUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return hasCached ? cached : emptyDataRef.current
        }

        return (await response.json()) as T
      })
      .then((payload) => {
        if (!ignore) {
          liveResourceCache.set(liveUrl, payload)
          setData(payload)
        }
      })
      .catch(() => {
        if (!ignore && !hasCached) {
          setData(emptyDataRef.current)
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false)
          setHasLoaded(true)
        }
        isFetchingRef.current = false
      })

    return () => {
      ignore = true
    }
  }, [isDemoMode, liveUrl, reloadKey])

  return {
    data: isDemoMode ? demoDataRef.current : data,
    isDemoMode,
    isLoading: !isDemoMode && isLoading,
    hasLoaded,
    refetch: () => {
      if (isFetchingRef.current) return
      setReloadKey((value) => value + 1)
    },
  }
}
