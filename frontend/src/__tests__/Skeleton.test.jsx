import { render as rtlRender, screen } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import Skeleton from "../components/Skeleton";

const render = (ui, options) => rtlRender(ui, { wrapper: ThemeProvider, ...options });

describe("Skeleton", () => {
  test("rend un élément avec data-testid skeleton", () => {
    render(<Skeleton />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  test("applique les dimensions personnalisées", () => {
    render(<Skeleton width={120} height={20} />);
    const el = screen.getByTestId("skeleton");
    expect(el).toHaveStyle({ width: "120px", height: "20px" });
  });

  test("applique les dimensions par défaut", () => {
    render(<Skeleton />);
    const el = screen.getByTestId("skeleton");
    expect(el).toHaveStyle({ height: "16px" });
  });
});
