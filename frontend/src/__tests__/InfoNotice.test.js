import { render, screen, fireEvent } from "@testing-library/react";
import InfoNotice from "../components/InfoNotice";

describe("InfoNotice", () => {
  it("renders nothing when text is not provided", () => {
    const { container } = render(<InfoNotice text={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the popover text on click and hides it on outside click", () => {
    const { container } = render(<InfoNotice text="Ceci explique la page." />);
    expect(screen.queryByText("Ceci explique la page.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aide" }));
    expect(screen.getByText("Ceci explique la page.")).toBeInTheDocument();

    const overlay = container.querySelector('div[style*="position: fixed"]');
    fireEvent.click(overlay);
    expect(screen.queryByText("Ceci explique la page.")).not.toBeInTheDocument();
  });
});
