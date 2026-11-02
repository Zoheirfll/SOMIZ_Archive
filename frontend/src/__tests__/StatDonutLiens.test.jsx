import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import StatDonutChart from "../components/charts/StatDonutChart";

jest.mock("recharts", () => {
  const R = jest.requireActual("recharts");
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 300, height: 200 }}>{children}</div> };
});

const data = [{ nom: "Direction RH", count: 4, slug: "dir-rh" }, { nom: "Finance", count: 2, slug: "fin" }];

test("légende : chaque entrée est un vrai lien, le clic simple garde l'action", () => {
  const onSliceClick = jest.fn();
  render(
    <MemoryRouter><ThemeProvider>
      <StatDonutChart data={data} onSliceClick={onSliceClick} urlDe={(e) => `/employees?direction=${e.slug}`} />
    </ThemeProvider></MemoryRouter>,
  );
  const lien = screen.getByText("Direction RH").closest("a");
  expect(lien).toHaveAttribute("href", "/employees?direction=dir-rh");
  fireEvent.click(lien);
  expect(onSliceClick).toHaveBeenCalledWith(expect.objectContaining({ slug: "dir-rh" }));
});

test("Ctrl+clic sur un lien de légende : pas d'action d'état (nouvel onglet natif)", () => {
  const onSliceClick = jest.fn();
  render(
    <MemoryRouter><ThemeProvider>
      <StatDonutChart data={data} onSliceClick={onSliceClick} urlDe={(e) => `/employees?direction=${e.slug}`} />
    </ThemeProvider></MemoryRouter>,
  );
  fireEvent.click(screen.getByText("Finance").closest("a"), { ctrlKey: true });
  expect(onSliceClick).not.toHaveBeenCalled();
});
