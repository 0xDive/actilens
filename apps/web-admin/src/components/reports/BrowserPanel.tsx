import { useTranslation } from "react-i18next";
import type { BrowserVisit } from "../../api/types";
import { fmtDuration } from "../../format";
import { EmptyState } from "../ds";

const hhmm = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function BrowserPanel({ visits }: { visits: BrowserVisit[] }) {
  const { t } = useTranslation("reports");

  if (visits.length === 0) {
    return (
      <EmptyState
        title={t("browser.empty")}
        description={t("browser.v1.emptyDescription")}
      />
    );
  }

  const rows = [...visits].sort((a, b) => b.ts - a.ts);

  return (
    <div className="ds-table-wrap">
      <table className="ds-table">
        <thead>
          <tr>
            <th>{t("browser.table.domain")}</th>
            <th>{t("browser.table.time")}</th>
            <th>{t("browser.table.duration")}</th>
            <th>{t("browser.table.browser")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((visit, index) => {
            const domain = domainOf(visit.url);
            return (
              <tr key={`${visit.ts}-${index}`}>
                <td>
                  <div className="report-domain">
                    <span className="report-domain__mark">
                      {domain.charAt(0).toUpperCase()}
                    </span>
                    <span className="report-domain__name" title={visit.page_title || visit.url}>
                      {domain}
                    </span>
                  </div>
                </td>
                <td>{hhmm(visit.ts)}</td>
                <td className="ds-num">{fmtDuration(visit.duration_s)}</td>
                <td>{visit.browser || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
