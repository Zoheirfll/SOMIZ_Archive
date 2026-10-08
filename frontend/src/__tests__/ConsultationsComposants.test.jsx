import React, { useState } from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";

import DureeSelect from "../components/consultations/DureeSelect";
import FileDropZone from "../components/consultations/FileDropZone";
import { formatDuree, formatTaille, LIMITE_MAX_HEURES } from "../utils/consultations";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

describe("formatDuree / formatTaille", () => {
  test("formatDuree : heures ou jours entiers, avec pluriel", () => {
    expect(formatDuree(1)).toBe("1 heure");
    expect(formatDuree(5)).toBe("5 heures");
    expect(formatDuree(24)).toBe("1 jour");
    expect(formatDuree(72)).toBe("3 jours");
    expect(formatDuree(36)).toBe("36 heures");
  });

  test("formatTaille : Ko sous 1 Mo, sinon Mo avec virgule", () => {
    expect(formatTaille(10)).toBe("1 Ko");
    expect(formatTaille(512 * 1024)).toBe("512 Ko");
    expect(formatTaille(1.5 * 1024 * 1024)).toBe("1,5 Mo");
  });
});

describe("DureeSelect", () => {
  test("un raccourci renvoie son nombre d'heures", async () => {
    const onChange = jest.fn();
    render(<DureeSelect value={24} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Durée de la consultation"), "72");
    expect(onChange).toHaveBeenCalledWith(72);
    expect(screen.queryByLabelText("Durée personnalisée")).not.toBeInTheDocument();
  });

  test("durée personnalisée en heures puis en jours", async () => {
    const onChange = jest.fn();
    render(<DureeSelect value={24} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Durée de la consultation"), "custom");
    const saisie = screen.getByLabelText("Durée personnalisée");
    await userEvent.clear(saisie);
    await userEvent.type(saisie, "5");
    expect(onChange).toHaveBeenLastCalledWith(5);
    await userEvent.selectOptions(screen.getByLabelText("Unité de durée"), "jours");
    expect(onChange).toHaveBeenLastCalledWith(120);                     // 5 jours
  });

  test("au-delà du plafond : borné et signalé", async () => {
    const onChange = jest.fn();
    render(<DureeSelect value={24} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Durée de la consultation"), "custom");
    const saisie = screen.getByLabelText("Durée personnalisée");
    await userEvent.clear(saisie);
    await userEvent.type(saisie, "9999");
    expect(onChange).toHaveBeenLastCalledWith(LIMITE_MAX_HEURES);
    expect(screen.getByText(/Maximum 30 jours/)).toBeInTheDocument();
  });

  test("saisie vide ou nulle : avertissement, jamais une durée invalide envoyée", async () => {
    const onChange = jest.fn();
    render(<DureeSelect value={24} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Durée de la consultation"), "custom");
    onChange.mockClear();
    const saisie = screen.getByLabelText("Durée personnalisée");
    await userEvent.clear(saisie);
    expect(screen.getByText(/au moins 1 heure/)).toBeInTheDocument();
    await userEvent.type(saisie, "0");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("une valeur hors raccourcis s'ouvre directement en mode personnalisé", () => {
    render(<DureeSelect value={36} onChange={jest.fn()} />);
    expect(screen.getByLabelText("Durée personnalisée")).toHaveValue(36);
  });
});

function Zone(props) {
  const [files, setFiles] = useState([]);
  return <FileDropZone files={files} onChange={setFiles} maxMo={1} {...props} />;
}

const fichier = (nom, octets) => new File([new ArrayBuffer(octets)], nom, { type: "application/pdf" });

describe("FileDropZone", () => {
  test("ajoute des fichiers, affiche leur taille, permet de les retirer", async () => {
    render(<Zone />);
    await userEvent.upload(screen.getByLabelText("Choisir des fichiers"), [fichier("a.pdf", 2048), fichier("b.pdf", 4096)]);
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("2 Ko")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Retirer a.pdf"));
    expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });

  test("signale un fichier trop volumineux", async () => {
    render(<Zone />);
    await userEvent.upload(screen.getByLabelText("Choisir des fichiers"), fichier("gros.pdf", 2 * 1024 * 1024));
    expect(screen.getByText(/dépasse 1 Mo/)).toBeInTheDocument();
  });

  test("ignore un doublon et plafonne le nombre de fichiers", async () => {
    render(<Zone maxFichiers={2} />);
    const input = screen.getByLabelText("Choisir des fichiers");
    await userEvent.upload(input, fichier("a.pdf", 100));
    await userEvent.upload(input, fichier("a.pdf", 100));               // doublon
    expect(screen.getAllByText("a.pdf")).toHaveLength(1);
    await userEvent.upload(input, [fichier("b.pdf", 100), fichier("c.pdf", 100)]);
    expect(screen.getByText(/Maximum 2 fichiers/)).toBeInTheDocument();
    expect(screen.queryByText("c.pdf")).not.toBeInTheDocument();
  });

  test("la zone annonce la limite de taille", () => {
    render(<Zone />);
    expect(screen.getByText(/1 Mo max par fichier/)).toBeInTheDocument();
  });
});
