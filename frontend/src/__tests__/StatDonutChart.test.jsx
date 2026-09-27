import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import StatDonutChart from "../components/charts/StatDonutChart";

const renderChart = (props) =>
  render(<StatDonutChart {...props} />, { wrapper: ThemeProvider });

const manyEntries = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, nom: `Poste ${i}`, count: i + 1 }));

describe("StatDonutChart — recherche", () => {
  test("n'affiche pas de champ de recherche pour peu d'entrées", () => {
    renderChart({ data: [{ id: "d1", nom: "Direction A", count: 5 }] });
    expect(screen.queryByPlaceholderText("Rechercher...")).not.toBeInTheDocument();
  });

  test("affiche un champ de recherche au-delà de 8 entrées", () => {
    renderChart({ data: manyEntries });
    expect(screen.getByPlaceholderText("Rechercher...")).toBeInTheDocument();
  });

  test("filtre la légende selon le texte recherché", () => {
    renderChart({ data: manyEntries });
    fireEvent.change(screen.getByPlaceholderText("Rechercher..."), { target: { value: "Poste 3" } });
    expect(screen.getByText("Poste 3")).toBeInTheDocument();
    expect(screen.queryByText("Poste 1")).not.toBeInTheDocument();
  });

  test("affiche 'Aucun résultat.' si rien ne correspond", () => {
    renderChart({ data: manyEntries });
    fireEvent.change(screen.getByPlaceholderText("Rechercher..."), { target: { value: "zzz" } });
    expect(screen.getByText("Aucun résultat.")).toBeInTheDocument();
  });

  test("le total au centre ne change pas pendant une recherche", () => {
    renderChart({ data: manyEntries });
    const total = manyEntries.reduce((sum, d) => sum + d.count, 0);
    expect(screen.getByText(String(total))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Rechercher..."), { target: { value: "Poste 3" } });
    expect(screen.getByText(String(total))).toBeInTheDocument();
  });
});
