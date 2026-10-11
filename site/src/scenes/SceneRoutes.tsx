import { SCENES } from "../app/scenes";
import { S02Source } from "./S02Source";
import { S03aNormal } from "./S03aNormal";
import { S03bDetectors } from "./S03bDetectors";
import { S04Days } from "./S04Days";
import { S05Lab } from "./S05Lab";
import { S06Fine } from "./S06Fine";
import { S07Evidence } from "./S07Evidence";
import { Replay } from "./ReplayScene";
import { S08Close } from "./S08Close";

const byId = (id: string) => SCENES.find((s) => s.id === id)!;

/** Scenes after the static S00/S01 track, in page order. */
export function SceneRoutes({ onReplayIntro }: { onReplayIntro: () => void }) {
  return (
    <>
      <S02Source def={byId("record")} />
      <S03aNormal def={byId("normal")} />
      <S03bDetectors def={byId("detectors")} />
      <S04Days def={byId("days")} />
      <S05Lab def={byId("lab")} />
      <S06Fine def={byId("fine")} />
      <S07Evidence def={byId("evidence")} />
      <Replay def={byId("replay")} />
      <S08Close def={byId("close")} onReplayIntro={onReplayIntro} />
    </>
  );
}
