import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KeystrokeBucket } from "../../api/types";
import { Card, EmptyState } from "../ds";

const BAR_WIDTH = 22;
const STEP = 36;
const PAD = 18;
const HEIGHT = 220;
const TOP = 18;
const BOTTOM = 184;
const CHART_HEIGHT = BOTTOM - TOP;

export function KeystrokePanel({ buckets }: { buckets: KeystrokeBucket[] }) {
  const { t } = useTranslation("reports");
  const [selected, setSelected] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = selected ?? buckets.length - 1;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || buckets.length === 0) return;
    const center = PAD + active * STEP + BAR_WIDTH / 2;
    container.scrollTo({
      left: Math.max(0, center - container.clientWidth / 2),
      behavior: "smooth",
    });
  }, [active, buckets.length]);

  if (buckets.length === 0) {
    return (
      <EmptyState
        title={t("keystrokes.empty")}
        description={t("keystrokes.privacyNote")}
      />
    );
  }

  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const svgWidth = PAD + buckets.length * STEP + PAD;

  const hour = (timestamp: number) =>
    String(new Date(timestamp * 1000).getHours()).padStart(2, "0");

  const time = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
  };

  return (
    <Card>
      <div className="report-card__head">
        <h2 className="report-card__title">{t("keystrokes.title")}</h2>
        <p className="report-card__subtitle">{t("keystrokes.v1.subtitle")}</p>
      </div>

      <div className="report-keystroke-total">
        <span className="report-keystroke-total__number ds-num">
          {total.toLocaleString()}
        </span>
        <span className="report-keystroke-total__label">
          {t("keystrokes.keypresses")}
        </span>
      </div>

      <div className="report-keystroke-chart" ref={scrollRef}>
        <svg width={svgWidth} height={HEIGHT} aria-label={t("keystrokes.title")}>
          <line
            x1={PAD}
            y1={BOTTOM}
            x2={svgWidth - PAD}
            y2={BOTTOM}
            stroke="var(--ds-border-subtle)"
          />
          {buckets.map((bucket, index) => {
            const barHeight = Math.max(2, (bucket.count / max) * CHART_HEIGHT);
            const x = PAD + index * STEP;
            const y = BOTTOM - barHeight;
            const isActive = index === active;
            return (
              <g key={bucket.ts_bucket}>
                <rect
                  x={x}
                  y={y}
                  width={BAR_WIDTH}
                  height={barHeight}
                  rx={5}
                  fill={isActive ? "var(--ds-brand)" : "var(--ds-info)"}
                  opacity={selected !== null && index !== active ? 0.42 : 1}
                  style={{ cursor: "pointer" }}
                  tabIndex={0}
                  role="button"
                  aria-label={t("keystrokes.tooltip", {
                    time: time(bucket.ts_bucket),
                    count: bucket.count,
                  })}
                  onClick={() => setSelected(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(index);
                    }
                  }}
                />
                {index % 3 === 0 && (
                  <text
                    x={x + BAR_WIDTH / 2}
                    y={207}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--ds-text-tertiary)"
                    fontFamily="var(--ds-font-sans)"
                  >
                    {hour(bucket.ts_bucket)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {buckets[active] && (
        <p className="report-privacy-note">
          {t("keystrokes.v1.selected", {
            time: time(buckets[active].ts_bucket),
            count: buckets[active].count,
          })}
        </p>
      )}
      <p className="report-privacy-note">{t("keystrokes.privacyNote")}</p>
    </Card>
  );
}
