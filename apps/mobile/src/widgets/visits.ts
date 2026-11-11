import { isRunningInExpoGo } from "expo";
import type { VisitsWidgetProps } from "./types";

type VisitsWidgetUpdater = { updateSnapshot(props: VisitsWidgetProps): void };

/**
 * Ana ekran widget'ini gunceller. Widget'in yerel modulu Expo Go'da yoktur (yalniz kendi derlememizde
 * vardir); Expo Go'da widget dosyasi hic yuklenmez ve guncellemeler sessizce atlanir.
 */
const VisitsWidget: VisitsWidgetUpdater = isRunningInExpoGo()
  ? { updateSnapshot() {} }
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./VisitsWidget").default;

export default VisitsWidget;
