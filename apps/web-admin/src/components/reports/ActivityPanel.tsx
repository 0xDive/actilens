import { useTranslation } from "react-i18next";
import type { ActivityResponse } from "../../api/types";
import { Card, EmptyState } from "../ds";

const fmtHM = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
};

const hourLabel = (timestamp: number) =>
  `${String(new Date(timestamp * 1000).getHours()).padStart(2, "0")}:00`;

export function ActivityPanel({ data }: { data: ActivityResponse }) {
  const { t } = useTranslation("reports");
  const breakdown = [...data.breakdown].sort((a, b) => b.duration_s - a.duration_s);

  if (breakdown.length === 0) {
    return (
      <EmptyState
        title={t("activity.empty")}
        description={t("activity.v1.emptyDescription")}
      />
    );
  }

  const samples = [...data.samples]
    .filter((sample) => sample.duration_s > 0)
    .sort((a, b) => a.ts - b.ts);

  type Block = { app: string; ts: number; duration: number };
  const blocks: Block[] = [];
  for (const sample of samples) {
    const previous = blocks[blocks.length - 1];
    if (
      previous &&
      previous.app === sample.app_name &&
      sample.ts - (previous.ts + previous.duration) < 60
    ) {
      previous.duration = sample.ts + sample.duration_s - previous.ts;
    } else {
      blocks.push({
        app: sample.app_name,
        ts: sample.ts,
        duration: sample.duration_s,
      });
    }
  }

  const HOUR = 3600;
  const start = blocks.length ? Math.floor(blocks[0].ts / HOUR) * HOUR : 0;
  const last = blocks.length
    ? Math.max(...blocks.map((block) => block.ts + block.duration))
    : start + HOUR;
  const end = Math.max(start + HOUR, Math.ceil(last / HOUR) * HOUR);
  const span = Math.max(1, end - start);
  const percent = (timestamp: number) => ((timestamp - start) / span) * 100;

  const appOrder = new Map(
    breakdown.map((item, index) => [item.app_name, index % 6]),
  );

  type Segment =
    | { kind: "app"; app: string; left: number; width: number; duration: number }
    | { kind: "idle"; left: number; width: number; duration: number };

  const segments: Segment[] = [];
  let cursor = start;
  for (const block of blocks) {
    if (block.ts > cursor) {
      segments.push({
        kind: "idle",
        left: percent(cursor),
        width: percent(block.ts) - percent(cursor),
        duration: block.ts - cursor,
      });
    }
    const blockEnd = block.ts + block.duration;
    segments.push({
      kind: "app",
      app: block.app,
      left: percent(block.ts),
      width: percent(blockEnd) - percent(block.ts),
      duration: block.duration,
    });
    cursor = Math.max(cursor, blockEnd);
  }

  const hourCount = Math.max(1, Math.round(span / HOUR));
  const tickStep = Math.max(1, Math.ceil(hourCount / 6));
  const ticks: number[] = [];
  for (let timestamp = start; timestamp <= end; timestamp += tickStep * HOUR) {
    ticks.push(timestamp);
  }

  const maxDuration = Math.max(1, ...breakdown.map((item) => item.duration_s));

  return (
    <div className="report-grid">
      <Card>
        <div className="report-card__head">
          <h2 className="report-card__title">{t("activity.timeline")}</h2>
          <p className="report-card__subtitle">{t("activity.v1.timelineSubtitle")}</p>
        </div>

        {blocks.length > 0 ? (
          <>
            <div className="report-timeline">
              {segments.map((segment, index) => {
                const title =
                  segment.kind === "app"
                    ? `${segment.app} · ${fmtHM(segment.duration)}`
                    : `${t("activity.idle")} · ${fmtHM(segment.duration)}`;
                return (
                  <span
                    key={index}
                    title={title}
                    className={
                      segment.kind === "app"
                        ? `report-timeline__segment report-timeline__segment--app report-series--${appOrder.get(segment.app) ?? 0}`
                        : "report-timeline__segment report-timeline__segment--idle"
                    }
                    style={{
                      left: `${segment.left}%`,
                      width: `${Math.max(0.2, segment.width)}%`,
                    }}
                  />
                );
              })}
            </div>
            <div className="report-timeline-axis">
              {ticks.map((tick) => (
                <span key={tick}>{hourLabel(tick)}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="dashboard-empty-inline">{t("activity.empty")}</div>
        )}
      </Card>

      <Card>
        <div className="report-card__head">
          <h2 className="report-card__title">{t("activity.breakdown")}</h2>
          <p className="report-card__subtitle">{t("activity.v1.breakdownSubtitle")}</p>
        </div>

        <div className="report-app-list">
          {breakdown.slice(0, 8).map((item, index) => (
            <div className="report-app-row" key={item.app_name}>
              <div className={`report-app-name report-series--${index % 6}`}>
                <span className="report-app-name__dot" />
                <span className="report-app-name__text" title={item.app_name}>
                  {item.app_name}
                </span>
              </div>
              <div className="report-app-track">
                <div
                  className={`report-app-fill report-series--${index % 6}`}
                  style={{
                    width: `${Math.max(2, (item.duration_s / maxDuration) * 100)}%`,
                  }}
                />
              </div>
              <div className="report-app-value">{fmtHM(item.duration_s)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
