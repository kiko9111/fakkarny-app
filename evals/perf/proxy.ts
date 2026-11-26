/**
 * A TCP proxy in front of Postgres that makes a local database behave like a far one: every
 * packet waits `delayMs` in each direction, and every request/answer exchange is counted.
 * Production pays about 0.1 s per database round trip (the API and the database are in
 * different regions), so time on the server is mostly "how many round trips, one after another".
 */
import net from "node:net";

export interface DelayProxy {
  port: number;
  /** One-way delay per packet, in ms (a round trip costs twice this). */
  setDelay(ms: number): void;
  /** Request/answer exchanges since the last reset, summed over all connections. */
  roundTrips(): number;
  reset(): void;
  close(): Promise<void>;
}

export function startDelayProxy(target: { host: string; port: number }, delayMs = 0): Promise<DelayProxy> {
  let delay = delayMs;
  let trips = 0;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    const upstream = net.connect(target.port, target.host);
    sockets.add(client).add(upstream);
    client.setNoDelay(true);
    upstream.setNoDelay(true);
    let last: "c" | "s" = "s";
    // Packets keep their order: timers with the same delay fire in the order they were set.
    const later = (to: net.Socket, chunk: Buffer) => {
      if (delay <= 0) to.write(chunk);
      else setTimeout(() => !to.destroyed && to.write(chunk), delay);
    };
    client.on("data", (chunk) => {
      if (last === "s") trips++;
      last = "c";
      later(upstream, chunk);
    });
    upstream.on("data", (chunk) => {
      last = "s";
      later(client, chunk);
    });
    const end = () => {
      setTimeout(() => {
        client.destroy();
        upstream.destroy();
        sockets.delete(client);
        sockets.delete(upstream);
      }, delay + 5);
    };
    client.on("close", end).on("error", end);
    upstream.on("close", end).on("error", end);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as net.AddressInfo;
      resolve({
        port: address.port,
        setDelay: (ms) => void (delay = ms),
        roundTrips: () => trips,
        reset: () => void (trips = 0),
        close: () =>
          new Promise<void>((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
