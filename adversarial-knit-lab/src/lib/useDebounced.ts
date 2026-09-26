import { useEffect, useState } from 'react'

/**
 * Delay a value until it stops changing.
 *
 * Pattern generation costs 10-20 ms at the default chart size and over 100 ms
 * at 200 x 300 stitches. Recomputing on every slider tick makes the slider
 * itself stutter, so the preview follows the value rather than chasing it.
 */
export function useDebounced<T>(value: T, delayMs = 120): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}
