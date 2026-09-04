import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import InfoNotice from "../components/InfoNotice";

const render = (ui, options) => rtlRender(ui, { wrapper: ThemeProvider, ...options });

describe("InfoNotice", () => {
  it("renders nothing when text is not provided", () => {
    const { container } = render(<InfoNotice text={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the popover text on click and hides it on outside click", () => {
    render(<InfoNotice text="Ceci explique la page." />);
    expect(screen.queryByText("Ceci explique la page.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aide" }));
    expect(screen.getByText("Ceci explique la page.")).toBeInTheDocument();

    const overlay = document.body.querySelector('div[style*="position: fixed"][style*="inset"]');
    fireEvent.click(overlay);
    expect(screen.queryByText("Ceci explique la page.")).not.toBeInTheDocument();
  });
});
