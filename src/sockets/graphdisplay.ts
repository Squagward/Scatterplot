// @ts-ignore
import { request } from "requestV2";
// @ts-ignore
import Settings from "../../dist/settings";
import { Mode, entries, WebSocketClient, URI, Range } from "../constants";
import { BitcoinGraph } from "../graph";
import { DataPoint, DataEntry, WebSocketData } from "../types";
import { formatDate } from "../utils/format";
import { getDatesForLooping } from "../utils/index";

const graph = new BitcoinGraph();
const today = formatDate(Date.now());
const ranges = Object.keys(Range);
let points: DataPoint[] = [];

register("renderOverlay", () => {
  switch (graph.pointCollection.mode) {
    case Mode.HISTORICAL: {
      graph.draw(
        `${entries[Settings.coinIndex][0]} - ${ranges[Settings.rangeIndex]}`
      );
      break;
    }
    case Mode.LIVE: {
      graph.drawLive(`${entries[Settings.coinIndex][0]} - Live Price`);
      break;
    }
  }
});

register("step", () => {
  if (!Settings.clicked) return;
  Settings.clicked = false;
  points = [];

  const times = getDatesForLooping(entries[Settings.coinIndex][1]);
  const promises: DataEntry[][] = [];

  while (times.length > 0) {
    promises.push(
      request({
        url: `https://api.pro.coinbase.com/products/${
          entries[Settings.coinIndex][0]
        }-USD/candles`,
        qs: {
          granularity: 86400,
          start: times.shift() ?? today,
          end: times.shift() ?? today
        },
        headers: {
          "User-Agent": "Mozilla/5.0 (ChatTriggers)"
        },
        timeout: 10000,
        json: true
      })
    );
  }

  Promise.all(promises)
    .then((datas) => {
      datas.forEach((res) => {
        let date: number;
        let price: number;
        for ([date, , price] of res) {
          points.push({
            date: formatDate(date * 1000),
            price
          });
        }
      });

      graph.pointCollection.setPlotPoints(
        points.sort((a, b) => a.date.localeCompare(b.date))
      );
      graph.pointCollection.setGraphRange(ranges[Settings.rangeIndex]);
      graph.open(Mode.HISTORICAL);
    })
    .catch((e: Error) => {
      Client.currentGui.close();
      new Message("§cError loading the data :(").chat();
      console.log(e.message);
    });
});

// @ts-ignore
const graphSocket = new JavaAdapter(
  WebSocketClient,
  {
    onMessage(message: string): void {
      const { time, price }: WebSocketData = JSON.parse(message);
      if (time === undefined) return;
      points.push({
        date: time.split("T")[1].substring(0, 8),
        price: Number(price)
      });
      graph.pointCollection.setPlotPoints(points);
      graph.pointCollection.setGraphRange("max");
    }
  },
  new URI("wss://ws-feed.pro.coinbase.com")
);

register("step", () => {
  if (!Settings.liveFeed) return;
  Settings.liveFeed = false;
  points = [];

  graphSocket.reconnectBlocking();

  graphSocket.send(
    JSON.stringify({
      type: "subscribe",
      channels: [
        {
          name: "ticker",
          product_ids: [`${entries[Settings.coinIndex][0]}-USD`]
        }
      ]
    })
  );
  graph.open(Mode.LIVE);
});

const guis: any = {
  previous: null,
  current: Client.currentGui.get()
};

register("guiOpened", () => {
  guis.previous = guis.current;
  guis.current = Client.currentGui.get();

  if (guis.current === null && guis.previous instanceof Gui) {
    graphSocket.closeBlocking();
  }
});

graphSocket.connectBlocking();
graphSocket.closeBlocking();
