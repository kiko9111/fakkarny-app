/** In-memory request/error counters per hour for the admin dashboard (FR-15 "error rate"). */
const HOURS = 24;

interface Bucket {
  hour: number;
  requests: number;
  errors: number;
}

export function createMetrics(now: () => number = Date.now) {
  const buckets: Bucket[] = [];
  const current = () => {
    const hour = Math.floor(now() / 3600_000);
    let b = buckets[buckets.length - 1];
    if (!b || b.hour !== hour) {
      b = { hour, requests: 0, errors: 0 };
      buckets.push(b);
      while (buckets.length > HOURS) buckets.shift();
    }
    return b;
  };
  return {
    record(statusCode: number) {
      const b = current();
      b.requests++;
      if (statusCode >= 500) b.errors++;
    },
    /** Requests and 5xx errors over the last 24 hours. */
    summary() {
      const since = Math.floor(now() / 3600_000) - HOURS;
      const recent = buckets.filter((b) => b.hour > since);
      const requests = recent.reduce((n, b) => n + b.requests, 0);
      const errors = recent.reduce((n, b) => n + b.errors, 0);
      return { requests, errors, errorRate: requests ? errors / requests : 0 };
    },
  };
}
export type Metrics = ReturnType<typeof createMetrics>;
