import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import Breadcrumb from "../components/employees/Breadcrumb";

const renderBc = (props) =>
  render(<Breadcrumb {...props} />, { wrapper: ThemeProvider });

describe("Breadcrumb — variant hero", () => {
  test("variant par défaut : dernier item non cliquable, les autres appellent onClick", () => {
    const onClick = jest.fn();
    renderBc({ items: [{ label: "Personnel", onClick }, { label: "Jean Dupont" }] });
    fireEvent.click(screen.getByText("Personnel"));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText("Jean Dupont").closest("button")).toBeDisabled();
  });

  test("variant hero : rend un fond translucide blanc, comportement clic identique", () => {
    const onClick = jest.fn();
    renderBc({ items: [{ label: "Personnel", onClick }, { label: "Jean Dupont" }], variant: "hero" });
    const first = screen.getByText("Personnel").closest("button");
    expect(first).toHaveStyle({ color: "rgba(255,255,255,0.8)" });
    fireEvent.click(first);
    expect(onClick).toHaveBeenCalled();
  });
});
