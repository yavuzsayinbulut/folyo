import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { background, containerBackground, cornerRadius, font, foregroundStyle, frame } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import { EMPTY_VISITS, type VisitsWidgetProps } from "./types";

/** iOS ana ekran widget'i (SwiftUI). Yalitilmis calisir: yalniz props ve environment kullanir. */
const VisitsWidget = (props: VisitsWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const ink = dark ? "#f1efe8" : "#1f1e1c";
  const muted = dark ? "#b4b2a9" : "#5f5e5a";
  const accent = dark ? "#afa9ec" : "#534ab7";
  const bar = dark ? "#8b84e6" : "#534ab7";
  const trend = props.deltaTrend === "up" ? (dark ? "#c0dd97" : "#27500a") : props.deltaTrend === "down" ? (dark ? "#f09595" : "#a32d2d") : muted;
  const medium = environment.widgetFamily === "systemMedium";

  return (
    <VStack alignment="leading" spacing={6} modifiers={[containerBackground(dark ? "#1f1f1d" : "#ffffff", "widget")]}>
      <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(accent)]}>folyo.app/{props.username}</Text>
      <HStack alignment="firstTextBaseline" spacing={6}>
        <Text modifiers={[font({ size: 32, weight: "bold" }), foregroundStyle(ink)]}>{props.visitors}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>ziyaretçi</Text>
      </HStack>
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(trend)]}>{props.delta}</Text>
      <Spacer />
      <HStack alignment="bottom" spacing={medium ? 6 : 4}>
        {props.bars.map((height, i) => (
          <VStack key={i} modifiers={[frame({ width: medium ? 16 : 11, height: Math.min(height, 40) }), background(bar), cornerRadius(3)]}>
            <Spacer />
          </VStack>
        ))}
      </HStack>
      {medium && props.message ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>“{props.message}”</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget("VisitsWidget", VisitsWidget, EMPTY_VISITS);
