import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import MenuLien from "../components/MenuLien";
import useLienLigne from "../hooks/useLienLigne";

const Ligne = () => {
  const lienLigne = useLienLigne();
  return (
    <table><tbody>
      <tr {...lienLigne("/employees/MAT-1")}>
        <td>Dupont</td>
        <td><button>Action</button></td>
      </tr>
    </tbody></table>
  );
};

const rendre = () => render(
  <MemoryRouter><ThemeProvider><Ligne /><MenuLien /></ThemeProvider></MemoryRouter>,
);

test("clic droit sur une ligne : menu « Ouvrir dans un nouvel onglet »", () => {
  const ouvrir = jest.spyOn(window, "open").mockImplementation(() => null);
  rendre();
  fireEvent.contextMenu(screen.getByText("Dupont"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ouvrir dans un nouvel onglet" }));
  expect(ouvrir).toHaveBeenCalledWith("/employees/MAT-1", "_blank", "noopener");
  ouvrir.mockRestore();
});

test("clic droit sur un bouton de la ligne : menu natif conservé", () => {
  rendre();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Action" }));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("Échap ferme le menu", () => {
  rendre();
  fireEvent.contextMenu(screen.getByText("Dupont"));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
