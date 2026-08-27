import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanImportModal, { buildPageList } from "../components/ScanImportModal";
import api from "../services/api";

jest.mock("react-pdf", () => {
  const React = require("react");
  return {
    // onLoadSuccess must fire once per mount (like the real react-pdf,
    // which loads via effect) — calling it directly in the render body
    // causes an infinite render loop once the parent uses it to drive
    // state (setPageCounts -> re-render -> onLoadSuccess -> ...).
    Document: ({ children, onLoadSuccess }) => {
      React.useEffect(() => {
        onLoadSuccess && onLoadSuccess({ numPages: 3 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement("div", { "data-testid": "pdf-document" }, children);
    },
    Page: ({ pageNumber }) => React.createElement("div", { "data-testid": `pdf-page-${pageNumber}` }),
    pdfjs: { GlobalWorkerOptions: {} },
  };
});

jest.mock("../services/api", () => ({
  post: jest.fn(),
}));

describe("buildPageList", () => {
  it("returns one page entry per PDF page", () => {
    const files = [{ name: "scan.pdf", type: "application/pdf" }];
    const pageCounts = [3];
    const result = buildPageList(files, pageCounts);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ fileIndex: 0, pageNum: 1, fileName: "scan.pdf" });
    expect(result[2]).toMatchObject({ fileIndex: 0, pageNum: 3, fileName: "scan.pdf" });
  });

  it("returns a single entry for an image file", () => {
    const files = [{ name: "photo.jpg", type: "image/jpeg" }];
    const pageCounts = [1];
    const result = buildPageList(files, pageCounts);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fileIndex: 0, pageNum: 1, isImage: true });
  });

  it("concatenates entries across multiple files in order", () => {
    const files = [
      { name: "a.pdf", type: "application/pdf" },
      { name: "b.jpg", type: "image/jpeg" },
    ];
    const pageCounts = [2, 1];
    const result = buildPageList(files, pageCounts);
    expect(result.map((p) => `${p.fileIndex}-${p.pageNum}`)).toEqual([
      "0-1", "0-2", "1-1",
    ]);
  });
});

const flushPdfLoad = async () => {
  await waitFor(() => expect(screen.getAllByTestId("pdf-document").length).toBeGreaterThan(0));
};

const selectFile = async (input, file) => {
  await userEvent.upload(input, file);
};

const baseTypes = [
  { id: "type-a", code: "CV", nom: "CV", parent_nom: null, is_categorie: false },
  { id: "type-b", code: "DIPLOME", nom: "Diplôme", parent_nom: null, is_categorie: false },
];

describe("ScanImportModal - sélection et groupes", () => {
  it("clicking one page selects only that page", async () => {
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={baseTypes}
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await selectFile(input, file);
    await flushPdfLoad();

    const firstThumb = await screen.findByTestId("scan-page-0-1");
    await userEvent.click(firstThumb);

    expect(screen.getByTestId("scan-page-0-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-2")).toHaveAttribute("data-selected", "false");
    expect(screen.getByTestId("scan-page-0-3")).toHaveAttribute("data-selected", "false");
  });

  it("'Sélectionner tout le fichier' selects every page of the clicked page's source file", async () => {
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={baseTypes}
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await selectFile(input, file);
    await flushPdfLoad();

    const firstThumb = await screen.findByTestId("scan-page-0-1");
    await userEvent.click(firstThumb);
    await userEvent.click(screen.getByText(/sélectionner tout le fichier/i));

    expect(screen.getByTestId("scan-page-0-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-2")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-3")).toHaveAttribute("data-selected", "true");
  });

  it("shift-click narrows selection to a specific page range within the file", async () => {
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={baseTypes}
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await selectFile(input, file);
    await flushPdfLoad();

    const page1 = await screen.findByTestId("scan-page-0-1");
    const page2 = screen.getByTestId("scan-page-0-2");
    await userEvent.click(page1);
    fireEvent.click(page2, { shiftKey: true });

    expect(screen.getByTestId("scan-page-0-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-2")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-3")).toHaveAttribute("data-selected", "false");
  });

  it("assigning a type to a selection creates a highlighted group", async () => {
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={baseTypes}
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await selectFile(input, file);
    await flushPdfLoad();

    const page1 = await screen.findByTestId("scan-page-0-1");
    await userEvent.click(page1);
    await userEvent.click(screen.getByText(/sélectionner tout le fichier/i));

    const select = screen.getByTestId("scan-assign-type-select");
    await userEvent.selectOptions(select, "type-a");
    await userEvent.click(screen.getByTestId("scan-assign-button"));

    expect(await screen.findByText(/CV — 3 page/i)).toBeInTheDocument();
  });
});

describe("ScanImportModal - soumission", () => {
  const typesDocumentsList = [
    { id: "type-a", code: "CV", nom: "CV", parent_nom: null, is_categorie: false },
  ];

  beforeEach(() => {
    api.post.mockReset();
  });

  it("submits the plan with correct file_index/pages and shows the summary", async () => {
    api.post.mockResolvedValue({
      data: { created: [{ type_doc_nom: "CV", document_id: "doc-1" }], failed: [] },
    });
    const onImported = jest.fn();
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={typesDocumentsList}
        onClose={jest.fn()}
        onImported={onImported}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await userEvent.upload(input, file);
    await flushPdfLoad();

    const page1 = await screen.findByTestId("scan-page-0-1");
    await userEvent.click(page1);
    await userEvent.click(screen.getByText(/sélectionner tout le fichier/i));
    await userEvent.click(screen.getByTestId("scan-assign-button"));

    await userEvent.click(screen.getByTestId("scan-import-submit"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, formData] = api.post.mock.calls[0];
    expect(url).toBe("/employees/EMP001/documents/scan-import/");
    const plan = JSON.parse(formData.get("plan"));
    expect(plan.groups[0]).toMatchObject({
      type_doc: "type-a",
      parts: [{ file_index: 0, pages: [1, 2, 3] }],
    });

    expect(await screen.findByText(/1 document.*importé/i)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
  });
});
