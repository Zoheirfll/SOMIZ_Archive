import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import StatHistogram from "../components/charts/StatHistogram";

const renderChart = (props) =>
  render(<StatHistogram {...props} />, { wrapper: ThemeProvider });

const data = [
  { tranche: "<25", count: 3, min: 0, max: 24 },
  { tranche: "25-34", count: 5, min: 25, max: 34 },
];

describe("StatHistogram — clic sur une barre", () => {
  test("appelle onBarClick avec l'entrée de la tranche cliquée", () => {
    const onBarClick = jest.fn();
    const { container } = renderChart({ data, xKey: "tranche", dataKey: "count", color: "#000", onBarClick });
    const bars = container.querySelectorAll(".recharts-bar-rectangle");
    fireEvent.click(bars[1]);
    expect(onBarClick).toHaveBeenCalledWith(expect.objectContaining({ tranche: "25-34", min: 25, max: 34 }));
  });
});
