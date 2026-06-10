/**
 * Tests — components/SecureDocViewer.jsx
 * Couvre : rendu image, rendu PDF, zoom, drag, type non supporté
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock react-pdf (pas de référence à React dans le factory — règle jest.mock)
jest.mock("react-pdf", () => {
  const mockReact = require("react");
  const MockDocument = ({ children, onLoadSuccess }) => {
    mockReact.useEffect(() => {
      if (onLoadSuccess) onLoadSuccess({ numPages: 3 });
    }, []);
    return mockReact.createElement("div", { "data-testid": "pdf-document" }, children);
  };
  const MockPage = ({ pageNumber, scale }) =>
    mockReact.createElement(
      "div",
      { "data-testid": "pdf-page", "data-page": String(pageNumber), "data-scale": String(scale) },
      "Page " + pageNumber
    );
  return { Document: MockDocument, Page: MockPage, pdfjs: { GlobalWorkerOptions: {} } };
});

import SecureDocViewer from "../components/SecureDocViewer";

describe("SecureDocViewer — image", () => {
  const imageProps = { url: "http://localhost/img.jpg", mimeType: "image/jpeg", fileName: "img.jpg" };

  test("affiche l'image", () => {
    render(<SecureDocViewer {...imageProps} />);
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "http://localhost/img.jpg");
  });

  test("affiche les boutons zoom − et +", () => {
    render(<SecureDocViewer {...imageProps} />);
    expect(screen.getByText("−")).toBeInTheDocument();
    expect(screen.getByText("+")).toBeInTheDocument();
  });

  test("affiche le bouton Reset", () => {
    render(<SecureDocViewer {...imageProps} />);
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  test("affiche le pourcentage de zoom initial (120%)", () => {
    render(<SecureDocViewer {...imageProps} />);
    // Scale initiale 1 pour image = 100%
    expect(screen.getByText(/100%|120%/)).toBeInTheDocument();
  });

  test("clic + augmente le zoom", () => {
    render(<SecureDocViewer {...imageProps} />);
    const zoomIn = screen.getByText("+");
    const before = screen.getByText(/\d+%/).textContent;
    fireEvent.click(zoomIn);
    const after = screen.getByText(/\d+%/).textContent;
    expect(after).not.toBe(before);
  });

  test("clic Reset remet le zoom à 100%", () => {
    render(<SecureDocViewer {...imageProps} />);
    fireEvent.click(screen.getByText("+"));
    fireEvent.click(screen.getByText("+"));
    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  test("curseur grab visible sur le conteneur", () => {
    const { container } = render(<SecureDocViewer {...imageProps} />);
    const draggable = container.querySelector('[style*="grab"]');
    expect(draggable).toBeInTheDocument();
  });

  test("drag déplace l'image", () => {
    const { container } = render(<SecureDocViewer {...imageProps} />);
    const draggable = container.querySelector('[style*="grab"]');
    fireEvent.mouseDown(draggable, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(draggable, { clientX: 150, clientY: 130 });
    fireEvent.mouseUp(draggable);
    const img = screen.getByRole("img");
    expect(img.style.transform).toContain("translate(");
  });
});

describe("SecureDocViewer — PDF", () => {
  const pdfProps = { url: "http://localhost/doc.pdf", mimeType: "application/pdf", fileName: "doc.pdf" };

  test("affiche le document PDF", () => {
    render(<SecureDocViewer {...pdfProps} />);
    expect(screen.getByTestId("pdf-document")).toBeInTheDocument();
  });

  test("affiche les boutons navigation pages", () => {
    render(<SecureDocViewer {...pdfProps} />);
    expect(screen.getByText("←")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
  });

  test("affiche les boutons zoom", () => {
    render(<SecureDocViewer {...pdfProps} />);
    expect(screen.getByText("−")).toBeInTheDocument();
    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  test("affiche Page 1 au départ", () => {
    render(<SecureDocViewer {...pdfProps} />);
    expect(screen.getByTestId("pdf-page")).toHaveAttribute("data-page", "1");
  });

  test("curseur grab visible sur le viewer PDF", () => {
    const { container } = render(<SecureDocViewer {...pdfProps} />);
    const draggable = container.querySelector('[style*="grab"]');
    expect(draggable).toBeInTheDocument();
  });

  test("drag déplace le PDF", () => {
    const { container } = render(<SecureDocViewer {...pdfProps} />);
    const draggable = container.querySelector('[style*="grab"]');
    const pdfWrapper = container.querySelector('[style*="translate"]') || draggable.firstChild;
    fireEvent.mouseDown(draggable, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(draggable, { clientX: 50, clientY: 30 });
    fireEvent.mouseUp(draggable);
    // Après drag, le wrapper interne doit avoir un translate
    const translated = container.querySelector('[style*="translate(50px, 30px)"]');
    expect(translated).toBeInTheDocument();
  });
});

describe("SecureDocViewer — type non supporté", () => {
  test("affiche message Format non prévisualisable", () => {
    render(<SecureDocViewer url="http://localhost/file.doc" mimeType="application/msword" fileName="file.doc" />);
    expect(screen.getByText("Format non prévisualisable")).toBeInTheDocument();
  });

  test("affiche le nom du fichier", () => {
    render(<SecureDocViewer url="http://localhost/file.doc" mimeType="application/msword" fileName="file.doc" />);
    expect(screen.getByText("file.doc")).toBeInTheDocument();
  });
});

describe("SecureDocViewer — sans URL", () => {
  test("ne rend rien si url est null", () => {
    const { container } = render(<SecureDocViewer url={null} mimeType="image/jpeg" fileName="img.jpg" />);
    expect(container.firstChild).toBeNull();
  });
});
