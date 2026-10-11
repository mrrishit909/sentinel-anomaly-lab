import { useActiveScene, useProgress } from "../scroll/hooks";
import { useState } from "react";
import { useStage } from "../scenes/useStage";
import { jumpTo } from "../scroll/engine";
import { useArtifact } from "../data/useArtifact";
import { META } from "../data/artifacts";

/**
 * Attribution footer on every scene from S01 on (VISUAL_DESIGN 0): CC BY 4.0 with "changes made" and the simulated statement,
 * linking to the full text in S08. Provider and licence come from meta.json; the static words are the fallback while it loads.
 */
export function Footer({ introPlaying, inline = false }: { introPlaying: boolean; inline?: boolean }) {
  const active = useActiveScene();
  const stage = useStage();
  const [early, setEarly] = useState(true);
  useProgress("signal", (p) => setEarly((o) => { const n = p < 0.3; return o === n ? o : n; }));
  const [meta] = useArtifact(META);
  const hidden = !inline && (introPlaying || active === "replay" || active === "close" || (active === "signal" && early));
  const full = meta.status === "ready" ? meta.data.dataset.provider.toUpperCase().replace(" (", " / ").replace(")", "") : "SOLENIX ENGINEERING GMBH / PATRICK FLEITH";
  const prov = stage.cls === "M" ? full.split(" / ").map((x) => x.split(" ")[0] === "SOLENIX" ? "SOLENIX" : x.split(" ").slice(-1)[0]).join(" / ") : full;
  const lic = meta.status === "ready" ? meta.data.dataset.licence.toUpperCase().replace("CC-BY-", "CC BY ") : "CC BY 4.0";
  const v = meta.status === "ready" ? meta.data.dataset.version : "2";
  return (
    <footer className={`sal-footer ${inline ? "sal-footer--inline" : ""}`} hidden={hidden} aria-label="Data attribution">
      <p>
        <a href="#close" onClick={(e) => { e.preventDefault(); jumpTo("close", 1, { push: true, focus: true }); }}>
          CATS V{v} · {prov} · {lic} · CHANGES MADE · SIMULATED, NOT REAL TELEMETRY
        </a>
      </p>
    </footer>
  );
}
