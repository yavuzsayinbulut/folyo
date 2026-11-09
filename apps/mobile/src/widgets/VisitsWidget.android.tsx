import { Box, Column, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, paddingAll, size, width } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import { EMPTY_VISITS, type VisitsWidgetProps } from "./types";

/**
 * Android ana ekran widget'i (Jetpack Compose alt kumesi). Yalitilmis calisir: yalniz props ve environment kullanir;
 * disaridaki sabitlere erisemez, bu yuzden renkler fonksiyonun icinde tanimli.
 */
const VisitsWidget = (props: VisitsWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const surface = dark ? "#1f1f1d" : "#ffffff";
  const ink = dark ? "#f1efe8" : "#1f1e1c";
  const muted = dark ? "#b4b2a9" : "#5f5e5a";
  const accent = dark ? "#afa9ec" : "#534ab7";
  const bar = dark ? "#8b84e6" : "#534ab7";
  const trend = props.deltaTrend === "up" ? (dark ? "#c0dd97" : "#27500a") : props.deltaTrend === "down" ? (dark ? "#f09595" : "#a32d2d") : muted;

  return (
    <Column modifiers={[fillMaxSize(), background(surface), cornerRadius(24), paddingAll(16)]}>
      <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
        <Box modifiers={[size(10, 10), background(accent), cornerRadius(3)]} />
        <Spacer modifiers={[width(6)]} />
        <Text color={accent} style={{ fontSize: 12, fontWeight: "bold" }}>
          {"folyo.app/" + props.username}
        </Text>
      </Row>
      <Spacer modifiers={[height(8)]} />
      <Row verticalAlignment="bottom">
        <Text color={ink} style={{ fontSize: 34, fontWeight: "bold" }}>
          {props.visitors}
        </Text>
        <Spacer modifiers={[width(6)]} />
        <Text color={muted} style={{ fontSize: 13 }}>
          ziyaretçi · 7 gün
        </Text>
      </Row>
      <Text color={trend} style={{ fontSize: 12, fontWeight: "bold" }}>
        {props.delta}
      </Text>
      <Spacer modifiers={[height(12)]} />
      <Row verticalAlignment="bottom" modifiers={[height(56)]}>
        {props.bars.map((barHeight, i) => (
          <Row key={i} verticalAlignment="bottom">
            {i > 0 ? <Spacer modifiers={[width(6)]} /> : null}
            <Box modifiers={[width(18), height(barHeight), background(bar), cornerRadius(4)]} />
          </Row>
        ))}
      </Row>
      {props.message ? (
        <Column>
          <Spacer modifiers={[height(10)]} />
          <Text color={muted} style={{ fontSize: 12 }}>
            {"“" + props.message + "”"}
          </Text>
        </Column>
      ) : null}
    </Column>
  );
};

export default createWidget("VisitsWidget", VisitsWidget, EMPTY_VISITS);
