import React from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import StatBarChart from "../components/StatBarChart";

const render = (ui, options) => rtlRender(ui, { wrapper: ThemeProvider, ...options });

const data = [
  { mois: "2026-01", recrutements: 4, archivages: 1 },
  { mois: "2026-02", recrutements: 2, archivages: 3 },
];

const series = [
  { key: "recrutements", label: "Recrutements", color: "#166534" },
  { key: "archivages", label: "Archivages", color: "#DC2626" },
];

test("renders one bar per data point per series and a legend entry per series", () => {
  render(<StatBarChart data={data} xKey="mois" series={series} />);
  expect(screen.getAllByTestId("stat-bar")).toHaveLength(4); // 2 points x 2 series
  expect(screen.getByText("Recrutements")).toBeInTheDocument();
  expect(screen.getByText("Archivages")).toBeInTheDocument();
});

test("renders an empty-state message when data is empty", () => {
  render(<StatBarChart data={[]} xKey="mois" series={series} />);
  expect(screen.getByText(/aucune donnée/i)).toBeInTheDocument();
});

test("supports horizontal orientation for a single series", () => {
  const pyramideData = [{ tranche: "25-34", count: 5 }, { tranche: "35-44", count: 8 }];
  render(
    <StatBarChart
      data={pyramideData}
      xKey="tranche"
      series={[{ key: "count", label: "Effectif", color: "#166534" }]}
      orientation="horizontal"
    />
  );
  expect(screen.getAllByTestId("stat-bar")).toHaveLength(2);
});
