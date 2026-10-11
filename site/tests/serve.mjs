// Production preview (dist/) on 4361 via vite's API, so the process is not reaped by other agents' `vite preview` cleanups.
import { preview } from "vite";
const s = await preview({ preview: { port: 4361, strictPort: true } });
s.printUrls();
