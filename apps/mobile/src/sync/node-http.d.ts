// Types for the bit of node:http the opener's test uses (a tiny local server). The app never
// imports it; the phone's type-check has no Node types.
declare module "node:http" {
  export interface IncomingMessage {
    headers: Record<string, string | undefined>;
  }
  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): void;
    write(text: string): void;
    end(text?: string): void;
    destroy(): void;
  }
  export interface Server {
    listen(port: number, host: string, done: () => void): void;
    address(): { port: number };
    close(done: () => void): void;
    closeAllConnections(): void;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;
}
